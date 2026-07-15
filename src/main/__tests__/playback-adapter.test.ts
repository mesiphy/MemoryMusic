import { describe, expect, it, vi } from 'vitest'
import { MockPlaybackAdapter } from '../playback/mock-playback-adapter'
import {
  neteasePlayProtocolUrl,
  neteaseWebUrl,
  NeteaseProtocolPlaybackAdapter
} from '../playback/netease-protocol-adapter'
import { WindowsSmtcAdapter, type SmtcCommand } from '../playback/windows-smtc-adapter'

const track = { provider: 'netease' as const, providerTrackId: '347230' }

describe('playback adapters', () => {
  it('builds the validated NetEase Base64 play command used by the Windows client', () => {
    const url = neteasePlayProtocolUrl(track.providerTrackId)
    const message = JSON.parse(Buffer.from(url.slice('orpheus://'.length), 'base64').toString())

    expect(message).toEqual({
      cmd: 'play',
      type: 'song',
      id: '347230',
      channel: 'MemoryMusic'
    })
    expect(neteaseWebUrl(track.providerTrackId)).toBe('https://music.163.com/song?id=347230')
    expect(() => neteasePlayProtocolUrl('../invalid')).toThrow('歌曲 ID 格式无效')
  })

  it('uses the registered protocol and exposes a manual web fallback', async () => {
    const openExternal = vi.fn(async (url: string) => {
      void url
    })
    const adapter = new NeteaseProtocolPlaybackAdapter({ openExternal })

    await expect(adapter.play(track)).resolves.toEqual({
      method: 'protocol',
      protocolAttempted: true,
      webUrl: 'https://music.163.com/song?id=347230'
    })
    expect(openExternal).toHaveBeenCalledWith(expect.stringMatching(/^orpheus:\/\//))

    await expect(adapter.openWeb(track)).resolves.toMatchObject({
      method: 'web',
      protocolAttempted: false
    })
    expect(openExternal).toHaveBeenLastCalledWith('https://music.163.com/song?id=347230')
  })

  it('opens the official web page automatically when the protocol has no handler', async () => {
    const openExternal = vi
      .fn<(url: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('No handler'))
      .mockResolvedValueOnce(undefined)
    const adapter = new NeteaseProtocolPlaybackAdapter({ openExternal })

    await expect(adapter.play(track)).resolves.toEqual({
      method: 'web',
      protocolAttempted: true,
      webUrl: 'https://music.163.com/song?id=347230'
    })
    expect(openExternal.mock.calls.map(([url]) => url)).toEqual([
      expect.stringMatching(/^orpheus:\/\//),
      'https://music.163.com/song?id=347230'
    ])
  })

  it('returns a stable error when neither protocol nor web page can open', async () => {
    const openExternal = vi.fn<(url: string) => Promise<void>>().mockRejectedValue(new Error('No'))
    const adapter = new NeteaseProtocolPlaybackAdapter({ openExternal })

    await expect(adapter.play(track)).rejects.toThrow('无法唤起网易云音乐或打开歌曲网页')
  })

  it('provides a configurable mock adapter for platform-neutral tests', async () => {
    const adapter = new MockPlaybackAdapter()
    adapter.playResult = {
      method: 'protocol',
      protocolAttempted: true,
      webUrl: 'https://music.163.com/song?id=347230'
    }

    await expect(adapter.play(track)).resolves.toEqual(adapter.playResult)
    expect(adapter.playCalls).toEqual([track])
  })

  it('keeps SMTC status and controls behind an independent media-session adapter', async () => {
    const nowPlaying = {
      sourceAppId: 'cloudmusic.exe',
      title: '海阔天空',
      artist: 'Beyond',
      albumTitle: '',
      status: 'playing' as const
    }
    const runCommand = vi.fn(async (command: SmtcCommand) => {
      expect(['status', 'pause', 'resume', 'next', 'previous']).toContain(command)
      return { accepted: true, nowPlaying }
    })
    const adapter = new WindowsSmtcAdapter('win32', runCommand)

    await expect(adapter.getNowPlaying()).resolves.toEqual(nowPlaying)
    await expect(adapter.pause()).resolves.toEqual({ accepted: true, nowPlaying })
    await expect(adapter.resume()).resolves.toEqual({ accepted: true, nowPlaying })
    await expect(adapter.next()).resolves.toEqual({ accepted: true, nowPlaying })
    await expect(adapter.previous()).resolves.toEqual({ accepted: true, nowPlaying })
    expect(runCommand.mock.calls.map(([command]) => command)).toEqual([
      'status',
      'pause',
      'resume',
      'next',
      'previous'
    ])
  })

  it('does not claim SMTC support outside Windows', async () => {
    const adapter = new WindowsSmtcAdapter('linux', vi.fn())
    await expect(adapter.getNowPlaying()).rejects.toThrow('不支持 Windows 媒体会话')
  })
})
