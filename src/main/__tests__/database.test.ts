import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  MusicRepository,
  openMusicDatabase
} from '../persistence/database'

describe('music database persistence', () => {
  it('migrates a new database exactly once and records its schema version', () => {
    const db = openMusicDatabase()

    try {
      expect(db.pragma('user_version', { simple: true })).toBe(CURRENT_SCHEMA_VERSION)
      expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([
        { version: CURRENT_SCHEMA_VERSION }
      ])
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
          'schema_migrations',
          'sync_state',
          'tags',
          'track_tags',
          'tracks'
        ])
      )

      migrate(db)

      expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([
        { version: CURRENT_SCHEMA_VERSION }
      ])
    } finally {
      db.close()
    }
  })

  it('persists records across file database restarts without rerunning migrations', () => {
    const directory = mkdtempSync(join(tmpdir(), 'memory-music-'))
    const databasePath = join(directory, 'nested', 'memory-music.sqlite3')
    let db = openMusicDatabase(databasePath)

    try {
      const repository = new MusicRepository(db)
      repository.createTrack({
        title: 'Persistent Song',
        artist: 'Artist',
        album: null,
        durationMs: 1234
      })
      db.close()

      db = openMusicDatabase(databasePath)
      const reopenedRepository = new MusicRepository(db)

      expect(reopenedRepository.listTracks()).toMatchObject([
        { title: 'Persistent Song', artist: 'Artist', durationMs: 1234 }
      ])
      expect(db.prepare('SELECT count(*) AS count FROM schema_migrations').get()).toEqual({
        count: 1
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

      expect(repository.deleteTrack(track.id)).toBe(true)
      expect(repository.getTrack(track.id)).toBeUndefined()

      for (const table of ['aliases', 'memory_tracks', 'notes', 'provider_tracks', 'track_tags']) {
        expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
      }

      expect(db.prepare('SELECT count(*) AS count FROM memories').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT count(*) AS count FROM tags').get()).toEqual({ count: 1 })
    } finally {
      db.close()
    }
  })
})
