import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyPendingRestore,
  createStartupBackupIfNeeded,
  dataSafetyPaths,
  listAutomaticBackups
} from '../data-safety/database-files'
import {
  CURRENT_SCHEMA_VERSION,
  MusicRepository,
  openMusicDatabase,
  type SqliteDatabase
} from '../persistence/database'
import { DataSafetyService, type DataSafetyDialogAdapter } from '../services/data-safety-service'

class FakeDataSafetyDialogs implements DataSafetyDialogAdapter {
  backupDestination: string | null = null
  exportDestination: string | null = null
  restoreSource: string | null = null
  restoreConfirmed = true

  chooseBackupDestination = vi.fn(async () => this.backupDestination)
  chooseExportDestination = vi.fn(async () => this.exportDestination)
  chooseRestoreSource = vi.fn(async () => this.restoreSource)
  confirmRestore = vi.fn(async () => this.restoreConfirmed)
}

describe('data safety service', () => {
  let directory: string
  let userDataPath: string
  let databasePath: string
  let database: SqliteDatabase
  let repository: MusicRepository
  let dialogs: FakeDataSafetyDialogs
  let now: Date
  let service: DataSafetyService

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'memory-music-data-safety-'))
    userDataPath = join(directory, 'user-data')
    databasePath = join(userDataPath, 'memory-music.sqlite3')
    database = openMusicDatabase(databasePath)
    repository = new MusicRepository(database)
    dialogs = new FakeDataSafetyDialogs()
    now = new Date('2026-07-19T08:00:00.000Z')
    service = new DataSafetyService(database, databasePath, userDataPath, dialogs, () => now)
  })

  afterEach(() => {
    if (database.open) database.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('backs up a complete personal library and restores it into a new database', async () => {
    const seeded = seedPersonalLibrary(repository)
    const backupPath = join(directory, 'chosen', 'personal-library.sqlite3')
    dialogs.backupDestination = backupPath

    const backup = await service.createBackup()

    expect(backup).toEqual({
      ok: true,
      value: {
        status: 'completed',
        fileName: 'personal-library.sqlite3',
        completedAt: now.toISOString()
      }
    })
    expect(existsSync(backupPath)).toBe(true)

    dialogs.restoreSource = backupPath
    const restore = await service.restoreBackup()

    expect(restore).toMatchObject({
      ok: true,
      value: {
        status: 'completed',
        fileName: 'personal-library.sqlite3',
        restartRequired: true
      }
    })
    expect(dialogs.confirmRestore).toHaveBeenCalledWith('personal-library.sqlite3')
    expect(
      readdirSync(dataSafetyPaths(userDataPath).backupDirectory).some((name) =>
        name.startsWith('memory-music-pre-restore-')
      )
    ).toBe(true)

    const restoredPath = join(directory, 'fresh-profile', 'memory-music.sqlite3')
    expect(applyPendingRestore(restoredPath, userDataPath)).toEqual({
      applied: true,
      rejected: false
    })
    expect(existsSync(`${dataSafetyPaths(userDataPath).pendingRestorePath}-wal`)).toBe(false)
    expect(existsSync(`${dataSafetyPaths(userDataPath).pendingRestorePath}-shm`)).toBe(false)

    const restored = openMusicDatabase(restoredPath)
    try {
      const restoredRepository = new MusicRepository(restored)
      expect(restored.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
      expect(restored.pragma('foreign_key_check')).toEqual([])
      expect(restoredRepository.getTrack(seeded.trackId)).toMatchObject({
        title: '保留这首歌',
        artist: '记忆歌手'
      })
      expect(restoredRepository.getProviderTrack('netease', 'song-42')).toMatchObject({
        trackId: seeded.trackId,
        available: true
      })
      expect(restoredRepository.tagsForTrack(seeded.trackId)).toMatchObject([{ name: '深夜循环' }])
      expect(restoredRepository.notesForTrack(seeded.trackId)).toMatchObject([
        { body: '第一次独自旅行时听到' }
      ])
      expect(restoredRepository.memoriesForTrack(seeded.trackId)).toMatchObject([
        { title: '海边夜晚', location: '青岛' }
      ])
      expect(restoredRepository.aliasesForTrack(seeded.trackId)).toMatchObject([
        { name: '啦啦啦那首', kind: 'lyric' }
      ])
      expect(restoredRepository.listPendingQuickCaptureInboxItems()).toMatchObject([
        { trackId: seeded.trackId, captureText: '稍后补充天气' }
      ])
      expect(restoredRepository.getSyncState('netease')).toMatchObject({
        cursor: 'page-8',
        status: 'succeeded'
      })
      expect(restoredRepository.listSearchQueryLogs()).toMatchObject([
        { query: '海边听的那首', missingField: 'memory' }
      ])
    } finally {
      restored.close()
    }
  })

  it('exports readable versioned JSON without derived search documents', async () => {
    const seeded = seedPersonalLibrary(repository)
    const exportPath = join(directory, 'exports', 'memory-music.json')
    dialogs.exportDestination = exportPath

    const result = await service.exportJson()
    const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as Record<string, unknown>
    const data = exported.data as Record<string, Array<Record<string, unknown>>>

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'completed', fileName: 'memory-music.json' }
    })
    expect(exported).toMatchObject({
      format: 'memory-music-export',
      formatVersion: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: now.toISOString()
    })
    expect(data.tracks).toMatchObject([{ id: seeded.trackId, title: '保留这首歌' }])
    expect(data.trackTags).toEqual([{ trackId: seeded.trackId, tagId: seeded.tagId }])
    expect(data.memoryTracks).toEqual([{ memoryId: seeded.memoryId, trackId: seeded.trackId }])
    expect(data.notes).toMatchObject([{ body: '第一次独自旅行时听到' }])
    expect(data.cues).toMatchObject([{ name: '啦啦啦那首', kind: 'lyric' }])
    expect(data.quickCaptureInbox).toMatchObject([{ captureText: '稍后补充天气' }])
    expect(data.syncStates).toMatchObject([{ provider: 'netease', cursor: 'page-8' }])
    expect(data.searchQueryLog).toMatchObject([{ query: '海边听的那首' }])
    expect(data).not.toHaveProperty('searchDocuments')
  })

  it('keeps only the seven newest daily automatic backups', async () => {
    repository.createTrack({
      title: '轮换测试',
      artist: null,
      album: null,
      durationMs: null
    })

    for (let day = 1; day <= 9; day += 1) {
      now = new Date(`2030-01-${String(day).padStart(2, '0')}T08:00:00.000Z`)
      await service.createAutomaticBackupIfNeeded()
    }

    const backups = listAutomaticBackups(userDataPath)
    expect(backups).toHaveLength(7)
    expect(backups[0]?.fileName).toContain('20300109')
    expect(backups.at(-1)?.fileName).toContain('20300103')
  })

  it('rejects invalid and newer backups without changing the live library', async () => {
    const track = repository.createTrack({
      title: '当前资料必须保留',
      artist: null,
      album: null,
      durationMs: null
    })
    const invalidPath = join(directory, 'not-a-backup.sqlite3')
    writeFileSync(invalidPath, 'not sqlite', 'utf8')
    dialogs.restoreSource = invalidPath

    expect(await service.restoreBackup()).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: '所选文件不是有效的 MemoryMusic 备份' }
    })
    expect(dialogs.confirmRestore).not.toHaveBeenCalled()
    expect(repository.getTrack(track.id)?.title).toBe('当前资料必须保留')
    expect(existsSync(dataSafetyPaths(userDataPath).pendingRestorePath)).toBe(false)

    const newerPath = join(directory, 'future.sqlite3')
    const newer = new Database(newerPath)
    newer.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 1}`)
    newer.close()
    dialogs.restoreSource = newerPath

    expect(await service.restoreBackup()).toEqual({
      ok: false,
      error: {
        code: 'UNSUPPORTED',
        message: '该备份由更新版本的 MemoryMusic 创建，请先升级应用'
      }
    })
    expect(repository.getTrack(track.id)?.title).toBe('当前资料必须保留')
    expect(existsSync(dataSafetyPaths(userDataPath).pendingRestorePath)).toBe(false)
  })

  it('backs up an older database before migration and preserves its personal records', async () => {
    const track = repository.createTrack({
      title: '升级前资料',
      artist: '旧版本歌手',
      album: null,
      durationMs: null
    })
    repository.addNote(track.id, '升级前感悟')
    database.exec(`
      DROP TABLE quick_capture_inbox;
      ALTER TABLE sync_state RENAME TO sync_state_v4;
      CREATE TABLE sync_state (
        provider TEXT PRIMARY KEY CHECK (length(trim(provider)) > 0),
        cursor TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      INSERT INTO sync_state (provider, cursor, updated_at)
        SELECT provider, cursor, updated_at FROM sync_state_v4;
      DROP TABLE sync_state_v4;
      DELETE FROM schema_migrations WHERE version = 4;
    `)
    database.pragma('user_version = 3')
    database.close()

    await createStartupBackupIfNeeded(
      databasePath,
      userDataPath,
      new Date('2031-02-03T04:05:06.007Z')
    )

    const [backup] = listAutomaticBackups(userDataPath)
    expect(backup?.fileName).toContain('20310203')
    const backupDatabase = openMusicDatabase(backup!.path)
    try {
      const backupRepository = new MusicRepository(backupDatabase)
      expect(backupDatabase.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(backupRepository.getTrack(track.id)?.title).toBe('升级前资料')
      expect(backupRepository.notesForTrack(track.id)).toMatchObject([{ body: '升级前感悟' }])
    } finally {
      backupDatabase.close()
    }

    database = openMusicDatabase(databasePath)
    repository = new MusicRepository(database)
  })

  it('quarantines an invalid pending restore and leaves the current database intact', () => {
    const track = repository.createTrack({
      title: '不能丢失',
      artist: null,
      album: null,
      durationMs: null
    })
    const { pendingRestorePath, recoveryDirectory } = dataSafetyPaths(userDataPath)
    mkdirSync(recoveryDirectory, { recursive: true })
    writeFileSync(pendingRestorePath, 'corrupt pending restore', 'utf8')
    database.close()

    expect(applyPendingRestore(databasePath, userDataPath)).toEqual({
      applied: false,
      rejected: true
    })
    expect(existsSync(pendingRestorePath)).toBe(false)
    expect(
      readdirSync(recoveryDirectory).some((name) => name.startsWith('restore-rejected-'))
    ).toBe(true)

    database = openMusicDatabase(databasePath)
    repository = new MusicRepository(database)
    expect(repository.getTrack(track.id)?.title).toBe('不能丢失')
  })
})

function seedPersonalLibrary(repository: MusicRepository): {
  trackId: number
  tagId: number
  memoryId: number
} {
  const track = repository.createTrack({
    title: '保留这首歌',
    artist: '记忆歌手',
    album: '旅途',
    durationMs: 215000
  })
  repository.addProviderTrack({
    trackId: track.id,
    provider: 'netease',
    providerTrackId: 'song-42',
    url: 'https://music.163.com/song?id=42',
    available: true,
    lastSeenAt: '2026-07-19T07:00:00.000Z',
    metadataJson: '{"favoritedAt":"2024-01-02T03:04:05.000Z"}'
  })
  const tag = repository.createTag('深夜循环', '#d49a62')
  repository.tagTrack(track.id, tag.id)
  repository.addNote(track.id, '第一次独自旅行时听到')
  const memory = repository.createMemory(
    '海边夜晚',
    '风很大，但记得旋律。',
    '2024-06-01T20:00:00.000Z',
    '青岛',
    '自己'
  )
  repository.linkMemoryTrack(memory.id, track.id)
  repository.addAlias(track.id, '啦啦啦那首', 'lyric')
  repository.addQuickCaptureInboxItem({
    trackId: track.id,
    sourceAppId: 'test.player',
    sourceTitle: track.title,
    sourceArtist: track.artist,
    captureText: '稍后补充天气'
  })
  repository.saveSyncState('netease', {
    cursor: 'page-8',
    status: 'succeeded',
    lastAttemptAt: '2026-07-19T07:00:00.000Z',
    lastSuccessAt: '2026-07-19T07:00:01.000Z',
    failureReason: null,
    retryCount: 0
  })
  const query = repository.logSearchQuery('海边听的那首', '海边听的那首', 0, 'fts')
  repository.recordSearchMissingField(query.id, 'memory')

  return { trackId: track.id, tagId: tag.id, memoryId: memory.id }
}
