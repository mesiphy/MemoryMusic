import {
  PlaybackAdapterError,
  type PlaybackAdapter,
  type PlaybackLaunchResult,
  type PlaybackTrack
} from './playback-adapter'

const CHANNEL = 'MemoryMusic'

export interface ExternalOpener {
  openExternal(url: string): Promise<void>
}

export function neteaseWebUrl(providerTrackId: string): string {
  assertNeteaseTrackId(providerTrackId)
  return `https://music.163.com/song?id=${encodeURIComponent(providerTrackId)}`
}

export function neteasePlayProtocolUrl(providerTrackId: string): string {
  assertNeteaseTrackId(providerTrackId)
  const message = JSON.stringify({
    cmd: 'play',
    type: 'song',
    id: providerTrackId,
    channel: CHANNEL
  })
  return `orpheus://${Buffer.from(message, 'utf8').toString('base64')}`
}

export class NeteaseProtocolPlaybackAdapter implements PlaybackAdapter {
  constructor(private readonly opener: ExternalOpener) {}

  async play(track: PlaybackTrack): Promise<PlaybackLaunchResult> {
    const webUrl = neteaseWebUrl(track.providerTrackId)

    try {
      await this.opener.openExternal(neteasePlayProtocolUrl(track.providerTrackId))
      return { method: 'protocol', protocolAttempted: true, webUrl }
    } catch (protocolError) {
      try {
        await this.opener.openExternal(webUrl)
        return { method: 'web', protocolAttempted: true, webUrl }
      } catch (webError) {
        throw new PlaybackAdapterError('无法唤起网易云音乐或打开歌曲网页', {
          protocolError,
          webError
        })
      }
    }
  }

  async openWeb(track: PlaybackTrack): Promise<PlaybackLaunchResult> {
    const webUrl = neteaseWebUrl(track.providerTrackId)

    try {
      await this.opener.openExternal(webUrl)
      return { method: 'web', protocolAttempted: false, webUrl }
    } catch (error) {
      throw new PlaybackAdapterError('无法打开网易云歌曲网页', error)
    }
  }
}

function assertNeteaseTrackId(providerTrackId: string): void {
  if (!/^\d+$/.test(providerTrackId)) {
    throw new PlaybackAdapterError('网易云歌曲 ID 格式无效')
  }
}
