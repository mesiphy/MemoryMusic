import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const NCM_CLI_PACKAGE_SPEC = '@music163/ncm-cli@0.1.6'

const MAX_ARGUMENTS = 16
const MAX_ARGUMENT_LENGTH = 2_000
const MAX_OUTPUT_BYTES = 12_000_000
const COMMAND_TIMEOUT_MS = 120_000
const WINDOWS_POWERSHELL_PATH = join(
  process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
)

export interface NcmCliCommandResult {
  found: boolean
  exitCode: number | null
  stdout: string
}

export type NcmCliCommandRunner = (arguments_: readonly string[]) => Promise<NcmCliCommandResult>

export class NcmCliRunnerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NcmCliRunnerError'
  }
}

const NCM_CLI_RUNNER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Write-RunnerResult($Value) {
  $json = $Value | ConvertTo-Json -Compress -Depth 4
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

function Find-Application([string[]]$Names) {
  foreach ($name in $Names) {
    $command = Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($command) {
      return [string]$command.Source
    }
  }
  return $null
}

$requestText = [Console]::In.ReadToEnd()
$request = $requestText | ConvertFrom-Json
$requestedArguments = @($request.arguments | ForEach-Object { [string]$_ })

$application = Find-Application @('ncm-cli.cmd', 'ncm-cli.exe', 'ncm-cli')
$prefixArguments = @()

if (-not $application) {
  $application = Find-Application @('pnpm.cmd', 'pnpm.exe', 'pnpm')
  if ($application) {
    $prefixArguments = @('dlx', '${NCM_CLI_PACKAGE_SPEC}')
  }
}

if (-not $application) {
  $application = Find-Application @('npx.cmd', 'npx.exe', 'npx')
  if ($application) {
    $prefixArguments = @('--yes', '${NCM_CLI_PACKAGE_SPEC}')
  }
}

if (-not $application) {
  Write-RunnerResult @{
    found = $false
    exitCode = $null
    stdout = ''
  }
  exit 0
}

$allArguments = @($prefixArguments) + @($requestedArguments)
$combinedLines = @(& $application @allArguments 2>&1)
$stdoutLines = @($combinedLines | Where-Object { $_ -is [string] })
if ($null -eq $LASTEXITCODE) {
  $exitCode = 0
} else {
  $exitCode = [int]$LASTEXITCODE
}

Write-RunnerResult @{
  found = $true
  exitCode = $exitCode
  stdout = [string]::Join([Environment]::NewLine, [string[]]$stdoutLines)
}
`

export async function runNcmCliCommand(
  arguments_: readonly string[]
): Promise<NcmCliCommandResult> {
  validateArguments(arguments_)

  const encodedScript = Buffer.from(NCM_CLI_RUNNER_SCRIPT, 'utf16le').toString('base64')
  const request = JSON.stringify({ arguments: arguments_ })

  return new Promise((resolve, reject) => {
    const child = spawn(
      WINDOWS_POWERSHELL_PATH,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript
      ],
      {
        cwd: homedir(),
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      }
    )

    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new NcmCliRunnerError('网易云官方 CLI 调用超时'))
    }, COMMAND_TIMEOUT_MS)

    const rejectSafely = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      reject(new NcmCliRunnerError('无法启动网易云官方 CLI'))
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (settled) return
      output += chunk
      if (Buffer.byteLength(output, 'utf8') > MAX_OUTPUT_BYTES) {
        rejectSafely()
      }
    })
    child.on('error', rejectSafely)
    child.stdin.on('error', rejectSafely)
    child.on('close', (exitCode) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (exitCode !== 0) {
        reject(new NcmCliRunnerError('网易云官方 CLI 启动器执行失败'))
        return
      }

      try {
        resolve(parseRunnerOutput(output))
      } catch {
        reject(new NcmCliRunnerError('网易云官方 CLI 启动器返回了无效结果'))
      }
    })

    child.stdin.end(request, 'utf8')
  })
}

function validateArguments(arguments_: readonly string[]): void {
  if (!Array.isArray(arguments_) || arguments_.length === 0 || arguments_.length > MAX_ARGUMENTS) {
    throw new NcmCliRunnerError('网易云官方 CLI 参数无效')
  }

  for (const argument of arguments_) {
    if (
      typeof argument !== 'string' ||
      argument.length === 0 ||
      argument.length > MAX_ARGUMENT_LENGTH ||
      /[\0\r\n]/u.test(argument)
    ) {
      throw new NcmCliRunnerError('网易云官方 CLI 参数无效')
    }
  }
}

function parseRunnerOutput(output: string): NcmCliCommandResult {
  const encodedResult = output.trim().split(/\r?\n/u).filter(Boolean).at(-1)
  if (!encodedResult) throw new NcmCliRunnerError('网易云官方 CLI 启动器未返回结果')

  const parsed = JSON.parse(Buffer.from(encodedResult, 'base64').toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new NcmCliRunnerError('网易云官方 CLI 启动器返回了无效结果')
  }

  const record = parsed as Record<string, unknown>
  const found = record.found
  const exitCode = record.exitCode
  const stdout = record.stdout
  if (
    typeof found !== 'boolean' ||
    (exitCode !== null && (typeof exitCode !== 'number' || !Number.isInteger(exitCode))) ||
    typeof stdout !== 'string' ||
    Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES
  ) {
    throw new NcmCliRunnerError('网易云官方 CLI 启动器返回了无效结果')
  }

  return { found, exitCode, stdout }
}
