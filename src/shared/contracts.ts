export interface RuntimeInfo {
  platform: NodeJS.Platform
  versions: {
    chrome: string
    electron: string
    node: string
  }
}

export type ApiErrorCode =
  'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE' | 'PLAYBACK' | 'SYNC' | 'UNSUPPORTED'

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

export type SearchField =
  'title' | 'artist' | 'album' | 'alias' | 'lyric' | 'cue' | 'tag' | 'note' | 'memory'

export type SearchMode = 'fts' | 'substring'

export interface SearchMatchDto {
  field: SearchField
  label: string
  value: string
}

export interface SearchResultDto {
  track: TrackSummaryDto
  matches: SearchMatchDto[]
  matchedPersonalField: boolean
  exactTitle: boolean
}

export interface SearchResponseDto {
  query: string
  normalizedQuery: string
  mode: SearchMode
  results: SearchResultDto[]
  noResultLogId: number | null
}

export interface SearchIndexStatsDto {
  documentCount: number
  rebuiltAt: string
}

export type PlaybackLaunchMethod = 'protocol' | 'web'

export interface PlaybackLaunchResultDto {
  trackId: number
  method: PlaybackLaunchMethod
  protocolAttempted: boolean
  webUrl: string
  message: string
}

export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'closed' | 'unknown'

export interface NowPlayingDto {
  sourceAppId: string
  title: string
  artist: string
  albumTitle: string
  status: PlaybackStatus
}

export interface PlaybackControlResultDto {
  accepted: boolean
  nowPlaying: NowPlayingDto | null
}

export type SyncStatusDto = 'idle' | 'running' | 'succeeded' | 'failed'

export interface NeteaseSyncStateDto {
  status: SyncStatusDto
  hasCursor: boolean
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  failureReason: string | null
  retryCount: number
}

export interface NeteaseImportStatusDto {
  available: boolean
  unavailableReason: string | null
  sync: NeteaseSyncStateDto
}

export interface NeteaseImportResultDto {
  importedCount: number
  reusedTrackCount: number
  updatedMappingCount: number
  unavailableCount: number
  processedCount: number
  pageCount: number
  sync: NeteaseSyncStateDto
}

export type QuickCaptureKind = 'tag' | 'note' | 'inbox'

export interface QuickCaptureInput {
  kind: QuickCaptureKind
  text: string
}

export interface QuickCaptureResultDto {
  trackId: number
  title: string
  artist: string | null
  createdTrack: boolean
  kind: QuickCaptureKind
  captureText: string | null
  inboxItemId: number | null
}

export interface QuickCaptureInboxItemDto {
  id: number
  trackId: number
  title: string
  artist: string | null
  captureText: string | null
  sourceAppId: string
  capturedAt: string
}

export interface ResolveQuickCaptureInboxInput {
  inboxItemId: number
}

export type SearchMissingField =
  'title' | 'artist' | 'album' | 'alias' | 'lyric' | 'tag' | 'note' | 'memory' | 'other'

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

export interface SearchInput {
  query: string
}

export interface RecordSearchFeedbackInput {
  queryLogId: number
  missingField: SearchMissingField
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
  search(input: SearchInput): Promise<ApiResult<SearchResponseDto>>
  recordSearchFeedback(input: RecordSearchFeedbackInput): Promise<ApiResult<null>>
  rebuildSearchIndex(): Promise<ApiResult<SearchIndexStatsDto>>
}

export interface PlaybackApi {
  play(input: TrackIdInput): Promise<ApiResult<PlaybackLaunchResultDto>>
  openWeb(input: TrackIdInput): Promise<ApiResult<PlaybackLaunchResultDto>>
  getNowPlaying(): Promise<ApiResult<NowPlayingDto | null>>
  pause(): Promise<ApiResult<PlaybackControlResultDto>>
  resume(): Promise<ApiResult<PlaybackControlResultDto>>
  next(): Promise<ApiResult<PlaybackControlResultDto>>
  previous(): Promise<ApiResult<PlaybackControlResultDto>>
}

export interface ImportApi {
  getStatus(): Promise<ApiResult<NeteaseImportStatusDto>>
  syncFavorites(): Promise<ApiResult<NeteaseImportResultDto>>
}

export interface CaptureApi {
  getContext(): Promise<ApiResult<NowPlayingDto | null>>
  capture(input: QuickCaptureInput): Promise<ApiResult<QuickCaptureResultDto>>
  listInbox(): Promise<ApiResult<QuickCaptureInboxItemDto[]>>
  resolveInbox(input: ResolveQuickCaptureInboxInput): Promise<ApiResult<null>>
}

export interface MemoryMusicApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
  library: LibraryApi
  playback: PlaybackApi
  importer: ImportApi
  capture: CaptureApi
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
  deleteCue: 'library:cue:delete',
  search: 'library:search',
  recordSearchFeedback: 'library:search:feedback',
  rebuildSearchIndex: 'library:search:rebuild'
} as const

export const PLAYBACK_IPC_CHANNELS = {
  play: 'playback:play',
  openWeb: 'playback:open-web',
  getNowPlaying: 'playback:now-playing',
  pause: 'playback:pause',
  resume: 'playback:resume',
  next: 'playback:next',
  previous: 'playback:previous'
} as const

export const IMPORT_IPC_CHANNELS = {
  getStatus: 'import:netease:status',
  syncFavorites: 'import:netease:sync-favorites'
} as const

export const CAPTURE_IPC_CHANNELS = {
  getContext: 'capture:context',
  capture: 'capture:save',
  listInbox: 'capture:inbox:list',
  resolveInbox: 'capture:inbox:resolve'
} as const
