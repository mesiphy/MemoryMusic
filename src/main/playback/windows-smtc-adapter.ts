import { execFile } from 'node:child_process'
import type {
  NowPlayingDto,
  PlaybackControlResultDto,
  PlaybackStatus
} from '../../shared/contracts'
import {
  PlaybackAdapterError,
  UnsupportedPlaybackError,
  type MediaSessionAdapter
} from './playback-adapter'

export type SmtcCommand = 'status' | 'pause' | 'resume' | 'next' | 'previous'

export interface SmtcCommandOutput {
  accepted: boolean
  nowPlaying: NowPlayingDto | null
}

export type SmtcCommandRunner = (command: SmtcCommand) => Promise<SmtcCommandOutput>

const SMTC_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 } |
  Select-Object -First 1

function Await-WinRt($Operation, $ResultType) {
  $task = $asTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

function Write-JsonResult($Value) {
  $json = $Value | ConvertTo-Json -Compress -Depth 4
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}

$manager = Await-WinRt ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetSessions() |
  Where-Object { $_.SourceAppUserModelId -like '*cloudmusic*' } |
  Select-Object -First 1

if (-not $session) {
  Write-JsonResult @{ accepted = $false; nowPlaying = $null }
  exit 0
}

$accepted = $true
switch ('__ACTION__') {
  'pause' { $accepted = Await-WinRt ($session.TryPauseAsync()) ([bool]) }
  'resume' { $accepted = Await-WinRt ($session.TryPlayAsync()) ([bool]) }
  'next' { $accepted = Await-WinRt ($session.TrySkipNextAsync()) ([bool]) }
  'previous' { $accepted = Await-WinRt ($session.TrySkipPreviousAsync()) ([bool]) }
}

if ('__ACTION__' -ne 'status') {
  Start-Sleep -Milliseconds 200
}

$properties = Await-WinRt ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$status = switch ($session.GetPlaybackInfo().PlaybackStatus.ToString()) {
  'Playing' { 'playing' }
  'Paused' { 'paused' }
  'Stopped' { 'stopped' }
  'Closed' { 'closed' }
  default { 'unknown' }
}

Write-JsonResult @{
  accepted = [bool]$accepted
  nowPlaying = @{
    sourceAppId = [string]$session.SourceAppUserModelId
    title = [string]$properties.Title
    artist = [string]$properties.Artist
    albumTitle = [string]$properties.AlbumTitle
    status = $status
  }
}
`

export class WindowsSmtcAdapter implements MediaSessionAdapter {
  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly runCommand: SmtcCommandRunner = runWindowsSmtcCommand
  ) {}

  async getNowPlaying(): Promise<NowPlayingDto | null> {
    this.ensureWindows()
    return (await this.runCommand('status')).nowPlaying
  }

  pause(): Promise<PlaybackControlResultDto> {
    return this.control('pause')
  }

  resume(): Promise<PlaybackControlResultDto> {
    return this.control('resume')
  }

  next(): Promise<PlaybackControlResultDto> {
    return this.control('next')
  }

  previous(): Promise<PlaybackControlResultDto> {
    return this.control('previous')
  }

  private async control(
    command: Exclude<SmtcCommand, 'status'>
  ): Promise<PlaybackControlResultDto> {
    this.ensureWindows()
    return this.runCommand(command)
  }

  private ensureWindows(): void {
    if (this.platform !== 'win32') {
      throw new UnsupportedPlaybackError('当前系统不支持 Windows 媒体会话')
    }
  }
}

export async function runWindowsSmtcCommand(command: SmtcCommand): Promise<SmtcCommandOutput> {
  const script = SMTC_SCRIPT.replaceAll('__ACTION__', command)
  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  try {
    const stdout = await executePowerShell(encoded)
    return parseSmtcOutput(stdout)
  } catch (error) {
    if (error instanceof PlaybackAdapterError) throw error
    throw new PlaybackAdapterError('无法访问网易云音乐的 Windows 媒体会话', error)
  }
}

function executePowerShell(encodedScript: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript
      ],
      { encoding: 'utf8', timeout: 15_000, windowsHide: true, maxBuffer: 1_000_000 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout)
      }
    )
  })
}

function parseSmtcOutput(stdout: string): SmtcCommandOutput {
  const jsonLine = stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1)

  if (!jsonLine) throw new PlaybackAdapterError('Windows 媒体会话未返回结果')

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(jsonLine, 'base64').toString('utf8'))
  } catch (error) {
    throw new PlaybackAdapterError('Windows 媒体会话返回了无效结果', error)
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new PlaybackAdapterError('Windows 媒体会话返回了无效结果')
  }

  const record = parsed as Record<string, unknown>
  return {
    accepted: record.accepted === true,
    nowPlaying: parseNowPlaying(record.nowPlaying)
  }
}

function parseNowPlaying(value: unknown): NowPlayingDto | null {
  if (value == null) return null
  if (!value || typeof value !== 'object') {
    throw new PlaybackAdapterError('Windows 媒体会话的歌曲信息无效')
  }

  const record = value as Record<string, unknown>
  return {
    sourceAppId: stringValue(record.sourceAppId),
    title: stringValue(record.title),
    artist: stringValue(record.artist),
    albumTitle: stringValue(record.albumTitle),
    status: playbackStatus(record.status)
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function playbackStatus(value: unknown): PlaybackStatus {
  return value === 'playing' || value === 'paused' || value === 'stopped' || value === 'closed'
    ? value
    : 'unknown'
}
