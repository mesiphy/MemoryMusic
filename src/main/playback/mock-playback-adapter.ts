import type { PlaybackLaunchResult } from './playback-adapter'
import type { PlaybackAdapter, PlaybackTrack } from './playback-adapter'

const defaultResult: PlaybackLaunchResult = {
  method: 'protocol',
  protocolAttempted: true,
  webUrl: 'https://music.163.com/song?id=0'
}

export class MockPlaybackAdapter implements PlaybackAdapter {
  readonly playCalls: PlaybackTrack[] = []
  readonly openWebCalls: PlaybackTrack[] = []
  playResult: PlaybackLaunchResult = defaultResult
  openWebResult: PlaybackLaunchResult = {
    ...defaultResult,
    method: 'web',
    protocolAttempted: false
  }
  playError: Error | null = null
  openWebError: Error | null = null

  async play(track: PlaybackTrack): Promise<PlaybackLaunchResult> {
    this.playCalls.push(track)
    if (this.playError) throw this.playError
    return this.playResult
  }

  async openWeb(track: PlaybackTrack): Promise<PlaybackLaunchResult> {
    this.openWebCalls.push(track)
    if (this.openWebError) throw this.openWebError
    return this.openWebResult
  }
}
