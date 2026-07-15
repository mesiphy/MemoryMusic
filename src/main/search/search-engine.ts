import type { SearchField, SearchMatchDto, SearchMode } from '../../shared/contracts'
import { MusicRepository, type SearchDocument, type Tag, type Track } from '../persistence/database'

const PERSONAL_FIELDS = new Set<SearchField>(['alias', 'lyric', 'cue', 'tag', 'note', 'memory'])
const FIELD_LABELS: Record<SearchField, string> = {
  title: '歌名',
  artist: '歌手',
  album: '专辑',
  alias: '别名',
  lyric: '错记歌词',
  cue: '其他线索',
  tag: '标签',
  note: '感悟',
  memory: '事件'
}

export interface SearchEngineResult {
  track: Track
  tags: Tag[]
  matches: SearchMatchDto[]
  matchedPersonalField: boolean
  exactTitle: boolean
  updatedAt: string
}

export interface SearchExecution {
  normalizedQuery: string
  mode: SearchMode
  results: SearchEngineResult[]
  noResultLogId: number | null
}

export interface SearchIndexStats {
  documentCount: number
  rebuiltAt: string
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(
      /[\s\u00a0\u1680\u180e\u2000-\u200b\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]+/gu,
      ' '
    )
    .trim()
}

export class SearchEngine {
  constructor(private readonly repository: MusicRepository) {}

  rebuild(): SearchIndexStats {
    const documents = this.repository.listTracks().map((track) => this.buildDocument(track))
    this.repository.replaceSearchDocuments(documents)
    return { documentCount: documents.length, rebuiltAt: new Date().toISOString() }
  }

  search(query: string): SearchExecution {
    this.rebuild()

    const normalizedQuery = normalizeSearchText(query)
    const tokens = normalizedQuery.split(' ').filter(Boolean)
    let mode: SearchMode = tokens.every((token) => [...token].length >= 3) ? 'fts' : 'substring'
    let trackIds: number[]

    if (mode === 'fts') {
      try {
        trackIds = this.repository.searchDocumentIdsByFts(this.ftsExpression(tokens))
      } catch {
        mode = 'substring'
        trackIds = this.repository.searchDocumentIdsBySubstring(tokens)
      }
    } else {
      trackIds = this.repository.searchDocumentIdsBySubstring(tokens)
    }

    const results = trackIds
      .map((trackId) => this.toResult(trackId, normalizedQuery, tokens))
      .filter((result): result is SearchEngineResult => Boolean(result))
      .sort((left, right) => this.compareResults(left, right))
      .slice(0, 50)

    const noResultLogId =
      results.length === 0
        ? this.repository.logSearchQuery(query, normalizedQuery, 0, mode).id
        : null

    return { normalizedQuery, mode, results, noResultLogId }
  }

  recordMissingField(queryLogId: number, missingField: string): boolean {
    return this.repository.recordSearchMissingField(queryLogId, missingField)
  }

  private buildDocument(track: Track): SearchDocument {
    const aliases = this.repository.aliasesForTrack(track.id)
    const notes = this.repository.notesForTrack(track.id)
    const memories = this.repository.memoriesForTrack(track.id)
    const aliasNames = aliases
      .filter((alias) => !['lyric', 'cue'].includes(alias.kind))
      .map((alias) => alias.name)
    const lyrics = aliases.filter((alias) => alias.kind === 'lyric').map((alias) => alias.name)
    const cues = aliases.filter((alias) => alias.kind === 'cue').map((alias) => alias.name)
    const tags = this.repository.tagsForTrack(track.id).map((tag) => tag.name)
    const noteBodies = notes.map((note) => note.body)
    const memoryTexts = memories.map((memory) =>
      [memory.title, memory.body, memory.location, memory.people, memory.happenedAt]
        .filter((value): value is string => Boolean(value))
        .join(' · ')
    )
    const artist = track.artist ?? ''
    const album = track.album ?? ''
    const normalizedTitle = normalizeSearchText(track.title)
    const normalizedArtist = normalizeSearchText(artist)
    const normalizedAlbum = normalizeSearchText(album)
    const normalizedAliases = this.normalizeValues(aliasNames)
    const normalizedLyrics = this.normalizeValues(lyrics)
    const normalizedCues = this.normalizeValues(cues)
    const normalizedTags = this.normalizeValues(tags)
    const normalizedNotes = this.normalizeValues(noteBodies)
    const normalizedMemories = this.normalizeValues(memoryTexts)

    return {
      trackId: track.id,
      title: track.title,
      artist,
      album,
      aliases: aliasNames,
      lyrics,
      cues,
      tags,
      notes: noteBodies,
      memories: memoryTexts,
      normalizedTitle,
      normalizedArtist,
      normalizedAlbum,
      normalizedAliases,
      normalizedLyrics,
      normalizedCues,
      normalizedTags,
      normalizedNotes,
      normalizedMemories,
      normalizedSearchable: [
        normalizedTitle,
        normalizedArtist,
        normalizedAlbum,
        normalizedAliases,
        normalizedLyrics,
        normalizedCues,
        normalizedTags,
        normalizedNotes,
        normalizedMemories
      ]
        .filter(Boolean)
        .join(' '),
      updatedAt: this.latestTimestamp([
        track.updatedAt,
        ...notes.map((note) => note.updatedAt),
        ...memories.map((memory) => memory.updatedAt)
      ])
    }
  }

  private toResult(
    trackId: number,
    normalizedQuery: string,
    tokens: string[]
  ): SearchEngineResult | undefined {
    const document = this.repository.getSearchDocument(trackId)
    const track = this.repository.getTrack(trackId)
    if (!document || !track) return undefined

    const fields: Array<[SearchField, string[]]> = [
      ['title', [document.title]],
      ['artist', document.artist ? [document.artist] : []],
      ['album', document.album ? [document.album] : []],
      ['alias', document.aliases],
      ['lyric', document.lyrics],
      ['cue', document.cues],
      ['tag', document.tags],
      ['note', document.notes],
      ['memory', document.memories]
    ]
    const matches: SearchMatchDto[] = []

    for (const [field, values] of fields) {
      for (const value of values) {
        const normalizedValue = normalizeSearchText(value)
        if (!tokens.some((token) => normalizedValue.includes(token))) continue
        matches.push({ field, label: FIELD_LABELS[field], value: this.preview(value) })
        if (matches.filter((match) => match.field === field).length >= 2) break
        if (matches.length >= 10) break
      }
      if (matches.length >= 10) break
    }

    return {
      track,
      tags: this.repository.tagsForTrack(trackId),
      matches,
      matchedPersonalField: matches.some((match) => PERSONAL_FIELDS.has(match.field)),
      exactTitle: document.normalizedTitle === normalizedQuery,
      updatedAt: document.updatedAt
    }
  }

  private compareResults(left: SearchEngineResult, right: SearchEngineResult): number {
    if (left.matchedPersonalField !== right.matchedPersonalField) {
      return left.matchedPersonalField ? -1 : 1
    }
    if (left.exactTitle !== right.exactTitle) return left.exactTitle ? -1 : 1
    if (left.matches.length !== right.matches.length)
      return right.matches.length - left.matches.length
    const recency = right.updatedAt.localeCompare(left.updatedAt)
    return recency || left.track.id - right.track.id
  }

  private ftsExpression(tokens: string[]): string {
    return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(' AND ')
  }

  private normalizeValues(values: string[]): string {
    return normalizeSearchText(values.join(' '))
  }

  private latestTimestamp(values: string[]): string {
    return (
      [...values].sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString()
    )
  }

  private preview(value: string): string {
    const compact = value.replace(/\s+/gu, ' ').trim()
    return compact.length > 160 ? `${compact.slice(0, 157)}…` : compact
  }
}
