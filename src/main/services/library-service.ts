import type {
  ApiErrorCode,
  ApiResult,
  CueDto,
  CueKind,
  LibrarySnapshotDto,
  MemoryDto,
  NoteDto,
  ProviderTrackDto,
  TagDto,
  TrackDetailDto,
  TrackSummaryDto
} from '../../shared/contracts'
import {
  MusicRepository,
  type Alias,
  type Memory,
  type Note,
  type ProviderTrack,
  type Tag,
  type Track
} from '../persistence/database'

type InputRecord = Record<string, unknown>

class LibraryRequestError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>
  ) {
    super(message)
  }
}

function ok<T>(value: T): ApiResult<T> {
  return { ok: true, value }
}

function inputRecord(input: unknown): InputRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new LibraryRequestError('VALIDATION', '提交的数据格式无效')
  }

  return input as InputRecord
}

function fieldError(field: string, message: string): never {
  throw new LibraryRequestError('VALIDATION', message, { [field]: message })
}

function requiredString(
  record: InputRecord,
  field: string,
  label: string,
  maxLength: number
): string {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) fieldError(field, `请输入${label}`)

  const normalized = value.trim()
  if (normalized.length > maxLength) fieldError(field, `${label}不能超过 ${maxLength} 个字符`)
  return normalized
}

function optionalString(
  record: InputRecord,
  field: string,
  label: string,
  maxLength: number
): string | null {
  const value = record[field]
  if (value == null || value === '') return null
  if (typeof value !== 'string') fieldError(field, `${label}格式无效`)

  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maxLength) fieldError(field, `${label}不能超过 ${maxLength} 个字符`)
  return normalized
}

function positiveId(record: InputRecord, field: string): number {
  const value = record[field]
  if (!Number.isInteger(value) || Number(value) <= 0) fieldError(field, '记录 ID 无效')
  return Number(value)
}

function idList(record: InputRecord, field: string): number[] {
  const value = record[field]
  if (!Array.isArray(value)) fieldError(field, '关联记录格式无效')

  const ids = value.map(Number)
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    fieldError(field, '关联记录包含无效 ID')
  }

  return [...new Set(ids)]
}

function cueKind(record: InputRecord): CueKind {
  const value = record.kind
  if (value !== 'alias' && value !== 'lyric' && value !== 'cue') {
    fieldError('kind', '请选择有效的线索类型')
  }
  return value
}

function normalizeTimestamp(record: InputRecord): string | null {
  const value = optionalString(record, 'happenedAt', '事件时间', 100)
  if (!value) return null

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) fieldError('happenedAt', '事件时间格式无效')
  return timestamp.toISOString()
}

function normalizeTrackInput(input: unknown): {
  title: string
  artist: string | null
  album: string | null
  neteaseId: string | null
  neteaseUrl: string | null
} {
  const record = inputRecord(input)
  const title = requiredString(record, 'title', '歌曲名称', 200)
  const artist = optionalString(record, 'artist', '歌手', 200)
  const album = optionalString(record, 'album', '专辑', 200)
  const rawId = optionalString(record, 'neteaseId', '网易云歌曲 ID', 40)
  const neteaseUrl = optionalString(record, 'neteaseUrl', '网易云歌曲链接', 1000)

  if (rawId && !/^\d+$/.test(rawId)) fieldError('neteaseId', '网易云歌曲 ID 只能包含数字')

  let idFromUrl: string | null = null
  if (neteaseUrl) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(neteaseUrl)
    } catch {
      fieldError('neteaseUrl', '请输入完整的网易云歌曲链接')
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      fieldError('neteaseUrl', '网易云歌曲链接必须使用 HTTP 或 HTTPS')
    }
    if (!parsedUrl.hostname.toLowerCase().endsWith('music.163.com')) {
      fieldError('neteaseUrl', '请输入 music.163.com 的歌曲链接')
    }

    idFromUrl = neteaseUrl.match(/[?&#]id=(\d+)/)?.[1] ?? null
    if (!idFromUrl) fieldError('neteaseUrl', '网易云歌曲链接中未找到歌曲 ID')
  }

  if (rawId && idFromUrl && rawId !== idFromUrl) {
    fieldError('neteaseId', '歌曲 ID 与链接中的 ID 不一致')
  }

  return { title, artist, album, neteaseId: rawId ?? idFromUrl, neteaseUrl }
}

function tagDto(tag: Tag): TagDto {
  return { id: tag.id, name: tag.name, color: tag.color }
}

function providerTrackDto(providerTrack: ProviderTrack): ProviderTrackDto {
  return {
    id: providerTrack.id,
    provider: providerTrack.provider,
    providerTrackId: providerTrack.providerTrackId,
    url: providerTrack.url,
    available: providerTrack.available
  }
}

function noteDto(note: Note): NoteDto {
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  }
}

function supportedCueKind(kind: string): CueKind {
  return kind === 'lyric' || kind === 'cue' ? kind : 'alias'
}

function cueDto(alias: Alias): CueDto {
  return { id: alias.id, name: alias.name, kind: supportedCueKind(alias.kind) }
}

export class LibraryService {
  constructor(private readonly repository: MusicRepository) {}

  getLibrary(): ApiResult<LibrarySnapshotDto> {
    return this.execute('读取资料库失败，请重试', () => ({
      tracks: this.repository.listTracks().map((track) => this.trackSummaryDto(track)),
      tags: this.repository.listTags().map(tagDto),
      memories: this.repository.listMemories().map((memory) => this.memoryDto(memory))
    }))
  }

  getTrack(input: unknown): ApiResult<TrackDetailDto> {
    return this.execute('读取歌曲失败，请重试', () => {
      const track = this.requireTrack(positiveId(inputRecord(input), 'trackId'))
      return this.trackDetailDto(track)
    })
  }

  createTrack(input: unknown): ApiResult<TrackDetailDto> {
    return this.execute('保存歌曲失败，请重试', () => {
      const data = normalizeTrackInput(input)

      return this.repository.transaction(() => {
        const track = this.repository.createTrack({
          title: data.title,
          artist: data.artist,
          album: data.album,
          durationMs: null
        })
        this.writeNeteaseProvider(track.id, data.neteaseId, data.neteaseUrl)
        return this.trackDetailDto(track)
      })
    })
  }

  updateTrack(input: unknown): ApiResult<TrackDetailDto> {
    return this.execute('保存歌曲失败，请重试', () => {
      const record = inputRecord(input)
      const trackId = positiveId(record, 'trackId')
      const data = normalizeTrackInput(record)
      this.requireTrack(trackId)

      return this.repository.transaction(() => {
        const track = this.repository.updateTrack(trackId, {
          title: data.title,
          artist: data.artist,
          album: data.album
        })!
        this.repository.deleteProviderTracksForTrack(trackId, 'netease')
        this.writeNeteaseProvider(trackId, data.neteaseId, data.neteaseUrl)
        return this.trackDetailDto(track)
      })
    })
  }

  deleteTrack(input: unknown): ApiResult<null> {
    return this.execute('删除歌曲失败，请重试', () => {
      const trackId = positiveId(inputRecord(input), 'trackId')
      if (!this.repository.deleteTrack(trackId)) this.notFound('歌曲不存在或已被删除')
      return null
    })
  }

  createTag(input: unknown): ApiResult<TagDto> {
    return this.execute('保存标签失败，请重试', () => {
      const record = inputRecord(input)
      const name = requiredString(record, 'name', '标签名称', 80)
      const color = this.normalizedColor(record)
      return tagDto(this.repository.createTag(name, color))
    })
  }

  updateTag(input: unknown): ApiResult<TagDto> {
    return this.execute('保存标签失败，请重试', () => {
      const record = inputRecord(input)
      const tagId = positiveId(record, 'tagId')
      const name = requiredString(record, 'name', '标签名称', 80)
      const color = this.normalizedColor(record)
      const tag = this.repository.updateTag(tagId, { name, color })
      if (!tag) this.notFound('标签不存在或已被删除')
      return tagDto(tag)
    })
  }

  deleteTag(input: unknown): ApiResult<null> {
    return this.execute('删除标签失败，请重试', () => {
      const tagId = positiveId(inputRecord(input), 'tagId')
      if (!this.repository.deleteTag(tagId)) this.notFound('标签不存在或已被删除')
      return null
    })
  }

  mergeTags(input: unknown): ApiResult<TagDto> {
    return this.execute('合并标签失败，请重试', () => {
      const record = inputRecord(input)
      const sourceTagId = positiveId(record, 'sourceTagId')
      const targetTagId = positiveId(record, 'targetTagId')
      if (sourceTagId === targetTagId) fieldError('sourceTagId', '请选择两个不同的标签')
      if (!this.repository.getTag(sourceTagId) || !this.repository.getTag(targetTagId)) {
        this.notFound('待合并的标签不存在')
      }
      return tagDto(this.repository.mergeTags(sourceTagId, targetTagId)!)
    })
  }

  setTrackTags(input: unknown): ApiResult<null> {
    return this.execute('保存标签关联失败，请重试', () => {
      const record = inputRecord(input)
      const trackId = positiveId(record, 'trackId')
      const tagIds = idList(record, 'tagIds')
      this.requireTrack(trackId)
      this.requireTags(tagIds)
      this.repository.setTrackTags(trackId, tagIds)
      return null
    })
  }

  createNote(input: unknown): ApiResult<NoteDto> {
    return this.execute('保存感悟失败，请重试', () => {
      const record = inputRecord(input)
      const trackId = positiveId(record, 'trackId')
      const body = requiredString(record, 'body', '感悟内容', 5000)
      this.requireTrack(trackId)
      return noteDto(this.repository.addNote(trackId, body))
    })
  }

  updateNote(input: unknown): ApiResult<NoteDto> {
    return this.execute('保存感悟失败，请重试', () => {
      const record = inputRecord(input)
      const noteId = positiveId(record, 'noteId')
      const body = requiredString(record, 'body', '感悟内容', 5000)
      const note = this.repository.updateNote(noteId, body)
      if (!note) this.notFound('感悟不存在或已被删除')
      return noteDto(note)
    })
  }

  deleteNote(input: unknown): ApiResult<null> {
    return this.execute('删除感悟失败，请重试', () => {
      const noteId = positiveId(inputRecord(input), 'noteId')
      if (!this.repository.deleteNote(noteId)) this.notFound('感悟不存在或已被删除')
      return null
    })
  }

  createMemory(input: unknown): ApiResult<MemoryDto> {
    return this.execute('保存事件失败，请重试', () => {
      const data = this.normalizedMemory(input)
      this.requireTracks(data.trackIds)

      return this.repository.transaction(() => {
        const memory = this.repository.createMemory(
          data.title,
          data.description,
          data.happenedAt,
          data.location,
          data.people
        )
        this.repository.setMemoryTracks(memory.id, data.trackIds)
        return this.memoryDto(memory)
      })
    })
  }

  updateMemory(input: unknown): ApiResult<MemoryDto> {
    return this.execute('保存事件失败，请重试', () => {
      const record = inputRecord(input)
      const memoryId = positiveId(record, 'memoryId')
      const data = this.normalizedMemory(record)
      if (!this.repository.getMemory(memoryId)) this.notFound('事件不存在或已被删除')
      this.requireTracks(data.trackIds)

      return this.repository.transaction(() => {
        const memory = this.repository.updateMemory(memoryId, {
          title: data.title,
          body: data.description,
          happenedAt: data.happenedAt,
          location: data.location,
          people: data.people
        })!
        this.repository.setMemoryTracks(memoryId, data.trackIds)
        return this.memoryDto(memory)
      })
    })
  }

  deleteMemory(input: unknown): ApiResult<null> {
    return this.execute('删除事件失败，请重试', () => {
      const memoryId = positiveId(inputRecord(input), 'memoryId')
      if (!this.repository.deleteMemory(memoryId)) this.notFound('事件不存在或已被删除')
      return null
    })
  }

  createCue(input: unknown): ApiResult<CueDto> {
    return this.execute('保存召回线索失败，请重试', () => {
      const record = inputRecord(input)
      const trackId = positiveId(record, 'trackId')
      const name = requiredString(record, 'name', '召回线索', 500)
      const kind = cueKind(record)
      this.requireTrack(trackId)
      return cueDto(this.repository.addAlias(trackId, name, kind))
    })
  }

  updateCue(input: unknown): ApiResult<CueDto> {
    return this.execute('保存召回线索失败，请重试', () => {
      const record = inputRecord(input)
      const cueId = positiveId(record, 'cueId')
      const name = requiredString(record, 'name', '召回线索', 500)
      const kind = cueKind(record)
      const cue = this.repository.updateAlias(cueId, name, kind)
      if (!cue) this.notFound('召回线索不存在或已被删除')
      return cueDto(cue)
    })
  }

  deleteCue(input: unknown): ApiResult<null> {
    return this.execute('删除召回线索失败，请重试', () => {
      const cueId = positiveId(inputRecord(input), 'cueId')
      if (!this.repository.deleteAlias(cueId)) this.notFound('召回线索不存在或已被删除')
      return null
    })
  }

  private execute<T>(fallbackMessage: string, operation: () => T): ApiResult<T> {
    try {
      return ok(operation())
    } catch (error) {
      if (error instanceof LibraryRequestError) {
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
          }
        }
      }

      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code.startsWith('SQLITE_CONSTRAINT')) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: '存在重复名称或重复的平台歌曲记录' }
        }
      }

      console.error(fallbackMessage, error)
      return { ok: false, error: { code: 'STORAGE', message: fallbackMessage } }
    }
  }

  private normalizedColor(record: InputRecord): string | null {
    const color = optionalString(record, 'color', '标签颜色', 20)
    if (color && !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) {
      fieldError('color', '标签颜色必须是十六进制颜色值')
    }
    return color
  }

  private normalizedMemory(input: unknown): {
    title: string
    description: string
    happenedAt: string | null
    location: string | null
    people: string | null
    trackIds: number[]
  } {
    const record = inputRecord(input)
    return {
      title: requiredString(record, 'title', '事件名称', 200),
      description: optionalString(record, 'description', '事件描述', 10000) ?? '',
      happenedAt: normalizeTimestamp(record),
      location: optionalString(record, 'location', '地点', 500),
      people: optionalString(record, 'people', '人物', 500),
      trackIds: idList(record, 'trackIds')
    }
  }

  private writeNeteaseProvider(
    trackId: number,
    neteaseId: string | null,
    neteaseUrl: string | null
  ): void {
    if (!neteaseId) return

    this.repository.addProviderTrack({
      trackId,
      provider: 'netease',
      providerTrackId: neteaseId,
      url: neteaseUrl,
      available: true,
      lastSeenAt: null,
      metadataJson: null
    })
  }

  private trackSummaryDto(track: Track): TrackSummaryDto {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      updatedAt: track.updatedAt,
      tags: this.repository.tagsForTrack(track.id).map(tagDto)
    }
  }

  private trackDetailDto(track: Track): TrackDetailDto {
    return {
      ...this.trackSummaryDto(track),
      durationMs: track.durationMs,
      providerTracks: this.repository.providerTracksForTrack(track.id).map(providerTrackDto),
      notes: this.repository.notesForTrack(track.id).map(noteDto),
      memories: this.repository.memoriesForTrack(track.id).map((memory) => this.memoryDto(memory)),
      cues: this.repository.aliasesForTrack(track.id).map(cueDto)
    }
  }

  private memoryDto(memory: Memory): MemoryDto {
    return {
      id: memory.id,
      title: memory.title,
      description: memory.body,
      happenedAt: memory.happenedAt,
      location: memory.location,
      people: memory.people,
      trackIds: this.repository.tracksForMemory(memory.id).map((track) => track.id),
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt
    }
  }

  private requireTrack(trackId: number): Track {
    const track = this.repository.getTrack(trackId)
    if (!track) this.notFound('歌曲不存在或已被删除')
    return track
  }

  private requireTracks(trackIds: number[]): void {
    for (const trackId of trackIds) this.requireTrack(trackId)
  }

  private requireTags(tagIds: number[]): void {
    for (const tagId of tagIds) {
      if (!this.repository.getTag(tagId)) this.notFound('所选标签不存在或已被删除')
    }
  }

  private notFound(message: string): never {
    throw new LibraryRequestError('NOT_FOUND', message)
  }
}
