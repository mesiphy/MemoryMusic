import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from '../persistence/database'
import { normalizeSearchText, SearchEngine } from '../search/search-engine'
import { forgetfulQueryCases, seedForgetfulLibrary } from './fixtures/forgetful-query-cases'

describe('personal search engine', () => {
  let database: SqliteDatabase
  let repository: MusicRepository
  let engine: SearchEngine

  beforeEach(() => {
    database = openMusicDatabase()
    repository = new MusicRepository(database)
    engine = new SearchEngine(repository)
  })

  afterEach(() => database.close())

  it('normalizes case, full-width characters, and common whitespace', () => {
    expect(normalizeSearchText('  ＶＩＶＡ　La\n\tVIDA  ')).toBe('viva la vida')
  })

  it('uses FTS5 for three-character terms and substring fallback for short terms', () => {
    seedForgetfulLibrary(repository)

    const fts = engine.search('周杰伦')
    expect(fts.mode).toBe('fts')
    expect(fts.results[0]).toMatchObject({
      track: { title: '夜曲' },
      matches: [expect.objectContaining({ field: 'artist', value: '周杰伦' })]
    })

    const short = engine.search('深夜')
    expect(short.mode).toBe('substring')
    expect(short.results[0]).toMatchObject({
      track: { title: '夜曲' },
      matchedPersonalField: true,
      matches: [expect.objectContaining({ field: 'tag', value: '深夜' })]
    })

    repository.createTrack({
      title: '100%_真心',
      artist: null,
      album: null,
      durationMs: null
    })
    expect(engine.search('%_').results.map((result) => result.track.title)).toEqual(['100%_真心'])
  })

  it('retrieves the expected top result for the initial forgetful-query baseline', () => {
    seedForgetfulLibrary(repository)
    const startedAt = performance.now()
    let successfulQueries = 0

    for (const testCase of forgetfulQueryCases) {
      const queryStartedAt = performance.now()
      const result = engine.search(testCase.query)
      const elapsed = performance.now() - queryStartedAt

      if (result.results[0]?.track.title === testCase.expectedTitle) successfulQueries += 1
      expect(result.results[0]?.track.title, `${testCase.query}（${testCase.rememberedBy}）`).toBe(
        testCase.expectedTitle
      )
      expect(result.results[0]?.matches.length).toBeGreaterThan(0)
      expect(elapsed).toBeLessThan(10_000)
    }

    expect(forgetfulQueryCases).toHaveLength(25)
    expect(successfulQueries).toBeGreaterThanOrEqual(20)
    expect(performance.now() - startedAt).toBeLessThan(10_000)
  })

  it('prioritizes personal-field matches and returns a stable order', () => {
    const exactTitle = repository.createTrack({
      title: '归途',
      artist: '甲',
      album: null,
      durationMs: null
    })
    const personalMatch = repository.createTrack({
      title: '另一首歌',
      artist: '乙',
      album: null,
      durationMs: null
    })
    const sharedTag = repository.createTag('归途')
    repository.tagTrack(personalMatch.id, sharedTag.id)

    const first = engine.search('归途')
    const second = engine.search('归途')

    expect(first.results.map((result) => result.track.id)).toEqual([
      personalMatch.id,
      exactTitle.id
    ])
    expect(second.results.map((result) => result.track.id)).toEqual(
      first.results.map((result) => result.track.id)
    )
    expect(first.results[0]).toMatchObject({ matchedPersonalField: true, exactTitle: false })
    expect(first.results[1]).toMatchObject({ matchedPersonalField: false, exactTitle: true })
  })

  it('uses recent edit time and then track id as deterministic tie-breakers', () => {
    const older = repository.createTrack({
      title: '候选甲',
      artist: null,
      album: null,
      durationMs: null
    })
    const newer = repository.createTrack({
      title: '候选乙',
      artist: null,
      album: null,
      durationMs: null
    })
    const tag = repository.createTag('远行')
    repository.tagTrack(older.id, tag.id)
    repository.tagTrack(newer.id, tag.id)
    database
      .prepare('UPDATE tracks SET updated_at = ? WHERE id = ?')
      .run('2025-01-01T00:00:00.000Z', older.id)
    database
      .prepare('UPDATE tracks SET updated_at = ? WHERE id = ?')
      .run('2026-01-01T00:00:00.000Z', newer.id)

    expect(engine.search('远行').results.map((result) => result.track.id)).toEqual([
      newer.id,
      older.id
    ])

    database.prepare('UPDATE tracks SET updated_at = ?').run('2026-01-01T00:00:00.000Z')
    expect(engine.search('远行').results.map((result) => result.track.id)).toEqual([
      older.id,
      newer.id
    ])
  })

  it('rebuilds only derived search data and records no-result field feedback', () => {
    const track = repository.createTrack({
      title: '保留原始资料',
      artist: '测试歌手',
      album: '测试专辑',
      durationMs: null
    })
    repository.addNote(track.id, '不会被索引重建修改的感悟')
    repository.addAlias(track.id, '旧名字', 'alias')
    const before = personalDataSnapshot(database)

    expect(engine.rebuild().documentCount).toBe(1)
    expect(engine.rebuild().documentCount).toBe(1)
    expect(personalDataSnapshot(database)).toEqual(before)
    expect(repository.searchDocumentCount()).toBe(1)

    const missing = engine.search('完全不存在的线索')
    expect(missing.results).toEqual([])
    expect(missing.noResultLogId).toEqual(expect.any(Number))
    expect(engine.recordMissingField(missing.noResultLogId!, 'note')).toBe(true)
    expect(repository.getSearchQueryLog(missing.noResultLogId!)).toMatchObject({
      resultCount: 0,
      missingField: 'note'
    })
  })
})

function personalDataSnapshot(database: SqliteDatabase): unknown {
  return {
    tracks: database.prepare('SELECT * FROM tracks ORDER BY id').all(),
    tags: database.prepare('SELECT * FROM tags ORDER BY id').all(),
    trackTags: database.prepare('SELECT * FROM track_tags ORDER BY track_id, tag_id').all(),
    notes: database.prepare('SELECT * FROM notes ORDER BY id').all(),
    memories: database.prepare('SELECT * FROM memories ORDER BY id').all(),
    memoryTracks: database
      .prepare('SELECT * FROM memory_tracks ORDER BY memory_id, track_id')
      .all(),
    aliases: database.prepare('SELECT * FROM aliases ORDER BY id').all()
  }
}
