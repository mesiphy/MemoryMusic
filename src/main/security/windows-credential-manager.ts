import { spawn } from 'node:child_process'

const NETEASE_CREDENTIAL_TARGET = 'MemoryMusic/Netease/OpenPlatform'

export interface NeteaseOpenPlatformCredentials {
  appId: string
  privateKey: string
}

export type CredentialManagerRequest =
  | { operation: 'write'; target: string; secret: string }
  | { operation: 'read'; target: string }
  | { operation: 'delete'; target: string }

export type CredentialManagerResponse =
  { ok: true; found?: boolean; secret?: string } | { ok: false; nativeCode?: number }

export interface CredentialManagerBackend {
  execute(request: CredentialManagerRequest): Promise<CredentialManagerResponse>
}

export class CredentialStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CredentialStoreError'
  }
}

export class WindowsCredentialManagerBackend implements CredentialManagerBackend {
  async execute(request: CredentialManagerRequest): Promise<CredentialManagerResponse> {
    if (process.platform !== 'win32') {
      throw new CredentialStoreError('Windows Credential Manager 仅在 Windows 上可用')
    }
    return runPowerShell(request)
  }
}

export class NeteaseCredentialStore {
  constructor(
    private readonly backend: CredentialManagerBackend = new WindowsCredentialManagerBackend(),
    private readonly target = NETEASE_CREDENTIAL_TARGET
  ) {}

  async save(credentials: NeteaseOpenPlatformCredentials): Promise<void> {
    const appId = requiredCredentialPart(credentials.appId, 'App ID', 500)
    const privateKey = requiredCredentialPart(credentials.privateKey, '私钥', 20000)
    const response = await this.backend.execute({
      operation: 'write',
      target: this.target,
      secret: JSON.stringify({ version: 1, appId, privateKey })
    })
    if (!response.ok) throw credentialOperationError('保存')
  }

  async load(): Promise<NeteaseOpenPlatformCredentials | null> {
    const response = await this.backend.execute({ operation: 'read', target: this.target })
    if (!response.ok) throw credentialOperationError('读取')
    if (!response.found) return null
    if (typeof response.secret !== 'string') throw credentialOperationError('读取')

    try {
      const parsed: unknown = JSON.parse(response.secret)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('invalid payload')
      }
      const record = parsed as Record<string, unknown>
      if (record.version !== 1) throw new Error('unsupported payload')
      return {
        appId: requiredCredentialPart(record.appId, 'App ID', 500),
        privateKey: requiredCredentialPart(record.privateKey, '私钥', 20000)
      }
    } catch (error) {
      if (error instanceof CredentialStoreError) throw error
      throw new CredentialStoreError('Credential Manager 中的网易云凭据格式无效')
    }
  }

  async clear(): Promise<void> {
    const response = await this.backend.execute({ operation: 'delete', target: this.target })
    if (!response.ok) throw credentialOperationError('删除')
  }
}

function requiredCredentialPart(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CredentialStoreError(`${label} 不能为空`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new CredentialStoreError(`${label} 长度异常`)
  return normalized
}

function credentialOperationError(operation: string): CredentialStoreError {
  return new CredentialStoreError(`无法在 Windows Credential Manager 中${operation}网易云凭据`)
}

function runPowerShell(request: CredentialManagerRequest): Promise<CredentialManagerResponse> {
  const encodedScript = Buffer.from(CREDENTIAL_MANAGER_SCRIPT, 'utf16le').toString('base64')

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = `${stdout}${chunk}`.slice(-10000)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-1000)
    })
    child.on('error', () => reject(credentialOperationError('访问')))
    child.on('close', (code) => {
      if (code !== 0) {
        void stderr
        reject(credentialOperationError('访问'))
        return
      }
      try {
        const parsed: unknown = JSON.parse(stdout.trim())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('invalid response')
        }
        resolve(parsed as CredentialManagerResponse)
      } catch {
        reject(credentialOperationError('访问'))
      }
    })

    child.stdin.end(JSON.stringify(request), 'utf8')
  })
}

const CREDENTIAL_MANAGER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

$nativeSource = @'
using System;
using System.Runtime.InteropServices;

public static class NativeCredentialMethods
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL credential, UInt32 flags);

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

    [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
    public static extern void CredFree(IntPtr buffer);
}
'@

$null = Add-Type -TypeDefinition $nativeSource -Language CSharp
$request = ([Console]::In.ReadToEnd() | ConvertFrom-Json)
$credentialTypeGeneric = [UInt32]1
$credentialPersistLocalMachine = [UInt32]2
$notFound = 1168

try {
    switch ([string]$request.operation) {
        'write' {
            $bytes = [Text.Encoding]::UTF8.GetBytes([string]$request.secret)
            $blob = [IntPtr]::Zero
            if ($bytes.Length -gt 0) {
                $blob = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
                [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $blob, $bytes.Length)
            }
            try {
                $credential = [NativeCredentialMethods+CREDENTIAL]::new()
                $credential.Type = $credentialTypeGeneric
                $credential.TargetName = [string]$request.target
                $credential.CredentialBlobSize = [UInt32]$bytes.Length
                $credential.CredentialBlob = $blob
                $credential.Persist = $credentialPersistLocalMachine
                $credential.UserName = 'MemoryMusic'
                if (-not [NativeCredentialMethods]::CredWrite([ref]$credential, 0)) {
                    throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
                }
                @{ ok = $true } | ConvertTo-Json -Compress
            }
            finally {
                if ($blob -ne [IntPtr]::Zero) {
                    $zeroes = New-Object byte[] $bytes.Length
                    [Runtime.InteropServices.Marshal]::Copy($zeroes, 0, $blob, $zeroes.Length)
                    [Runtime.InteropServices.Marshal]::FreeHGlobal($blob)
                }
            }
        }
        'read' {
            $pointer = [IntPtr]::Zero
            if (-not [NativeCredentialMethods]::CredRead([string]$request.target, $credentialTypeGeneric, 0, [ref]$pointer)) {
                $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                if ($code -eq $notFound) {
                    @{ ok = $true; found = $false } | ConvertTo-Json -Compress
                    break
                }
                throw [ComponentModel.Win32Exception]::new($code)
            }
            try {
                $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
                    $pointer,
                    [type][NativeCredentialMethods+CREDENTIAL]
                )
                $bytes = New-Object byte[] ([int]$credential.CredentialBlobSize)
                if ($bytes.Length -gt 0) {
                    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
                }
                @{ ok = $true; found = $true; secret = [Text.Encoding]::UTF8.GetString($bytes) } |
                    ConvertTo-Json -Compress
            }
            finally {
                [NativeCredentialMethods]::CredFree($pointer)
            }
        }
        'delete' {
            if (-not [NativeCredentialMethods]::CredDelete([string]$request.target, $credentialTypeGeneric, 0)) {
                $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
                if ($code -ne $notFound) {
                    throw [ComponentModel.Win32Exception]::new($code)
                }
            }
            @{ ok = $true } | ConvertTo-Json -Compress
        }
        default {
            throw 'Unsupported credential operation'
        }
    }
}
catch {
    @{ ok = $false; nativeCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error() } |
        ConvertTo-Json -Compress
    exit 1
}
`
