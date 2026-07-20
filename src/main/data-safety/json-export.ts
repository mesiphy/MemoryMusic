import type { SqliteDatabase } from '../persistence/database'

export const JSON_EXPORT_FORMAT = 'memory-music-export'
export const JSON_EXPORT_FORMAT_VERSION = 1

type DatabaseRow = Record<string, unknown>

export function createJsonExport(database: SqliteDatabase, exportedAt: Date): string {
  const snapshot = database.transaction(() => ({
    format: JSON_EXPORT_FORMAT,
    formatVersion: JSON_EXPORT_FORMAT_VERSION,
    schemaVersion: Number(database.pragma('user_version', { simple: true })),
    exportedAt: exportedAt.toISOString(),
    data: {
      tracks: rows(database, 'SELECT * FROM tracks ORDER BY id').map((row) => ({
        id: number(row.id),
        title: text(row.title),
        artist: nullableText(row.artist),
        album: nullableText(row.album),
        durationMs: nullableNumber(row.duration_ms),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at)
      })),
      providerTracks: rows(database, 'SELECT * FROM provider_tracks ORDER BY id').map((row) => ({
        id: number(row.id),
        trackId: number(row.track_id),
        provider: text(row.provider),
        providerTrackId: text(row.provider_track_id),
        url: nullableText(row.url),
        available: Boolean(row.available),
        lastSeenAt: nullableText(row.last_seen_at),
        metadataJson: nullableText(row.metadata_json)
      })),
      tags: rows(database, 'SELECT * FROM tags ORDER BY id').map((row) => ({
        id: number(row.id),
        name: text(row.name),
        color: nullableText(row.color)
      })),
      trackTags: rows(database, 'SELECT * FROM track_tags ORDER BY track_id, tag_id').map(
        (row) => ({
          trackId: number(row.track_id),
          tagId: number(row.tag_id)
        })
      ),
      notes: rows(database, 'SELECT * FROM notes ORDER BY id').map((row) => ({
        id: number(row.id),
        trackId: number(row.track_id),
        body: text(row.body),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at)
      })),
      memories: rows(database, 'SELECT * FROM memories ORDER BY id').map((row) => ({
        id: number(row.id),
        title: text(row.title),
        description: text(row.body),
        happenedAt: nullableText(row.happened_at),
        location: nullableText(row.location),
        people: nullableText(row.people),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at)
      })),
      memoryTracks: rows(database, 'SELECT * FROM memory_tracks ORDER BY memory_id, track_id').map(
        (row) => ({
          memoryId: number(row.memory_id),
          trackId: number(row.track_id)
        })
      ),
      cues: rows(database, 'SELECT * FROM aliases ORDER BY id').map((row) => ({
        id: number(row.id),
        trackId: number(row.track_id),
        name: text(row.name),
        kind: text(row.kind)
      })),
      quickCaptureInbox: rows(database, 'SELECT * FROM quick_capture_inbox ORDER BY id').map(
        (row) => ({
          id: number(row.id),
          trackId: number(row.track_id),
          sourceAppId: text(row.source_app_id),
          sourceTitle: text(row.source_title),
          sourceArtist: nullableText(row.source_artist),
          captureText: nullableText(row.capture_text),
          capturedAt: text(row.captured_at),
          resolvedAt: nullableText(row.resolved_at)
        })
      ),
      syncStates: rows(database, 'SELECT * FROM sync_state ORDER BY provider').map((row) => ({
        provider: text(row.provider),
        cursor: nullableText(row.cursor),
        status: text(row.status),
        lastAttemptAt: nullableText(row.last_attempt_at),
        lastSuccessAt: nullableText(row.last_success_at),
        failureReason: nullableText(row.failure_reason),
        retryCount: number(row.retry_count),
        updatedAt: text(row.updated_at)
      })),
      searchQueryLog: rows(database, 'SELECT * FROM search_query_log ORDER BY id').map((row) => ({
        id: number(row.id),
        query: text(row.query),
        normalizedQuery: text(row.normalized_query),
        resultCount: number(row.result_count),
        mode: text(row.mode),
        missingField: nullableText(row.missing_field),
        createdAt: text(row.created_at)
      }))
    }
  }))()

  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function rows(database: SqliteDatabase, query: string): DatabaseRow[] {
  return database.prepare(query).all() as DatabaseRow[]
}

function text(value: unknown): string {
  return String(value)
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value)
}

function number(value: unknown): number {
  return Number(value)
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}
