import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type SqliteDatabase = Database.Database

type DbRow = Record<string, unknown>

export interface Track {
  id: number
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  createdAt: string
  updatedAt: string
}

export type NewTrack = Omit<Track, 'id' | 'createdAt' | 'updatedAt'>
export type TrackChanges = Partial<NewTrack>

export interface ProviderTrack {
  id: number
  trackId: number
  provider: string
  providerTrackId: string
  url: string | null
  available: boolean
  lastSeenAt: string | null
  metadataJson: string | null
}

export type NewProviderTrack = Omit<ProviderTrack, 'id'>

export interface Tag {
  id: number
  name: string
  color: string | null
}

export type TagChanges = Partial<Omit<Tag, 'id'>>

export interface Note {
  id: number
  trackId: number
  body: string
  createdAt: string
  updatedAt: string
}

export interface Memory {
  id: number
  title: string
  body: string
  happenedAt: string | null
  createdAt: string
  updatedAt: string
}

export type MemoryChanges = Partial<Pick<Memory, 'title' | 'body' | 'happenedAt'>>

export interface Alias {
  id: number
  trackId: number
  name: string
  kind: string
}

export interface SyncState {
  provider: string
  cursor: string | null
  updatedAt: string
}

export const CURRENT_SCHEMA_VERSION = 1

const migrations: Readonly<Record<number, string>> = {
  1: `
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  artist TEXT,
  album TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE provider_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  provider_track_id TEXT NOT NULL CHECK (length(trim(provider_track_id)) > 0),
  url TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  last_seen_at TEXT,
  metadata_json TEXT,
  UNIQUE(provider, provider_track_id)
);
CREATE INDEX idx_provider_tracks_track_id ON provider_tracks(track_id);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  color TEXT
);
CREATE TABLE track_tags (
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(track_id, tag_id)
);
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_notes_track_id ON notes(track_id);
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  body TEXT NOT NULL,
  happened_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE memory_tracks (
  memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY(memory_id, track_id)
);
CREATE INDEX idx_memory_tracks_track_id ON memory_tracks(track_id);
CREATE TABLE aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL DEFAULT 'user' CHECK (length(trim(kind)) > 0),
  UNIQUE(track_id, name, kind)
);
CREATE INDEX idx_aliases_track_id ON aliases(track_id);
CREATE TABLE sync_state (
  provider TEXT PRIMARY KEY CHECK (length(trim(provider)) > 0),
  cursor TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);`
}

export function openMusicDatabase(path = ':memory:'): SqliteDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const db = new Database(path)

  try {
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')

    if (path !== ':memory:') {
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
    }

    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function migrate(db: SqliteDatabase): void {
  db.pragma('foreign_keys = ON')
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  )

  const appliedVersions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => Number((row as DbRow).version))

  const latestAppliedVersion = appliedVersions.at(-1) ?? 0
  const userVersion = Number(db.pragma('user_version', { simple: true }))
  const isContiguous = appliedVersions.every((version, index) => version === index + 1)

  if (!isContiguous || latestAppliedVersion !== userVersion) {
    throw new Error('Database migration metadata is inconsistent')
  }

  if (userVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${userVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`
    )
  }

  const transaction = db.transaction(() => {
    for (let version = userVersion + 1; version <= CURRENT_SCHEMA_VERSION; version += 1) {
      const sql = migrations[version]

      if (!sql) throw new Error(`Missing database migration ${version}`)

      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
      db.pragma(`user_version = ${version}`)
    }
  })

  transaction()

  const migratedVersion = Number(db.pragma('user_version', { simple: true }))
  if (migratedVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Database migration stopped at version ${migratedVersion}`)
  }
}

function trackRow(row: DbRow): Track {
  return {
    id: Number(row.id),
    title: String(row.title),
    artist: row.artist == null ? null : String(row.artist),
    album: row.album == null ? null : String(row.album),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function providerRow(row: DbRow): ProviderTrack {
  return {
    id: Number(row.id),
    trackId: Number(row.track_id),
    provider: String(row.provider),
    providerTrackId: String(row.provider_track_id),
    url: row.url == null ? null : String(row.url),
    available: Boolean(row.available),
    lastSeenAt: row.last_seen_at == null ? null : String(row.last_seen_at),
    metadataJson: row.metadata_json == null ? null : String(row.metadata_json)
  }
}

function tagRow(row: DbRow): Tag {
  return {
    id: Number(row.id),
    name: String(row.name),
    color: row.color == null ? null : String(row.color)
  }
}

function noteRow(row: DbRow): Note {
  return {
    id: Number(row.id),
    trackId: Number(row.track_id),
    body: String(row.body),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function memoryRow(row: DbRow): Memory {
  return {
    id: Number(row.id),
    title: String(row.title),
    body: String(row.body),
    happenedAt: row.happened_at == null ? null : String(row.happened_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function aliasRow(row: DbRow): Alias {
  return {
    id: Number(row.id),
    trackId: Number(row.track_id),
    name: String(row.name),
    kind: String(row.kind)
  }
}

function syncStateRow(row: DbRow): SyncState {
  return {
    provider: String(row.provider),
    cursor: row.cursor == null ? null : String(row.cursor),
    updatedAt: String(row.updated_at)
  }
}

export class MusicRepository {
  constructor(private readonly db: SqliteDatabase) {}

  createTrack(track: NewTrack): Track {
    const info = this.db
      .prepare('INSERT INTO tracks (title, artist, album, duration_ms) VALUES (?, ?, ?, ?)')
      .run(track.title, track.artist, track.album, track.durationMs)
    return this.getTrack(Number(info.lastInsertRowid))!
  }

  getTrack(id: number): Track | undefined {
    const row = this.db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as DbRow | undefined
    return row ? trackRow(row) : undefined
  }

  listTracks(): Track[] {
    return this.db
      .prepare('SELECT * FROM tracks ORDER BY id')
      .all()
      .map((row) => trackRow(row as DbRow))
  }

  updateTrack(id: number, changes: TrackChanges): Track | undefined {
    const current = this.getTrack(id)
    if (!current) return undefined

    this.db
      .prepare(
        "UPDATE tracks SET title = ?, artist = ?, album = ?, duration_ms = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      .run(
        changes.title ?? current.title,
        changes.artist === undefined ? current.artist : changes.artist,
        changes.album === undefined ? current.album : changes.album,
        changes.durationMs === undefined ? current.durationMs : changes.durationMs,
        id
      )

    return this.getTrack(id)
  }

  deleteTrack(id: number): boolean {
    return this.db.prepare('DELETE FROM tracks WHERE id = ?').run(id).changes > 0
  }

  addProviderTrack(input: NewProviderTrack): ProviderTrack {
    const info = this.db
      .prepare(
        'INSERT INTO provider_tracks (track_id, provider, provider_track_id, url, available, last_seen_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        input.trackId,
        input.provider,
        input.providerTrackId,
        input.url,
        input.available ? 1 : 0,
        input.lastSeenAt,
        input.metadataJson
      )
    const row = this.db
      .prepare('SELECT * FROM provider_tracks WHERE id = ?')
      .get(info.lastInsertRowid) as DbRow
    return providerRow(row)
  }

  getProviderTrack(provider: string, providerTrackId: string): ProviderTrack | undefined {
    const row = this.db
      .prepare('SELECT * FROM provider_tracks WHERE provider = ? AND provider_track_id = ?')
      .get(provider, providerTrackId) as DbRow | undefined
    return row ? providerRow(row) : undefined
  }

  providerTracksForTrack(trackId: number): ProviderTrack[] {
    return this.db
      .prepare('SELECT * FROM provider_tracks WHERE track_id = ? ORDER BY id')
      .all(trackId)
      .map((row) => providerRow(row as DbRow))
  }

  markProviderTrackUnavailable(provider: string, providerTrackId: string): boolean {
    return (
      this.db
        .prepare(
          'UPDATE provider_tracks SET available = 0 WHERE provider = ? AND provider_track_id = ?'
        )
        .run(provider, providerTrackId).changes > 0
    )
  }

  deleteProviderTrack(provider: string, providerTrackId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM provider_tracks WHERE provider = ? AND provider_track_id = ?')
        .run(provider, providerTrackId).changes > 0
    )
  }

  createTag(name: string, color: string | null = null): Tag {
    const info = this.db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
    return this.getTag(Number(info.lastInsertRowid))!
  }

  getTag(id: number): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as DbRow | undefined
    return row ? tagRow(row) : undefined
  }

  listTags(): Tag[] {
    return this.db
      .prepare('SELECT * FROM tags ORDER BY name')
      .all()
      .map((row) => tagRow(row as DbRow))
  }

  updateTag(id: number, changes: TagChanges): Tag | undefined {
    const current = this.getTag(id)
    if (!current) return undefined

    this.db
      .prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?')
      .run(
        changes.name ?? current.name,
        changes.color === undefined ? current.color : changes.color,
        id
      )
    return this.getTag(id)
  }

  deleteTag(id: number): boolean {
    return this.db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0
  }

  tagTrack(trackId: number, tagId: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?, ?)')
      .run(trackId, tagId)
  }

  untagTrack(trackId: number, tagId: number): boolean {
    return (
      this.db
        .prepare('DELETE FROM track_tags WHERE track_id = ? AND tag_id = ?')
        .run(trackId, tagId).changes > 0
    )
  }

  tagsForTrack(trackId: number): Tag[] {
    return this.db
      .prepare(
        'SELECT tags.* FROM tags JOIN track_tags ON tags.id = track_tags.tag_id WHERE track_tags.track_id = ? ORDER BY tags.name'
      )
      .all(trackId)
      .map((row) => tagRow(row as DbRow))
  }

  addNote(trackId: number, body: string): Note {
    const info = this.db
      .prepare('INSERT INTO notes (track_id, body) VALUES (?, ?)')
      .run(trackId, body)
    return this.getNote(Number(info.lastInsertRowid))!
  }

  getNote(id: number): Note | undefined {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as DbRow | undefined
    return row ? noteRow(row) : undefined
  }

  updateNote(id: number, body: string): Note | undefined {
    const result = this.db
      .prepare(
        "UPDATE notes SET body = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      .run(body, id)
    return result.changes > 0 ? this.getNote(id) : undefined
  }

  deleteNote(id: number): boolean {
    return this.db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0
  }

  notesForTrack(trackId: number): Note[] {
    return this.db
      .prepare('SELECT * FROM notes WHERE track_id = ? ORDER BY id')
      .all(trackId)
      .map((row) => noteRow(row as DbRow))
  }

  createMemory(title: string, body: string, happenedAt: string | null = null): Memory {
    const info = this.db
      .prepare('INSERT INTO memories (title, body, happened_at) VALUES (?, ?, ?)')
      .run(title, body, happenedAt)
    return this.getMemory(Number(info.lastInsertRowid))!
  }

  getMemory(id: number): Memory | undefined {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as DbRow | undefined
    return row ? memoryRow(row) : undefined
  }

  updateMemory(id: number, changes: MemoryChanges): Memory | undefined {
    const current = this.getMemory(id)
    if (!current) return undefined

    this.db
      .prepare(
        "UPDATE memories SET title = ?, body = ?, happened_at = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      .run(
        changes.title ?? current.title,
        changes.body ?? current.body,
        changes.happenedAt === undefined ? current.happenedAt : changes.happenedAt,
        id
      )
    return this.getMemory(id)
  }

  deleteMemory(id: number): boolean {
    return this.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
  }

  linkMemoryTrack(memoryId: number, trackId: number): void {
    this.db
      .prepare('INSERT OR IGNORE INTO memory_tracks (memory_id, track_id) VALUES (?, ?)')
      .run(memoryId, trackId)
  }

  unlinkMemoryTrack(memoryId: number, trackId: number): boolean {
    return (
      this.db
        .prepare('DELETE FROM memory_tracks WHERE memory_id = ? AND track_id = ?')
        .run(memoryId, trackId).changes > 0
    )
  }

  tracksForMemory(memoryId: number): Track[] {
    return this.db
      .prepare(
        'SELECT tracks.* FROM tracks JOIN memory_tracks ON tracks.id = memory_tracks.track_id WHERE memory_tracks.memory_id = ? ORDER BY tracks.id'
      )
      .all(memoryId)
      .map((row) => trackRow(row as DbRow))
  }

  memoriesForTrack(trackId: number): Memory[] {
    return this.db
      .prepare(
        'SELECT memories.* FROM memories JOIN memory_tracks ON memories.id = memory_tracks.memory_id WHERE memory_tracks.track_id = ? ORDER BY memories.id'
      )
      .all(trackId)
      .map((row) => memoryRow(row as DbRow))
  }

  addAlias(trackId: number, name: string, kind = 'user'): Alias {
    const info = this.db
      .prepare('INSERT INTO aliases (track_id, name, kind) VALUES (?, ?, ?)')
      .run(trackId, name, kind)
    const row = this.db
      .prepare('SELECT * FROM aliases WHERE id = ?')
      .get(info.lastInsertRowid) as DbRow
    return aliasRow(row)
  }

  deleteAlias(id: number): boolean {
    return this.db.prepare('DELETE FROM aliases WHERE id = ?').run(id).changes > 0
  }

  aliasesForTrack(trackId: number): Alias[] {
    return this.db
      .prepare('SELECT * FROM aliases WHERE track_id = ? ORDER BY name')
      .all(trackId)
      .map((row) => aliasRow(row as DbRow))
  }

  getSyncState(provider: string): SyncState | undefined {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE provider = ?').get(provider) as
      DbRow | undefined
    return row ? syncStateRow(row) : undefined
  }

  setSyncState(provider: string, cursor: string | null): SyncState {
    this.db
      .prepare(
        "INSERT INTO sync_state (provider, cursor) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET cursor = excluded.cursor, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      )
      .run(provider, cursor)
    return this.getSyncState(provider)!
  }
}
