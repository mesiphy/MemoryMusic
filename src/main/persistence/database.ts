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
  location: string | null
  people: string | null
  createdAt: string
  updatedAt: string
}

export type MemoryChanges = Partial<
  Pick<Memory, 'title' | 'body' | 'happenedAt' | 'location' | 'people'>
>

export interface Alias {
  id: number
  trackId: number
  name: string
  kind: string
}

export interface SyncState {
  provider: string
  cursor: string | null
  status: SyncStatus
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  failureReason: string | null
  retryCount: number
  updatedAt: string
}

export type SyncStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export interface SyncStateUpdate {
  cursor: string | null
  status: SyncStatus
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  failureReason: string | null
  retryCount: number
}

export interface QuickCaptureInboxItem {
  id: number
  trackId: number
  sourceAppId: string
  sourceTitle: string
  sourceArtist: string | null
  captureText: string | null
  capturedAt: string
  resolvedAt: string | null
}

export type NewQuickCaptureInboxItem = Omit<
  QuickCaptureInboxItem,
  'id' | 'capturedAt' | 'resolvedAt'
>

export interface SearchDocument {
  trackId: number
  title: string
  artist: string
  album: string
  aliases: string[]
  lyrics: string[]
  cues: string[]
  tags: string[]
  notes: string[]
  memories: string[]
  normalizedTitle: string
  normalizedArtist: string
  normalizedAlbum: string
  normalizedAliases: string
  normalizedLyrics: string
  normalizedCues: string
  normalizedTags: string
  normalizedNotes: string
  normalizedMemories: string
  normalizedSearchable: string
  updatedAt: string
}

export interface SearchQueryLog {
  id: number
  query: string
  normalizedQuery: string
  resultCount: number
  mode: string
  missingField: string | null
  createdAt: string
}

export const CURRENT_SCHEMA_VERSION = 4

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
);`,
  2: `
ALTER TABLE memories ADD COLUMN location TEXT;
ALTER TABLE memories ADD COLUMN people TEXT;`,
  3: `
CREATE TABLE search_documents (
  track_id INTEGER PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  aliases_json TEXT NOT NULL,
  lyrics_json TEXT NOT NULL,
  cues_json TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  notes_json TEXT NOT NULL,
  memories_json TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  normalized_artist TEXT NOT NULL,
  normalized_album TEXT NOT NULL,
  normalized_aliases TEXT NOT NULL,
  normalized_lyrics TEXT NOT NULL,
  normalized_cues TEXT NOT NULL,
  normalized_tags TEXT NOT NULL,
  normalized_notes TEXT NOT NULL,
  normalized_memories TEXT NOT NULL,
  normalized_searchable TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE VIRTUAL TABLE search_documents_fts USING fts5(
  title,
  artist,
  album,
  aliases,
  lyrics,
  cues,
  tags,
  notes,
  memories,
  content='',
  tokenize='trigram'
);
CREATE TABLE search_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL CHECK (length(trim(query)) > 0),
  normalized_query TEXT NOT NULL CHECK (length(trim(normalized_query)) > 0),
  result_count INTEGER NOT NULL CHECK (result_count >= 0),
  mode TEXT NOT NULL CHECK (mode IN ('fts', 'substring')),
  missing_field TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_search_query_log_created_at ON search_query_log(created_at DESC);`,
  4: `
ALTER TABLE sync_state ADD COLUMN status TEXT NOT NULL DEFAULT 'idle'
  CHECK (status IN ('idle', 'running', 'succeeded', 'failed'));
ALTER TABLE sync_state ADD COLUMN last_attempt_at TEXT;
ALTER TABLE sync_state ADD COLUMN last_success_at TEXT;
ALTER TABLE sync_state ADD COLUMN failure_reason TEXT;
ALTER TABLE sync_state ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0
  CHECK (retry_count >= 0);
CREATE TABLE quick_capture_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  source_app_id TEXT NOT NULL CHECK (length(trim(source_app_id)) > 0),
  source_title TEXT NOT NULL CHECK (length(trim(source_title)) > 0),
  source_artist TEXT,
  capture_text TEXT,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);
CREATE INDEX idx_quick_capture_inbox_pending
  ON quick_capture_inbox(resolved_at, captured_at DESC, id DESC);`
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
    location: row.location == null ? null : String(row.location),
    people: row.people == null ? null : String(row.people),
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
    status: String(row.status) as SyncStatus,
    lastAttemptAt: row.last_attempt_at == null ? null : String(row.last_attempt_at),
    lastSuccessAt: row.last_success_at == null ? null : String(row.last_success_at),
    failureReason: row.failure_reason == null ? null : String(row.failure_reason),
    retryCount: Number(row.retry_count),
    updatedAt: String(row.updated_at)
  }
}

function quickCaptureInboxRow(row: DbRow): QuickCaptureInboxItem {
  return {
    id: Number(row.id),
    trackId: Number(row.track_id),
    sourceAppId: String(row.source_app_id),
    sourceTitle: String(row.source_title),
    sourceArtist: row.source_artist == null ? null : String(row.source_artist),
    captureText: row.capture_text == null ? null : String(row.capture_text),
    capturedAt: String(row.captured_at),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at)
  }
}

function stringArray(value: unknown): string[] {
  if (typeof value !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function searchDocumentRow(row: DbRow): SearchDocument {
  return {
    trackId: Number(row.track_id),
    title: String(row.title),
    artist: String(row.artist),
    album: String(row.album),
    aliases: stringArray(row.aliases_json),
    lyrics: stringArray(row.lyrics_json),
    cues: stringArray(row.cues_json),
    tags: stringArray(row.tags_json),
    notes: stringArray(row.notes_json),
    memories: stringArray(row.memories_json),
    normalizedTitle: String(row.normalized_title),
    normalizedArtist: String(row.normalized_artist),
    normalizedAlbum: String(row.normalized_album),
    normalizedAliases: String(row.normalized_aliases),
    normalizedLyrics: String(row.normalized_lyrics),
    normalizedCues: String(row.normalized_cues),
    normalizedTags: String(row.normalized_tags),
    normalizedNotes: String(row.normalized_notes),
    normalizedMemories: String(row.normalized_memories),
    normalizedSearchable: String(row.normalized_searchable),
    updatedAt: String(row.updated_at)
  }
}

function searchQueryLogRow(row: DbRow): SearchQueryLog {
  return {
    id: Number(row.id),
    query: String(row.query),
    normalizedQuery: String(row.normalized_query),
    resultCount: Number(row.result_count),
    mode: String(row.mode),
    missingField: row.missing_field == null ? null : String(row.missing_field),
    createdAt: String(row.created_at)
  }
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

export class MusicRepository {
  constructor(private readonly db: SqliteDatabase) {}

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)()
  }

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
      .prepare('SELECT * FROM tracks ORDER BY updated_at DESC, id DESC')
      .all()
      .map((row) => trackRow(row as DbRow))
  }

  findTrackByTitleArtist(title: string, artist: string | null): Track | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM tracks WHERE lower(trim(title)) = lower(trim(?)) AND lower(trim(COALESCE(artist, ''))) = lower(trim(?)) ORDER BY id LIMIT 1"
      )
      .get(title, artist ?? '') as DbRow | undefined
    return row ? trackRow(row) : undefined
  }

  findTrackByTitleArtistWithoutProvider(
    title: string,
    artist: string | null,
    provider: string
  ): Track | undefined {
    const row = this.db
      .prepare(
        "SELECT tracks.* FROM tracks WHERE lower(trim(title)) = lower(trim(?)) AND lower(trim(COALESCE(artist, ''))) = lower(trim(?)) AND NOT EXISTS (SELECT 1 FROM provider_tracks WHERE provider_tracks.track_id = tracks.id AND provider_tracks.provider = ?) ORDER BY tracks.id LIMIT 1"
      )
      .get(title, artist ?? '', provider) as DbRow | undefined
    return row ? trackRow(row) : undefined
  }

  touchTracks(trackIds: number[]): void {
    const update = this.db.prepare(
      "UPDATE tracks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
    for (const trackId of new Set(trackIds)) update.run(trackId)
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

  updateProviderTrackMetadata(
    provider: string,
    providerTrackId: string,
    changes: Pick<ProviderTrack, 'url' | 'available' | 'lastSeenAt' | 'metadataJson'>
  ): ProviderTrack | undefined {
    const result = this.db
      .prepare(
        'UPDATE provider_tracks SET url = ?, available = ?, last_seen_at = ?, metadata_json = ? WHERE provider = ? AND provider_track_id = ?'
      )
      .run(
        changes.url,
        changes.available ? 1 : 0,
        changes.lastSeenAt,
        changes.metadataJson,
        provider,
        providerTrackId
      )
    return result.changes > 0 ? this.getProviderTrack(provider, providerTrackId) : undefined
  }

  listProviderTracks(provider: string): ProviderTrack[] {
    return this.db
      .prepare('SELECT * FROM provider_tracks WHERE provider = ? ORDER BY id')
      .all(provider)
      .map((row) => providerRow(row as DbRow))
  }

  deleteProviderTrack(provider: string, providerTrackId: string): boolean {
    return (
      this.db
        .prepare('DELETE FROM provider_tracks WHERE provider = ? AND provider_track_id = ?')
        .run(provider, providerTrackId).changes > 0
    )
  }

  deleteProviderTracksForTrack(trackId: number, provider: string): number {
    return this.db
      .prepare('DELETE FROM provider_tracks WHERE track_id = ? AND provider = ?')
      .run(trackId, provider).changes
  }

  createTag(name: string, color: string | null = null): Tag {
    const info = this.db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
    return this.getTag(Number(info.lastInsertRowid))!
  }

  getTag(id: number): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as DbRow | undefined
    return row ? tagRow(row) : undefined
  }

  getTagByName(name: string): Tag | undefined {
    const row = this.db.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(name) as
      DbRow | undefined
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

  mergeTags(sourceTagId: number, targetTagId: number): Tag | undefined {
    if (sourceTagId === targetTagId) return this.getTag(targetTagId)

    return this.transaction(() => {
      const target = this.getTag(targetTagId)
      if (!target || !this.getTag(sourceTagId)) return undefined

      this.db
        .prepare(
          'INSERT OR IGNORE INTO track_tags (track_id, tag_id) SELECT track_id, ? FROM track_tags WHERE tag_id = ?'
        )
        .run(targetTagId, sourceTagId)
      this.db.prepare('DELETE FROM tags WHERE id = ?').run(sourceTagId)
      return target
    })
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

  setTrackTags(trackId: number, tagIds: number[]): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM track_tags WHERE track_id = ?').run(trackId)
      const insert = this.db.prepare('INSERT INTO track_tags (track_id, tag_id) VALUES (?, ?)')

      for (const tagId of new Set(tagIds)) insert.run(trackId, tagId)
    })
  }

  tagsForTrack(trackId: number): Tag[] {
    return this.db
      .prepare(
        'SELECT tags.* FROM tags JOIN track_tags ON tags.id = track_tags.tag_id WHERE track_tags.track_id = ? ORDER BY tags.name'
      )
      .all(trackId)
      .map((row) => tagRow(row as DbRow))
  }

  trackIdsForTag(tagId: number): number[] {
    return this.db
      .prepare('SELECT track_id FROM track_tags WHERE tag_id = ? ORDER BY track_id')
      .all(tagId)
      .map((row) => Number((row as DbRow).track_id))
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

  createMemory(
    title: string,
    body: string,
    happenedAt: string | null = null,
    location: string | null = null,
    people: string | null = null
  ): Memory {
    const info = this.db
      .prepare(
        'INSERT INTO memories (title, body, happened_at, location, people) VALUES (?, ?, ?, ?, ?)'
      )
      .run(title, body, happenedAt, location, people)
    return this.getMemory(Number(info.lastInsertRowid))!
  }

  getMemory(id: number): Memory | undefined {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as DbRow | undefined
    return row ? memoryRow(row) : undefined
  }

  listMemories(): Memory[] {
    return this.db
      .prepare('SELECT * FROM memories ORDER BY happened_at DESC, updated_at DESC, id DESC')
      .all()
      .map((row) => memoryRow(row as DbRow))
  }

  updateMemory(id: number, changes: MemoryChanges): Memory | undefined {
    const current = this.getMemory(id)
    if (!current) return undefined

    this.db
      .prepare(
        "UPDATE memories SET title = ?, body = ?, happened_at = ?, location = ?, people = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      )
      .run(
        changes.title ?? current.title,
        changes.body ?? current.body,
        changes.happenedAt === undefined ? current.happenedAt : changes.happenedAt,
        changes.location === undefined ? current.location : changes.location,
        changes.people === undefined ? current.people : changes.people,
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

  setMemoryTracks(memoryId: number, trackIds: number[]): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM memory_tracks WHERE memory_id = ?').run(memoryId)
      const insert = this.db.prepare(
        'INSERT INTO memory_tracks (memory_id, track_id) VALUES (?, ?)'
      )

      for (const trackId of new Set(trackIds)) insert.run(memoryId, trackId)
    })
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

  getAlias(id: number): Alias | undefined {
    const row = this.db.prepare('SELECT * FROM aliases WHERE id = ?').get(id) as DbRow | undefined
    return row ? aliasRow(row) : undefined
  }

  updateAlias(id: number, name: string, kind: string): Alias | undefined {
    const result = this.db
      .prepare('UPDATE aliases SET name = ?, kind = ? WHERE id = ?')
      .run(name, kind, id)
    return result.changes > 0 ? this.getAlias(id) : undefined
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

  replaceSearchDocuments(documents: SearchDocument[]): void {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO search_documents_fts(search_documents_fts) VALUES ('delete-all')")
        .run()
      this.db.prepare('DELETE FROM search_documents').run()

      const insertDocument = this.db.prepare(`
        INSERT INTO search_documents (
          track_id, title, artist, album,
          aliases_json, lyrics_json, cues_json, tags_json, notes_json, memories_json,
          normalized_title, normalized_artist, normalized_album,
          normalized_aliases, normalized_lyrics, normalized_cues,
          normalized_tags, normalized_notes, normalized_memories,
          normalized_searchable, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const insertFts = this.db.prepare(`
        INSERT INTO search_documents_fts (
          rowid, title, artist, album, aliases, lyrics, cues, tags, notes, memories
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const document of documents) {
        insertDocument.run(
          document.trackId,
          document.title,
          document.artist,
          document.album,
          JSON.stringify(document.aliases),
          JSON.stringify(document.lyrics),
          JSON.stringify(document.cues),
          JSON.stringify(document.tags),
          JSON.stringify(document.notes),
          JSON.stringify(document.memories),
          document.normalizedTitle,
          document.normalizedArtist,
          document.normalizedAlbum,
          document.normalizedAliases,
          document.normalizedLyrics,
          document.normalizedCues,
          document.normalizedTags,
          document.normalizedNotes,
          document.normalizedMemories,
          document.normalizedSearchable,
          document.updatedAt
        )
        insertFts.run(
          document.trackId,
          document.normalizedTitle,
          document.normalizedArtist,
          document.normalizedAlbum,
          document.normalizedAliases,
          document.normalizedLyrics,
          document.normalizedCues,
          document.normalizedTags,
          document.normalizedNotes,
          document.normalizedMemories
        )
      }
    })
  }

  getSearchDocument(trackId: number): SearchDocument | undefined {
    const row = this.db
      .prepare('SELECT * FROM search_documents WHERE track_id = ?')
      .get(trackId) as DbRow | undefined
    return row ? searchDocumentRow(row) : undefined
  }

  listSearchDocuments(): SearchDocument[] {
    return this.db
      .prepare('SELECT * FROM search_documents ORDER BY track_id')
      .all()
      .map((row) => searchDocumentRow(row as DbRow))
  }

  searchDocumentIdsByFts(matchExpression: string, limit = 200): number[] {
    return this.db
      .prepare('SELECT rowid FROM search_documents_fts WHERE search_documents_fts MATCH ? LIMIT ?')
      .all(matchExpression, limit)
      .map((row) => Number((row as DbRow).rowid))
  }

  searchDocumentIdsBySubstring(tokens: string[], limit = 200): number[] {
    if (!tokens.length) return []

    const where = tokens.map(() => "normalized_searchable LIKE ? ESCAPE '\\'").join(' AND ')
    const patterns = tokens.map((token) => `%${escapeLike(token)}%`)
    return this.db
      .prepare(`SELECT track_id FROM search_documents WHERE ${where} ORDER BY track_id LIMIT ?`)
      .all(...patterns, limit)
      .map((row) => Number((row as DbRow).track_id))
  }

  searchDocumentCount(): number {
    const row = this.db.prepare('SELECT count(*) AS count FROM search_documents').get() as DbRow
    return Number(row.count)
  }

  logSearchQuery(
    query: string,
    normalizedQuery: string,
    resultCount: number,
    mode: string
  ): SearchQueryLog {
    const info = this.db
      .prepare(
        'INSERT INTO search_query_log (query, normalized_query, result_count, mode) VALUES (?, ?, ?, ?)'
      )
      .run(query, normalizedQuery, resultCount, mode)
    return this.getSearchQueryLog(Number(info.lastInsertRowid))!
  }

  getSearchQueryLog(id: number): SearchQueryLog | undefined {
    const row = this.db.prepare('SELECT * FROM search_query_log WHERE id = ?').get(id) as
      DbRow | undefined
    return row ? searchQueryLogRow(row) : undefined
  }

  listSearchQueryLogs(): SearchQueryLog[] {
    return this.db
      .prepare('SELECT * FROM search_query_log ORDER BY id')
      .all()
      .map((row) => searchQueryLogRow(row as DbRow))
  }

  recordSearchMissingField(id: number, missingField: string): boolean {
    return (
      this.db
        .prepare('UPDATE search_query_log SET missing_field = ? WHERE id = ? AND result_count = 0')
        .run(missingField, id).changes > 0
    )
  }

  addQuickCaptureInboxItem(input: NewQuickCaptureInboxItem): QuickCaptureInboxItem {
    const info = this.db
      .prepare(
        'INSERT INTO quick_capture_inbox (track_id, source_app_id, source_title, source_artist, capture_text) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        input.trackId,
        input.sourceAppId,
        input.sourceTitle,
        input.sourceArtist,
        input.captureText
      )
    return this.getQuickCaptureInboxItem(Number(info.lastInsertRowid))!
  }

  getQuickCaptureInboxItem(id: number): QuickCaptureInboxItem | undefined {
    const row = this.db.prepare('SELECT * FROM quick_capture_inbox WHERE id = ?').get(id) as
      DbRow | undefined
    return row ? quickCaptureInboxRow(row) : undefined
  }

  listPendingQuickCaptureInboxItems(): QuickCaptureInboxItem[] {
    return this.db
      .prepare(
        'SELECT * FROM quick_capture_inbox WHERE resolved_at IS NULL ORDER BY captured_at DESC, id DESC'
      )
      .all()
      .map((row) => quickCaptureInboxRow(row as DbRow))
  }

  resolveQuickCaptureInboxItem(id: number): QuickCaptureInboxItem | undefined {
    const result = this.db
      .prepare(
        "UPDATE quick_capture_inbox SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND resolved_at IS NULL"
      )
      .run(id)
    return result.changes > 0 ? this.getQuickCaptureInboxItem(id) : undefined
  }

  getSyncState(provider: string): SyncState | undefined {
    const row = this.db.prepare('SELECT * FROM sync_state WHERE provider = ?').get(provider) as
      DbRow | undefined
    return row ? syncStateRow(row) : undefined
  }

  setSyncState(provider: string, cursor: string | null): SyncState {
    const current = this.getSyncState(provider)
    return this.saveSyncState(provider, {
      cursor,
      status: current?.status ?? 'idle',
      lastAttemptAt: current?.lastAttemptAt ?? null,
      lastSuccessAt: current?.lastSuccessAt ?? null,
      failureReason: current?.failureReason ?? null,
      retryCount: current?.retryCount ?? 0
    })
  }

  saveSyncState(provider: string, state: SyncStateUpdate): SyncState {
    this.db
      .prepare(
        "INSERT INTO sync_state (provider, cursor, status, last_attempt_at, last_success_at, failure_reason, retry_count) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET cursor = excluded.cursor, status = excluded.status, last_attempt_at = excluded.last_attempt_at, last_success_at = excluded.last_success_at, failure_reason = excluded.failure_reason, retry_count = excluded.retry_count, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
      )
      .run(
        provider,
        state.cursor,
        state.status,
        state.lastAttemptAt,
        state.lastSuccessAt,
        state.failureReason,
        state.retryCount
      )
    return this.getSyncState(provider)!
  }
}
