import type {
  ApiErrorCode,
  ApiResult,
  NowPlayingDto,
  PlaybackControlResultDto,
  PlaybackLaunchResultDto
} from '../../shared/contracts'
import type { MusicRepository, ProviderTrack } from '../persistence/database'
import {
  PlaybackAdapterError,
  UnsupportedPlaybackError,
  type MediaSessionAdapter,
  type PlaybackAdapter,
  type PlaybackLaunchResult,
  type PlaybackTrack
} from '../playback/playback-adapter'

type InputRecord = Record<string, unknown>

class PlaybackRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
  }
}

export class PlaybackService {
  constructor(
    private readonly repository: MusicRepository,
    private readonly playbackAdapter: PlaybackAdapter,
    private readonly mediaSessionAdapter: MediaSessionAdapter
  ) {}

  play(input: unknown): Promise<ApiResult<PlaybackLaunchResultDto>> {
    return this.execute('发起播放失败，请重试', async () => {
      const trackId = trackIdFromInput(input)
      const provider = this.requireNeteaseProvider(trackId)
      if (!provider.available) {
        throw new PlaybackRequestError(
          'PLAYBACK',
          '这首歌已被标记为平台不可用，可尝试打开网易云歌曲网页'
        )
      }
      return this.launchResultDto(trackId, await this.playbackAdapter.play(playbackTrack(provider)))
    })
  }

  openWeb(input: unknown): Promise<ApiResult<PlaybackLaunchResultDto>> {
    return this.execute('打开歌曲网页失败，请重试', async () => {
      const trackId = trackIdFromInput(input)
      const provider = this.requireNeteaseProvider(trackId)
      return this.launchResultDto(
        trackId,
        await this.playbackAdapter.openWeb(playbackTrack(provider))
      )
    })
  }

  getNowPlaying(): Promise<ApiResult<NowPlayingDto | null>> {
    return this.execute('读取当前播放歌曲失败，请重试', () =>
      this.mediaSessionAdapter.getNowPlaying()
    )
  }

  pause(): Promise<ApiResult<PlaybackControlResultDto>> {
    return this.control('暂停播放失败，请重试', () => this.mediaSessionAdapter.pause())
  }

  resume(): Promise<ApiResult<PlaybackControlResultDto>> {
    return this.control('继续播放失败，请重试', () => this.mediaSessionAdapter.resume())
  }

  next(): Promise<ApiResult<PlaybackControlResultDto>> {
    return this.control('切换到下一首失败，请重试', () => this.mediaSessionAdapter.next())
  }

  previous(): Promise<ApiResult<PlaybackControlResultDto>> {
    return this.control('切换到上一首失败，请重试', () => this.mediaSessionAdapter.previous())
  }

  private control(
    fallbackMessage: string,
    operation: () => Promise<PlaybackControlResultDto>
  ): Promise<ApiResult<PlaybackControlResultDto>> {
    return this.execute(fallbackMessage, operation)
  }

  private async execute<T>(
    fallbackMessage: string,
    operation: () => T | Promise<T>
  ): Promise<ApiResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      if (error instanceof PlaybackRequestError) {
        return { ok: false, error: { code: error.code, message: error.message } }
      }
      if (error instanceof UnsupportedPlaybackError) {
        return { ok: false, error: { code: 'UNSUPPORTED', message: error.message } }
      }
      if (error instanceof PlaybackAdapterError) {
        return { ok: false, error: { code: 'PLAYBACK', message: error.message } }
      }

      console.error(fallbackMessage, error)
      return { ok: false, error: { code: 'PLAYBACK', message: fallbackMessage } }
    }
  }

  private requireNeteaseProvider(trackId: number): ProviderTrack {
    if (!this.repository.getTrack(trackId)) {
      throw new PlaybackRequestError('NOT_FOUND', '歌曲不存在或已被删除')
    }

    const provider = this.repository
      .providerTracksForTrack(trackId)
      .find((item) => item.provider === 'netease')
    if (!provider) {
      throw new PlaybackRequestError('NOT_FOUND', '这首歌尚未填写网易云歌曲 ID')
    }
    return provider
  }

  private launchResultDto(trackId: number, result: PlaybackLaunchResult): PlaybackLaunchResultDto {
    const message =
      result.method === 'protocol'
        ? '已请求网易云音乐播放；若客户端未开始播放，可打开歌曲网页。'
        : result.protocolAttempted
          ? '网易云客户端不可用，已打开歌曲网页。'
          : '已打开网易云歌曲网页。'

    return { trackId, ...result, message }
  }
}

function trackIdFromInput(input: unknown): number {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PlaybackRequestError('VALIDATION', '提交的数据格式无效')
  }

  const value = (input as InputRecord).trackId
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new PlaybackRequestError('VALIDATION', '歌曲 ID 无效')
  }
  return Number(value)
}

function playbackTrack(provider: ProviderTrack): PlaybackTrack {
  return {
    provider: 'netease',
    providerTrackId: provider.providerTrackId
  }
}
