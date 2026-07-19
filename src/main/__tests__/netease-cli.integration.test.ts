import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NcmCliNeteaseDataAdapter } from '../import/ncm-cli-netease-data-adapter'
import { MusicRepository, openMusicDatabase } from '../persistence/database'
import { NeteaseImportService } from '../services/netease-import-service'

const integrationEnabled = process.env.MEMORY_MUSIC_NETEASE_CLI_INTEGRATION === '1'

describe.skipIf(!integrationEnabled)('official NetEase CLI integration', () => {
  it('imports at least 100 favorites into an isolated database and repeats idempotently', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-music-netease-cli-'))
    const databasePath = join(directory, 'acceptance.sqlite3')
    let database = openMusicDatabase(databasePath)

    try {
      let repository = new MusicRepository(database)
      const adapter = new NcmCliNeteaseDataAdapter()
      const availability = await adapter.getAvailability()
      expect(availability).toEqual({ available: true, reason: null })

      const first = await new NeteaseImportService(repository, adapter).syncFavorites()
      expect(first.ok).toBe(true)
      if (!first.ok) throw new Error(first.error.message)
      expect(first.value.processedCount).toBeGreaterThanOrEqual(100)

      const firstMappings = repository.listProviderTracks('netease')
      const firstTrackCount = repository.listTracks().length
      expect(firstMappings.length).toBeGreaterThanOrEqual(100)
      expect(firstMappings).toHaveLength(first.value.processedCount)
      expect(firstTrackCount).toBeGreaterThanOrEqual(100)

      const preservedTrackId = firstMappings[0]?.trackId
      expect(preservedTrackId).toBeTypeOf('number')

      database.close()
      database = openMusicDatabase(databasePath)
      repository = new MusicRepository(database)
      expect(repository.listProviderTracks('netease')).toHaveLength(firstMappings.length)

      const tag = repository.createTag('真实同步保留标签')
      repository.tagTrack(preservedTrackId!, tag.id)
      repository.addNote(preservedTrackId!, '真实同步保留笔记')
      repository.addAlias(preservedTrackId!, '真实同步保留别名')
      const memory = repository.createMemory('真实同步保留记忆', '重复同步不得删除')
      repository.linkMemoryTrack(memory.id, preservedTrackId!)

      const repeated = await new NeteaseImportService(
        repository,
        new NcmCliNeteaseDataAdapter()
      ).syncFavorites()
      expect(repeated.ok).toBe(true)
      if (!repeated.ok) throw new Error(repeated.error.message)
      expect(repeated.value.importedCount).toBe(0)
      expect(repeated.value.reusedTrackCount).toBe(0)
      expect(repository.listProviderTracks('netease')).toHaveLength(firstMappings.length)
      expect(repository.listTracks()).toHaveLength(firstTrackCount)

      database.close()
      database = openMusicDatabase(databasePath)
      repository = new MusicRepository(database)
      expect(repository.tagsForTrack(preservedTrackId!)).toMatchObject([
        { name: '真实同步保留标签' }
      ])
      expect(repository.notesForTrack(preservedTrackId!)).toMatchObject([
        { body: '真实同步保留笔记' }
      ])
      expect(repository.aliasesForTrack(preservedTrackId!)).toMatchObject([
        { name: '真实同步保留别名' }
      ])
      expect(repository.memoriesForTrack(preservedTrackId!)).toMatchObject([
        { title: '真实同步保留记忆' }
      ])
    } finally {
      if (database.open) database.close()
      rmSync(directory, { recursive: true, force: true })
    }
  }, 300_000)
})
