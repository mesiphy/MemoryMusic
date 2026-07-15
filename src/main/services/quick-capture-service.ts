import type {
  ApiErrorCode,
  ApiResult,
  NowPlayingDto,
  QuickCaptureInboxItemDto,
  QuickCaptureKind,
  QuickCaptureResultDto
} from '../../shared/contracts'
import type { MediaSessionAdapter } from '../playback/playback-adapter'
import { PlaybackAdapterError, UnsupportedPlaybackError } from '../playback/playback-adapter'
import { MusicRepository } from '../persistence/database'

type InputRecord = Record<string, unknown>

class QuickCaptureRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
  }
}

export class QuickCaptureService {
  constructor(
    private readonly repository: MusicRepository,
    private readonly mediaSessionAdapter: MediaSessionAdapter
  ) {}

  getContext(): Promise<ApiResult<NowPlayingDto | null>> {
    return this.execute('读取当前播放歌曲失败，请重试', () =>
      this.mediaSessionAdapter.getNowPlaying()
    )
  }

  capture(input: unknown): Promise<ApiResult<QuickCaptureResultDto>> {
    return this.execute('保存快速记录失败，请重试', async () => {
      const normalized = normalizeCaptureInput(input)
      const current = await this.mediaSessionAdapter.getNowPlaying()
      if (!current) {
        throw new QuickCaptureRequestError(
          'NOT_FOUND',
          '未检测到正在播放的歌曲，请先在网易云音乐中开始播放'
        )
      }
      const source = normalizeNowPlaying(current)

      return this.repository.transaction(() => {
        let track = this.repository.findTrackByTitleArtist(source.title, source.artist)
        const createdTrack = !track
        if (!track) {
          track = this.repository.createTrack({
            title: source.title,
            artist: source.artist,
            album: source.album,
            durationMs: null
          })
        }

        let inboxItemId: number | null = null
        if (normalized.kind === 'tag') {
          const tag =
            this.repository.getTagByName(normalized.text!) ??
            this.repository.createTag(normalized.text!)
          this.repository.tagTrack(track.id, tag.id)
          this.repository.touchTracks([track.id])
        } else if (normalized.kind === 'note') {
          this.repository.addNote(track.id, normalized.text!)
          this.repository.touchTracks([track.id])
        } else {
          inboxItemId = this.repository.addQuickCaptureInboxItem({
            trackId: track.id,
            sourceAppId: source.sourceAppId,
            sourceTitle: source.title,
            sourceArtist: source.artist,
            captureText: normalized.text
          }).id
        }

        return {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          createdTrack,
          kind: normalized.kind,
          captureText: normalized.text,
          inboxItemId
        }
      })
    })
  }

  listInbox(): Promise<ApiResult<QuickCaptureInboxItemDto[]>> {
    return this.execute('读取待整理箱失败，请重试', () =>
      this.repository
        .listPendingQuickCaptureInboxItems()
        .map((item) => {
          const track = this.repository.getTrack(item.trackId)
          if (!track) return null
          return {
            id: item.id,
            trackId: track.id,
            title: track.title,
            artist: track.artist,
            captureText: item.captureText,
            sourceAppId: item.sourceAppId,
            capturedAt: item.capturedAt
          }
        })
        .filter((item): item is QuickCaptureInboxItemDto => item !== null)
    )
  }

  resolveInbox(input: unknown): Promise<ApiResult<null>> {
    return this.execute('更新待整理箱失败，请重试', () => {
      const record = inputRecord(input)
      const id = positiveId(record.inboxItemId)
      if (!this.repository.resolveQuickCaptureInboxItem(id)) {
        throw new QuickCaptureRequestError('NOT_FOUND', '待整理记录不存在或已经处理')
      }
      return null
    })
  }

  private async execute<T>(
    fallbackMessage: string,
    operation: () => T | Promise<T>
  ): Promise<ApiResult<T>> {
    try {
      return { ok: true, value: await operation() }
    } catch (error) {
      if (error instanceof QuickCaptureRequestError) {
        return { ok: false, error: { code: error.code, message: error.message } }
      }
      if (error instanceof UnsupportedPlaybackError) {
        return { ok: false, error: { code: 'UNSUPPORTED', message: error.message } }
      }
      if (error instanceof PlaybackAdapterError) {
        return { ok: false, error: { code: 'PLAYBACK', message: error.message } }
      }
      return { ok: false, error: { code: 'STORAGE', message: fallbackMessage } }
    }
  }
}

function normalizeCaptureInput(input: unknown): {
  kind: QuickCaptureKind
  text: string | null
} {
  const record = inputRecord(input)
  const kind = record.kind
  if (kind !== 'tag' && kind !== 'note' && kind !== 'inbox') {
    throw new QuickCaptureRequestError('VALIDATION', '请选择标签、感悟或稍后整理')
  }
  if (typeof record.text !== 'string') {
    throw new QuickCaptureRequestError('VALIDATION', '快速记录内容格式无效')
  }
  const text = record.text.trim()
  const maxLength = kind === 'tag' ? 80 : 10000
  if (kind !== 'inbox' && !text) {
    throw new QuickCaptureRequestError(
      'VALIDATION',
      kind === 'tag' ? '请输入一个标签' : '请输入一句感悟'
    )
  }
  if (text.length > maxLength) {
    throw new QuickCaptureRequestError(
      'VALIDATION',
      kind === 'tag' ? '标签不能超过 80 个字符' : '记录不能超过 10000 个字符'
    )
  }
  return { kind, text: text || null }
}

function normalizeNowPlaying(value: NowPlayingDto): {
  sourceAppId: string
  title: string
  artist: string | null
  album: string | null
} {
  const title = value.title.trim()
  if (!title) {
    throw new QuickCaptureRequestError('VALIDATION', '当前媒体会话没有可用的歌曲名称')
  }
  if (title.length > 500) {
    throw new QuickCaptureRequestError('VALIDATION', '当前歌曲名称长度异常')
  }

  return {
    sourceAppId: value.sourceAppId.trim().slice(0, 500) || 'unknown-player',
    title,
    artist: normalizedOptional(value.artist, 500),
    album: normalizedOptional(value.albumTitle, 500)
  }
}

function normalizedOptional(value: string, maxLength: number): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw new QuickCaptureRequestError('VALIDATION', '当前媒体信息长度异常')
  }
  return normalized
}

function inputRecord(input: unknown): InputRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new QuickCaptureRequestError('VALIDATION', '提交的数据格式无效')
  }
  return input as InputRecord
}

function positiveId(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new QuickCaptureRequestError('VALIDATION', '待整理记录 ID 无效')
  }
  return Number(value)
}
