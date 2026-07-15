import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  MusicRepository,
  openMusicDatabase
} from '../persistence/database'
import { SearchEngine } from '../search/search-engine'

describe('music database persistence', () => {
  it('migrates a new database exactly once and records its schema version', () => {
    const db = openMusicDatabase()

    try {
      expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      const expectedVersions = Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => ({
        version: index + 1
      }))
      expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual(
        expectedVersions
      )
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all()
          .map((row) => (row as { name: string }).name)
      ).toEqual(
        expect.arrayContaining([
          'aliases',
          'memories',
          'memory_tracks',
          'notes',
          'provider_tracks',
          'quick_capture_inbox',
          'schema_migrations',
          'search_documents',
          'search_documents_fts',
          'search_query_log',
          'sync_state',
          'tags',
          'track_tags',
          'tracks'
        ])
      )

      migrate(db)

      expect(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual(
        expectedVersions
      )
    } finally {
      db.close()
    }
  })

  it('upgrades an existing v1 memory table without losing records', () => {
    const db = new Database(':memory:')

    try {
      db.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          happened_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE tracks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          artist TEXT,
          album TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE sync_state (
          provider TEXT PRIMARY KEY,
          cursor TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO memories (title, body) VALUES ('旧事件', '仍需保留');
      `)
      db.pragma('user_version = 1')

      migrate(db)

      expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(db.prepare('SELECT title, body, location, people FROM memories').get()).toEqual({
        title: '旧事件',
        body: '仍需保留',
        location: null,
        people: null
      })
    } finally {
      db.close()
    }
  })

  it('upgrades a v2 personal library and makes existing records searchable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-music-v2-'))
    const databasePath = join(directory, 'memory-music.sqlite3')
    let db = openMusicDatabase(databasePath)

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: '旧资料歌曲',
        artist: '旧歌手',
        album: null,
        durationMs: null
      })
      repository.addNote(track.id, '迁移前留下的海边记忆')
      repository.addAlias(track.id, '老名字', 'alias')
      db.exec(`
        DROP TABLE search_documents_fts;
        DROP TABLE search_documents;
        DROP TABLE search_query_log;
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
        DELETE FROM schema_migrations WHERE version >= 3;
      `)
      db.pragma('user_version = 2')
      db.close()

      db = openMusicDatabase(databasePath)
      const reopenedRepository = new MusicRepository(db)
      const result = new SearchEngine(reopenedRepository).search('海边记忆')

      expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(reopenedRepository.getTrack(track.id)?.title).toBe('旧资料歌曲')
      expect(reopenedRepository.notesForTrack(track.id)).toMatchObject([
        { body: '迁移前留下的海边记忆' }
      ])
      expect(reopenedRepository.aliasesForTrack(track.id)).toMatchObject([{ name: '老名字' }])
      expect(result.results[0]?.track.id).toBe(track.id)
    } finally {
      if (db.open) db.close()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('upgrades v3 sync metadata without losing personal records', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-music-v3-'))
    const databasePath = join(directory, 'memory-music.sqlite3')
    let db = openMusicDatabase(databasePath)

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: '迁移保留歌曲',
        artist: '迁移歌手',
        album: null,
        durationMs: null
      })
      const tag = repository.createTag('迁移标签')
      repository.tagTrack(track.id, tag.id)
      repository.addNote(track.id, '迁移前感悟')
      repository.setSyncState('netease', 'legacy-cursor')

      db.exec(`
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
      db.pragma('user_version = 3')
      db.close()

      db = openMusicDatabase(databasePath)
      const reopenedRepository = new MusicRepository(db)

      expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(reopenedRepository.getTrack(track.id)?.title).toBe('迁移保留歌曲')
      expect(reopenedRepository.tagsForTrack(track.id)).toMatchObject([{ name: '迁移标签' }])
      expect(reopenedRepository.notesForTrack(track.id)).toMatchObject([{ body: '迁移前感悟' }])
      expect(reopenedRepository.getSyncState('netease')).toMatchObject({
        cursor: 'legacy-cursor',
        status: 'idle',
        lastAttemptAt: null,
        lastSuccessAt: null,
        failureReason: null,
        retryCount: 0
      })
    } finally {
      if (db.open) db.close()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('persists records across file database restarts without rerunning migrations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-music-'))
    const databasePath = join(directory, 'nested', 'memory-music.sqlite3')
    let db = openMusicDatabase(databasePath)

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: 'Persistent Song',
        artist: 'Artist',
        album: null,
        durationMs: 1234
      })
      repository.addQuickCaptureInboxItem({
        trackId: track.id,
        sourceAppId: 'test.player',
        sourceTitle: 'Persistent Song',
        sourceArtist: 'Artist',
        captureText: '稍后补充'
      })
      repository.saveSyncState('netease', {
        cursor: 'page-2',
        status: 'failed',
        lastAttemptAt: '2026-07-15T10:00:00.000Z',
        lastSuccessAt: null,
        failureReason: 'temporary outage',
        retryCount: 1
      })
      db.close()

      db = openMusicDatabase(databasePath)
      const reopenedRepository = new MusicRepository(db)

      expect(reopenedRepository.listTracks()).toMatchObject([
        { title: 'Persistent Song', artist: 'Artist', durationMs: 1234 }
      ])
      expect(reopenedRepository.listPendingQuickCaptureInboxItems()).toMatchObject([
        { trackId: track.id, captureText: '稍后补充', resolvedAt: null }
      ])
      expect(reopenedRepository.getSyncState('netease')).toMatchObject({
        cursor: 'page-2',
        status: 'failed',
        failureReason: 'temporary outage',
        retryCount: 1
      })
      expect(db.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({
        count: CURRENT_SCHEMA_VERSION
      })
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    } finally {
      if (db.open) db.close()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('supports core CRUD and many-to-many relationships', () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        durationMs: 1234
      })
      const provider = repository.addProviderTrack({
        trackId: track.id,
        provider: 'local',
        providerTrackId: 'song-1',
        url: 'file:///song.mp3',
        available: true,
        lastSeenAt: null,
        metadataJson: '{"bitrate":320}'
      })
      const tag = repository.createTag('Favorite', '#fff')
      repository.tagTrack(track.id, tag.id)
      repository.tagTrack(track.id, tag.id)
      const note = repository.addNote(track.id, 'first dance')
      const memory = repository.createMemory('Wedding', 'We played this.', '2024-01-01')
      repository.linkMemoryTrack(memory.id, track.id)
      const alias = repository.addAlias(track.id, 'Our song')
      const sync = repository.setSyncState('local', 'cursor-1')

      expect(repository.updateTrack(track.id, { album: null })?.album).toBeNull()
      expect(repository.updateTag(tag.id, { color: '#000' })?.color).toBe('#000')
      expect(repository.updateNote(note.id, 'updated note')?.body).toBe('updated note')
      expect(repository.updateMemory(memory.id, { title: 'Reception' })?.title).toBe('Reception')
      expect(provider.available).toBe(true)
      expect(repository.listTracks()).toHaveLength(1)
      expect(repository.tagsForTrack(track.id)).toMatchObject([{ name: 'Favorite' }])
      expect(repository.notesForTrack(track.id)).toMatchObject([{ body: 'updated note' }])
      expect(repository.tracksForMemory(memory.id)).toMatchObject([{ id: track.id }])
      expect(repository.memoriesForTrack(track.id)).toMatchObject([{ id: memory.id }])
      expect(repository.aliasesForTrack(track.id)).toEqual([alias])
      expect(repository.getSyncState('local')).toEqual(sync)

      expect(repository.unlinkMemoryTrack(memory.id, track.id)).toBe(true)
      expect(repository.untagTrack(track.id, tag.id)).toBe(true)
      expect(repository.deleteAlias(alias.id)).toBe(true)
      expect(repository.deleteNote(note.id)).toBe(true)
      expect(repository.deleteMemory(memory.id)).toBe(true)
      expect(repository.deleteTag(tag.id)).toBe(true)
    } finally {
      db.close()
    }
  })

  it('enforces field, relationship, and provider uniqueness constraints', () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: 'Song',
        artist: null,
        album: null,
        durationMs: null
      })
      repository.addProviderTrack({
        trackId: track.id,
        provider: 'p',
        providerTrackId: '1',
        url: null,
        available: true,
        lastSeenAt: null,
        metadataJson: null
      })

      expect(() =>
        repository.addProviderTrack({
          trackId: track.id,
          provider: 'p',
          providerTrackId: '1',
          url: null,
          available: true,
          lastSeenAt: null,
          metadataJson: null
        })
      ).toThrow()
      expect(() => repository.addNote(999, 'orphan')).toThrow()
      expect(() =>
        repository.createTrack({ title: ' ', artist: null, album: null, durationMs: null })
      ).toThrow()
      expect(() =>
        repository.createTrack({ title: 'invalid', artist: null, album: null, durationMs: -1 })
      ).toThrow()
    } finally {
      db.close()
    }
  })

  it('preserves personal records when a provider mapping is disabled or deleted', () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: 'Preserved',
        artist: null,
        album: null,
        durationMs: null
      })
      repository.addProviderTrack({
        trackId: track.id,
        provider: 'stream',
        providerTrackId: 'gone',
        url: null,
        available: true,
        lastSeenAt: null,
        metadataJson: null
      })
      const tag = repository.createTag('memory')
      repository.tagTrack(track.id, tag.id)
      repository.addNote(track.id, 'keep me')
      repository.addAlias(track.id, 'old name')
      const memory = repository.createMemory('Trip', 'keep this too')
      repository.linkMemoryTrack(memory.id, track.id)

      expect(
        repository.updateProviderTrackMetadata('stream', 'gone', {
          url: 'https://example.test/song/gone',
          available: true,
          lastSeenAt: '2026-07-15T11:00:00.000Z',
          metadataJson: '{"title":"platform title"}'
        })
      ).toMatchObject({ available: true, metadataJson: '{"title":"platform title"}' })
      expect(repository.getTrack(track.id)?.title).toBe('Preserved')

      expect(repository.markProviderTrackUnavailable('stream', 'gone')).toBe(true)
      expect(repository.getProviderTrack('stream', 'gone')?.available).toBe(false)
      expect(repository.deleteProviderTrack('stream', 'gone')).toBe(true)

      expect(repository.getProviderTrack('stream', 'gone')).toBeUndefined()
      expect(repository.getTrack(track.id)?.title).toBe('Preserved')
      expect(repository.notesForTrack(track.id)).toHaveLength(1)
      expect(repository.tagsForTrack(track.id)).toHaveLength(1)
      expect(repository.aliasesForTrack(track.id)).toHaveLength(1)
      expect(repository.memoriesForTrack(track.id)).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('cascades dependent rows only when a track is intentionally deleted', () => {
    const db = openMusicDatabase()

    try {
      const repository = new MusicRepository(db)
      const track = repository.createTrack({
        title: 'Delete',
        artist: null,
        album: null,
        durationMs: null
      })
      const memory = repository.createMemory('M', 'B')
      const tag = repository.createTag('T')
      repository.tagTrack(track.id, tag.id)
      repository.linkMemoryTrack(memory.id, track.id)
      repository.addNote(track.id, 'note')
      repository.addAlias(track.id, 'alias')
      repository.addProviderTrack({
        trackId: track.id,
        provider: 'local',
        providerTrackId: 'delete',
        url: null,
        available: true,
        lastSeenAt: null,
        metadataJson: null
      })
      repository.addQuickCaptureInboxItem({
        trackId: track.id,
        sourceAppId: 'test.player',
        sourceTitle: 'Delete',
        sourceArtist: null,
        captureText: null
      })

      expect(repository.deleteTrack(track.id)).toBe(true)
      expect(repository.getTrack(track.id)).toBeUndefined()

      for (const table of [
        'aliases',
        'memory_tracks',
        'notes',
        'provider_tracks',
        'quick_capture_inbox',
        'track_tags'
      ]) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }

      expect(db.prepare('SELECT count(*) AS count FROM memories').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM tags').get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })
})
