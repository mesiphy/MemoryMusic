import { describe, expect, it } from 'vitest'
import { MockNeteaseDataAdapter, type MockNeteasePage } from '../import/mock-netease-data-adapter'
import {
  NeteaseDataAdapterError,
  type NeteaseDataAdapter,
  type NeteaseFavoriteTrack,
  type NeteaseFavoritesPage
} from '../import/netease-data-adapter'
import { MusicRepository, openMusicDatabase } from '../persistence/database'
import { NeteaseImportService } from '../services/netease-import-service'

function favorite(
  index: number,
  overrides: Partial<NeteaseFavoriteTrack> = {}
): NeteaseFavoriteTrack {
  return {
    providerTrackId: String(100000 + index),
    title: `收藏歌曲 ${index}`,
    artist: `歌手 ${index % 12}`,
    album: `专辑 ${index % 8}`,
    durationMs: 180000 + index,
    url: `https://music.163.com/song?id=${100000 + index}`,
    favoritedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    available: true,
    ...overrides
  }
}

function page(
  items: NeteaseFavoriteTrack[],
  nextCursor: string | null,
  checkpoint: string | null = null,
  unavailableProviderTrackIds: string[] = []
): NeteaseFavoritesPage {
  return { items, nextCursor, checkpoint, unavailableProviderTrackIds }
}

describe('NeteaseImportService', () => {
  it('imports 125 favorites idempotently without overwriting personal records', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const existing = repository.createTrack({
        title: '收藏歌曲 1',
        artist: '歌手 1',
        album: '手工专辑',
        durationMs: null
      })
      const personalTag = repository.createTag('只属于我')
      repository.tagTrack(existing.id, personalTag.id)
      repository.addNote(existing.id, '不要被平台覆盖的感悟')
      repository.addAlias(existing.id, '我的旧称')
      const memory = repository.createMemory('那次旅行', '个人事件')
      repository.linkMemoryTrack(memory.id, existing.id)

      const favorites = Array.from({ length: 125 }, (_, index) => favorite(index + 1))
      const adapter = new MockNeteaseDataAdapter(
        new Map([
          [MockNeteaseDataAdapter.startCursorKey(), page(favorites.slice(0, 50), 'page-2')],
          ['page-2', page(favorites.slice(50, 100), 'page-3')],
          ['page-3', page(favorites.slice(100), null, 'checkpoint-1')]
        ])
      )
      const service = new NeteaseImportService(
        repository,
        adapter,
        () => new Date('2026-07-15T12:00:00.000Z')
      )

      const first = await service.syncFavorites()

      expect(first).toMatchObject({
        ok: true,
        value: {
          importedCount: 124,
          reusedTrackCount: 1,
          updatedMappingCount: 0,
          processedCount: 125,
          pageCount: 3,
          sync: { status: 'succeeded', hasCursor: true, retryCount: 0 }
        }
      })
      expect(adapter.requestedCursors).toEqual([null, 'page-2', 'page-3'])
      expect(repository.listTracks()).toHaveLength(125)
      expect(repository.listProviderTracks('netease')).toHaveLength(125)
      expect(repository.getProviderTrack('netease', '100001')?.trackId).toBe(existing.id)
      expect(repository.getTrack(existing.id)).toMatchObject({
        title: '收藏歌曲 1',
        album: '手工专辑',
        durationMs: null
      })
      expect(repository.tagsForTrack(existing.id)).toMatchObject([{ name: '只属于我' }])
      expect(repository.notesForTrack(existing.id)).toMatchObject([
        { body: '不要被平台覆盖的感悟' }
      ])
      expect(repository.aliasesForTrack(existing.id)).toMatchObject([{ name: '我的旧称' }])
      expect(repository.memoriesForTrack(existing.id)).toMatchObject([{ title: '那次旅行' }])

      repository.updateTrack(existing.id, { title: '我改过的标题' })
      const updatedFavorites = favorites.map((item, index) =>
        index === 0 ? { ...item, title: '平台改名后的标题', album: '平台新专辑' } : item
      )
      const repeatAdapter = new MockNeteaseDataAdapter(
        new Map([
          [
            'checkpoint-1',
            page(updatedFavorites, null, 'checkpoint-2', [favorites[1].providerTrackId])
          ]
        ])
      )
      const repeat = await new NeteaseImportService(
        repository,
        repeatAdapter,
        () => new Date('2026-07-15T12:05:00.000Z')
      ).syncFavorites()

      expect(repeat).toMatchObject({
        ok: true,
        value: {
          importedCount: 0,
          reusedTrackCount: 0,
          updatedMappingCount: 125,
          unavailableCount: 1,
          processedCount: 125,
          pageCount: 1,
          sync: { status: 'succeeded', hasCursor: true, retryCount: 0 }
        }
      })
      expect(repeatAdapter.requestedCursors).toEqual(['checkpoint-1'])
      expect(repository.listTracks()).toHaveLength(125)
      expect(repository.getTrack(existing.id)?.title).toBe('我改过的标题')
      expect(repository.tagsForTrack(existing.id)).toHaveLength(1)
      expect(repository.notesForTrack(existing.id)).toHaveLength(1)
      expect(repository.aliasesForTrack(existing.id)).toHaveLength(1)
      expect(repository.memoriesForTrack(existing.id)).toHaveLength(1)
      expect(repository.getProviderTrack('netease', favorites[1].providerTrackId)?.available).toBe(
        false
      )
      expect(
        JSON.parse(repository.getProviderTrack('netease', '100001')?.metadataJson ?? '{}')
      ).toMatchObject({ title: '平台改名后的标题', album: '平台新专辑' })
    } finally {
      db.close()
    }
  })

  it('persists page progress and resumes a failed import from the retry cursor', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const failingAdapter = new MockNeteaseDataAdapter(
        new Map<string, MockNeteasePage>([
          [MockNeteaseDataAdapter.startCursorKey(), page([favorite(201)], 'retry-page')],
          ['retry-page', new NeteaseDataAdapterError('官方服务暂时不可用')]
        ])
      )
      const failed = await new NeteaseImportService(
        repository,
        failingAdapter,
        () => new Date('2026-07-15T13:00:00.000Z')
      ).syncFavorites()

      expect(failed).toEqual({
        ok: false,
        error: { code: 'SYNC', message: '官方服务暂时不可用' }
      })
      expect(repository.listTracks()).toHaveLength(1)
      expect(repository.getSyncState('netease')).toMatchObject({
        cursor: 'retry-page',
        status: 'failed',
        lastAttemptAt: '2026-07-15T13:00:00.000Z',
        failureReason: '官方服务暂时不可用',
        retryCount: 1
      })

      const retryAdapter = new MockNeteaseDataAdapter(
        new Map([['retry-page', page([favorite(202)], null, 'checkpoint-after-retry')]])
      )
      const retried = await new NeteaseImportService(
        repository,
        retryAdapter,
        () => new Date('2026-07-15T13:01:00.000Z')
      ).syncFavorites()

      expect(retried).toMatchObject({
        ok: true,
        value: {
          importedCount: 1,
          processedCount: 1,
          sync: {
            status: 'succeeded',
            lastSuccessAt: '2026-07-15T13:01:00.000Z',
            retryCount: 0
          }
        }
      })
      expect(retryAdapter.requestedCursors).toEqual(['retry-page'])
      expect(repository.listTracks()).toHaveLength(2)
    } finally {
      db.close()
    }
  })

  it('keeps distinct provider IDs separate when their title and artist are identical', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const adapter = new MockNeteaseDataAdapter(
        new Map([
          [
            MockNeteaseDataAdapter.startCursorKey(),
            page(
              [
                favorite(301, { title: '同名歌曲', artist: '同一歌手' }),
                favorite(302, { title: '同名歌曲', artist: '同一歌手' })
              ],
              null,
              'same-name-checkpoint'
            )
          ]
        ])
      )

      const result = await new NeteaseImportService(repository, adapter).syncFavorites()

      expect(result).toMatchObject({ ok: true, value: { importedCount: 2 } })
      expect(repository.listTracks()).toHaveLength(2)
      expect(repository.listProviderTracks('netease').map((item) => item.trackId)).toEqual([1, 2])
    } finally {
      db.close()
    }
  })

  it('does not persist unknown adapter error details that could contain credentials', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const adapter = new MockNeteaseDataAdapter(
        new Map([
          [
            MockNeteaseDataAdapter.startCursorKey(),
            new Error('privateKey=should-never-be-persisted')
          ]
        ])
      )
      const result = await new NeteaseImportService(repository, adapter).syncFavorites()

      expect(result).toEqual({
        ok: false,
        error: { code: 'SYNC', message: '网易云收藏同步暂时不可用，请稍后重试' }
      })
      expect(repository.getSyncState('netease')?.failureReason).not.toContain('privateKey')
    } finally {
      db.close()
    }
  })

  it('reports an unavailable official adapter without changing local data', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      repository.createTrack({ title: '离线歌曲', artist: null, album: null, durationMs: null })
      const adapter = new MockNeteaseDataAdapter(new Map(), {
        available: false,
        reason: '需要官方账号授权'
      })
      const service = new NeteaseImportService(repository, adapter)

      await expect(service.getStatus()).resolves.toMatchObject({
        ok: true,
        value: { available: false, unavailableReason: '需要官方账号授权' }
      })
      await expect(service.syncFavorites()).resolves.toEqual({
        ok: false,
        error: { code: 'UNSUPPORTED', message: '需要官方账号授权' }
      })
      expect(repository.listTracks()).toMatchObject([{ title: '离线歌曲' }])
      expect(repository.getSyncState('netease')).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('rejects overlapping sync requests without starting a second adapter call', async () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      let releasePage: ((value: NeteaseFavoritesPage) => void) | undefined
      const adapter: NeteaseDataAdapter = {
        getAvailability: async () => ({ available: true, reason: null }),
        fetchFavoritesPage: () =>
          new Promise((resolve) => {
            releasePage = resolve
          })
      }
      const service = new NeteaseImportService(repository, adapter)

      const first = service.syncFavorites()
      await Promise.resolve()
      await expect(service.syncFavorites()).resolves.toEqual({
        ok: false,
        error: { code: 'CONFLICT', message: '收藏同步正在进行，请等待当前任务完成' }
      })

      releasePage?.(page([], null, 'concurrent-checkpoint'))
      await expect(first).resolves.toMatchObject({ ok: true })
    } finally {
      db.close()
    }
  })

  it('returns a stable storage error when the local database is unavailable', async () => {
    const db = openMusicDatabase()
    const repository = new MusicRepository(db)
    db.close()
    const adapter = new MockNeteaseDataAdapter(
      new Map([[MockNeteaseDataAdapter.startCursorKey(), page([], null, null)]])
    )

    await expect(new NeteaseImportService(repository, adapter).syncFavorites()).resolves.toEqual({
      ok: false,
      error: {
        code: 'STORAGE',
        message: '无法保存收藏同步状态，请检查本地数据库后重试'
      }
    })
  })
})
