export interface RuntimeInfo {
  platform: NodeJS.Platform
  versions: {
    chrome: string
    electron: string
    node: string
  }
}

export type ApiErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE'

export interface ApiError {
  code: ApiErrorCode
  message: string
  fieldErrors?: Record<string, string>
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }

export type CueKind = 'alias' | 'lyric' | 'cue'

export interface ProviderTrackDto {
  id: number
  provider: string
  providerTrackId: string
  url: string | null
  available: boolean
}

export interface TagDto {
  id: number
  name: string
  color: string | null
}

export interface NoteDto {
  id: number
  body: string
  createdAt: string
  updatedAt: string
}

export interface CueDto {
  id: number
  name: string
  kind: CueKind
}

export interface MemoryDto {
  id: number
  title: string
  description: string
  happenedAt: string | null
  location: string | null
  people: string | null
  trackIds: number[]
  createdAt: string
  updatedAt: string
}

export interface TrackSummaryDto {
  id: number
  title: string
  artist: string | null
  album: string | null
  updatedAt: string
  tags: TagDto[]
}

export interface TrackDetailDto extends TrackSummaryDto {
  durationMs: number | null
  providerTracks: ProviderTrackDto[]
  notes: NoteDto[]
  memories: MemoryDto[]
  cues: CueDto[]
}

export interface LibrarySnapshotDto {
  tracks: TrackSummaryDto[]
  tags: TagDto[]
  memories: MemoryDto[]
}

export interface TrackFormInput {
  title: string
  artist: string
  album: string
  neteaseId: string
  neteaseUrl: string
}

export interface TrackIdInput {
  trackId: number
}

export interface UpdateTrackInput extends TrackFormInput, TrackIdInput {}

export interface CreateTagInput {
  name: string
  color: string
}

export interface UpdateTagInput extends CreateTagInput {
  tagId: number
}

export interface TagIdInput {
  tagId: number
}

export interface MergeTagsInput {
  sourceTagId: number
  targetTagId: number
}

export interface SetTrackTagsInput extends TrackIdInput {
  tagIds: number[]
}

export interface CreateNoteInput extends TrackIdInput {
  body: string
}

export interface UpdateNoteInput {
  noteId: number
  body: string
}

export interface NoteIdInput {
  noteId: number
}

export interface MemoryFormInput {
  title: string
  description: string
  happenedAt: string
  location: string
  people: string
  trackIds: number[]
}

export interface UpdateMemoryInput extends MemoryFormInput {
  memoryId: number
}

export interface MemoryIdInput {
  memoryId: number
}

export interface CreateCueInput extends TrackIdInput {
  name: string
  kind: CueKind
}

export interface UpdateCueInput {
  cueId: number
  name: string
  kind: CueKind
}

export interface CueIdInput {
  cueId: number
}

export interface LibraryApi {
  getLibrary(): Promise<ApiResult<LibrarySnapshotDto>>
  getTrack(input: TrackIdInput): Promise<ApiResult<TrackDetailDto>>
  createTrack(input: TrackFormInput): Promise<ApiResult<TrackDetailDto>>
  updateTrack(input: UpdateTrackInput): Promise<ApiResult<TrackDetailDto>>
  deleteTrack(input: TrackIdInput): Promise<ApiResult<null>>
  createTag(input: CreateTagInput): Promise<ApiResult<TagDto>>
  updateTag(input: UpdateTagInput): Promise<ApiResult<TagDto>>
  deleteTag(input: TagIdInput): Promise<ApiResult<null>>
  mergeTags(input: MergeTagsInput): Promise<ApiResult<TagDto>>
  setTrackTags(input: SetTrackTagsInput): Promise<ApiResult<null>>
  createNote(input: CreateNoteInput): Promise<ApiResult<NoteDto>>
  updateNote(input: UpdateNoteInput): Promise<ApiResult<NoteDto>>
  deleteNote(input: NoteIdInput): Promise<ApiResult<null>>
  createMemory(input: MemoryFormInput): Promise<ApiResult<MemoryDto>>
  updateMemory(input: UpdateMemoryInput): Promise<ApiResult<MemoryDto>>
  deleteMemory(input: MemoryIdInput): Promise<ApiResult<null>>
  createCue(input: CreateCueInput): Promise<ApiResult<CueDto>>
  updateCue(input: UpdateCueInput): Promise<ApiResult<CueDto>>
  deleteCue(input: CueIdInput): Promise<ApiResult<null>>
}

export interface MemoryMusicApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
  library: LibraryApi
}

export const LIBRARY_IPC_CHANNELS = {
  getLibrary: 'library:get',
  getTrack: 'library:track:get',
  createTrack: 'library:track:create',
  updateTrack: 'library:track:update',
  deleteTrack: 'library:track:delete',
  createTag: 'library:tag:create',
  updateTag: 'library:tag:update',
  deleteTag: 'library:tag:delete',
  mergeTags: 'library:tag:merge',
  setTrackTags: 'library:track:set-tags',
  createNote: 'library:note:create',
  updateNote: 'library:note:update',
  deleteNote: 'library:note:delete',
  createMemory: 'library:memory:create',
  updateMemory: 'library:memory:update',
  deleteMemory: 'library:memory:delete',
  createCue: 'library:cue:create',
  updateCue: 'library:cue:update',
  deleteCue: 'library:cue:delete'
} as const
