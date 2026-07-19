import type {
  NowPlayingDto,
  PlaybackControlResultDto,
  PlaybackLaunchMethod
} from '../../shared/contracts'

export interface PlaybackTrack {
  provider: 'netease'
  providerTrackId: string
}

export interface PlaybackLaunchResult {
  method: PlaybackLaunchMethod
  protocolAttempted: boolean
  webUrl: string
}

export interface PlaybackAdapter {
  play(track: PlaybackTrack): Promise<PlaybackLaunchResult>
  openWeb(track: PlaybackTrack): Promise<PlaybackLaunchResult>
}

export interface MediaSessionAdapter {
  getNowPlaying(): Promise<NowPlayingDto | null>
  pause(): Promise<PlaybackControlResultDto>
  resume(): Promise<PlaybackControlResultDto>
  next(): Promise<PlaybackControlResultDto>
  previous(): Promise<PlaybackControlResultDto>
}

export class PlaybackAdapterError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'PlaybackAdapterError'
  }
}

export class UnsupportedPlaybackError extends PlaybackAdapterError {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedPlaybackError'
  }
}
