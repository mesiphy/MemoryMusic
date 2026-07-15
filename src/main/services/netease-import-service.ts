import type {
  ApiResult,
  NeteaseImportResultDto,
  NeteaseImportStatusDto,
  NeteaseSyncStateDto
} from '../../shared/contracts'
import {
  NeteaseDataAdapterError,
  type NeteaseDataAdapter,
  type NeteaseFavoriteTrack,
  type NeteaseFavoritesPage
} from '../import/netease-data-adapter'
import { MusicRepository, type SyncState, type SyncStateUpdate } from '../persistence/database'

const PROVIDER = 'netease'
const MAX_PAGES_PER_RUN = 1000

interface NormalizedFavoriteTrack {
  providerTrackId: string
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  url: string | null
  favoritedAt: string | null
  available: boolean
  metadataJson: string
}

interface PageStats {
  importedCount: number
  reusedTrackCount: number
  updatedMappingCount: number
  unavailableCount: number
}

export class NeteaseImportService {
  private syncing = false

  constructor(
    private readonly repository: MusicRepository,
    private readonly adapter: NeteaseDataAdapter,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getStatus(): Promise<ApiResult<NeteaseImportStatusDto>> {
    try {
      const availability = await this.adapter.getAvailability()
      return {
        ok: true,
        value: {
          available: availability.available,
          unavailableReason: availability.reason,
          sync: syncStateDto(this.repository.getSyncState(PROVIDER))
        }
      }
    } catch {
      return {
        ok: false,
        error: { code: 'SYNC', message: '无法检查网易云官方导入能力，请稍后重试' }
      }
    }
  }

  async syncFavorites(): Promise<ApiResult<NeteaseImportResultDto>> {
    if (this.syncing) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: '收藏同步正在进行，请等待当前任务完成' }
      }
    }

    this.syncing = true
    try {
      return await this.performSyncFavorites()
    } finally {
      this.syncing = false
    }
  }

  private async performSyncFavorites(): Promise<ApiResult<NeteaseImportResultDto>> {
    const attemptedAt = this.now().toISOString()
    let previous: SyncState | undefined
    try {
      previous = this.repository.getSyncState(PROVIDER)
    } catch {
      return syncStorageFailure()
    }
    let cursor = previous?.cursor ?? null

    try {
      const availability = await this.adapter.getAvailability()
      if (!availability.available) {
        return {
          ok: false,
          error: {
            code: 'UNSUPPORTED',
            message: availability.reason ?? '网易云官方导入尚不可用'
          }
        }
      }

      this.repository.saveSyncState(PROVIDER, runningState(previous, cursor, attemptedAt))

      const seenCursors = new Set(cursor ? [cursor] : [])
      const processedIds = new Set<string>()
      const totals: PageStats = emptyPageStats()
      let pageCount = 0

      while (pageCount < MAX_PAGES_PER_RUN) {
        const page = normalizePage(await this.adapter.fetchFavoritesPage(cursor))
        if (page.nextCursor !== null && seenCursors.has(page.nextCursor)) {
          throw new NeteaseDataAdapterError('网易云返回了重复分页游标，同步已安全停止')
        }

        const uniqueItems = page.items.filter((item) => {
          if (processedIds.has(item.providerTrackId)) return false
          processedIds.add(item.providerTrackId)
          return true
        })
        const completedAt = page.nextCursor === null ? this.now().toISOString() : null
        const nextCursor = page.nextCursor ?? page.checkpoint
        const pageStats = this.repository.transaction(() => {
          const stats = this.persistPage(uniqueItems, page.unavailableProviderTrackIds, attemptedAt)
          this.repository.saveSyncState(PROVIDER, {
            cursor: nextCursor,
            status: completedAt ? 'succeeded' : 'running',
            lastAttemptAt: attemptedAt,
            lastSuccessAt: completedAt ?? previous?.lastSuccessAt ?? null,
            failureReason: null,
            retryCount: completedAt ? 0 : (previous?.retryCount ?? 0)
          })
          return stats
        })

        addPageStats(totals, pageStats)
        pageCount += 1
        cursor = nextCursor

        if (page.nextCursor === null) {
          const state = this.repository.getSyncState(PROVIDER)!
          return {
            ok: true,
            value: {
              ...totals,
              processedCount: processedIds.size,
              pageCount,
              sync: syncStateDto(state)
            }
          }
        }

        seenCursors.add(page.nextCursor)
      }

      throw new NeteaseDataAdapterError('网易云分页数量异常，同步已安全停止')
    } catch (error) {
      const reason = safeFailureReason(error)
      try {
        this.repository.saveSyncState(PROVIDER, {
          cursor,
          status: 'failed',
          lastAttemptAt: attemptedAt,
          lastSuccessAt: previous?.lastSuccessAt ?? null,
          failureReason: reason,
          retryCount: (previous?.retryCount ?? 0) + 1
        })
      } catch {
        return syncStorageFailure()
      }
      return { ok: false, error: { code: 'SYNC', message: reason } }
    }
  }

  private persistPage(
    items: NormalizedFavoriteTrack[],
    unavailableProviderTrackIds: string[],
    observedAt: string
  ): PageStats {
    const stats = emptyPageStats()

    for (const item of items) {
      const existingMapping = this.repository.getProviderTrack(PROVIDER, item.providerTrackId)
      if (existingMapping) {
        this.repository.updateProviderTrackMetadata(PROVIDER, item.providerTrackId, {
          url: item.url,
          available: item.available,
          lastSeenAt: observedAt,
          metadataJson: item.metadataJson
        })
        stats.updatedMappingCount += 1
        continue
      }

      let track = this.repository.findTrackByTitleArtistWithoutProvider(
        item.title,
        item.artist,
        PROVIDER
      )
      if (track) {
        stats.reusedTrackCount += 1
      } else {
        track = this.repository.createTrack({
          title: item.title,
          artist: item.artist,
          album: item.album,
          durationMs: item.durationMs
        })
        stats.importedCount += 1
      }

      this.repository.addProviderTrack({
        trackId: track.id,
        provider: PROVIDER,
        providerTrackId: item.providerTrackId,
        url: item.url,
        available: item.available,
        lastSeenAt: observedAt,
        metadataJson: item.metadataJson
      })
    }

    for (const providerTrackId of new Set(unavailableProviderTrackIds)) {
      if (this.repository.markProviderTrackUnavailable(PROVIDER, providerTrackId)) {
        stats.unavailableCount += 1
      }
    }

    return stats
  }
}

function runningState(
  previous: SyncState | undefined,
  cursor: string | null,
  attemptedAt: string
): SyncStateUpdate {
  return {
    cursor,
    status: 'running',
    lastAttemptAt: attemptedAt,
    lastSuccessAt: previous?.lastSuccessAt ?? null,
    failureReason: null,
    retryCount: previous?.retryCount ?? 0
  }
}

function normalizePage(page: NeteaseFavoritesPage): {
  items: NormalizedFavoriteTrack[]
  nextCursor: string | null
  checkpoint: string | null
  unavailableProviderTrackIds: string[]
} {
  if (!page || typeof page !== 'object' || !Array.isArray(page.items)) {
    throw new NeteaseDataAdapterError('网易云返回的数据页格式无效')
  }
  const nextCursor = optionalToken(page.nextCursor, '下一页游标')
  const checkpoint = optionalToken(page.checkpoint, '增量检查点')
  if (!Array.isArray(page.unavailableProviderTrackIds)) {
    throw new NeteaseDataAdapterError('网易云不可见歌曲列表格式无效')
  }

  return {
    items: page.items.map(normalizeTrack),
    nextCursor,
    checkpoint,
    unavailableProviderTrackIds: page.unavailableProviderTrackIds.map((id) =>
      requiredText(id, '不可见歌曲 ID', 100)
    )
  }
}

function normalizeTrack(item: NeteaseFavoriteTrack): NormalizedFavoriteTrack {
  if (!item || typeof item !== 'object') {
    throw new NeteaseDataAdapterError('网易云歌曲数据格式无效')
  }

  const providerTrackId = requiredText(item.providerTrackId, '歌曲 ID', 100)
  const title = requiredText(item.title, '歌曲名称', 500)
  const artist = optionalText(item.artist, '歌手', 500)
  const album = optionalText(item.album, '专辑', 500)
  const durationMs = item.durationMs
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0)) {
    throw new NeteaseDataAdapterError('网易云歌曲时长格式无效')
  }
  const url = optionalUrl(item.url)
  const favoritedAt = optionalTimestamp(item.favoritedAt)
  if (typeof item.available !== 'boolean') {
    throw new NeteaseDataAdapterError('网易云歌曲可用状态格式无效')
  }

  return {
    providerTrackId,
    title,
    artist,
    album,
    durationMs,
    url,
    favoritedAt,
    available: item.available,
    metadataJson: JSON.stringify({ title, artist, album, durationMs, favoritedAt })
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new NeteaseDataAdapterError(`网易云${label}格式无效`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new NeteaseDataAdapterError(`网易云${label}长度异常`)
  }
  return normalized
}

function optionalText(value: unknown, label: string, maxLength: number): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new NeteaseDataAdapterError(`网易云${label}格式无效`)
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) {
    throw new NeteaseDataAdapterError(`网易云${label}长度异常`)
  }
  return normalized
}

function optionalUrl(value: unknown): string | null {
  const normalized = optionalText(value, '歌曲链接', 2000)
  if (!normalized) return null
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new NeteaseDataAdapterError('网易云歌曲链接格式无效')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new NeteaseDataAdapterError('网易云歌曲链接协议无效')
  }
  return normalized
}

function optionalTimestamp(value: unknown): string | null {
  const normalized = optionalText(value, '收藏时间', 100)
  if (!normalized) return null
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) {
    throw new NeteaseDataAdapterError('网易云收藏时间格式无效')
  }
  return date.toISOString()
}

function optionalToken(value: unknown, label: string): string | null {
  if (value === null) return null
  return requiredText(value, label, 2000)
}

function emptyPageStats(): PageStats {
  return {
    importedCount: 0,
    reusedTrackCount: 0,
    updatedMappingCount: 0,
    unavailableCount: 0
  }
}

function addPageStats(total: PageStats, page: PageStats): void {
  total.importedCount += page.importedCount
  total.reusedTrackCount += page.reusedTrackCount
  total.updatedMappingCount += page.updatedMappingCount
  total.unavailableCount += page.unavailableCount
}

function safeFailureReason(error: unknown): string {
  return error instanceof NeteaseDataAdapterError
    ? error.message.slice(0, 500)
    : '网易云收藏同步暂时不可用，请稍后重试'
}

function syncStateDto(state: SyncState | undefined): NeteaseSyncStateDto {
  return {
    status: state?.status ?? 'idle',
    hasCursor: Boolean(state?.cursor),
    lastAttemptAt: state?.lastAttemptAt ?? null,
    lastSuccessAt: state?.lastSuccessAt ?? null,
    failureReason: state?.failureReason ?? null,
    retryCount: state?.retryCount ?? 0
  }
}

function syncStorageFailure(): ApiResult<never> {
  return {
    ok: false,
    error: { code: 'STORAGE', message: '无法保存收藏同步状态，请检查本地数据库后重试' }
  }
}
