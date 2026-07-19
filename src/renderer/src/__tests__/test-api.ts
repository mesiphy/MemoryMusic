import { vi } from 'vitest'
import type { CaptureApi, ImportApi, LibraryApi, PlaybackApi } from '@shared/contracts'

export function testLibraryApi(overrides: Partial<LibraryApi> = {}): LibraryApi {
  const successNull = vi.fn(async () => ({ ok: true as const, value: null }))

  return {
    getLibrary: vi.fn(),
    getTrack: vi.fn(),
    createTrack: vi.fn(),
    updateTrack: vi.fn(),
    deleteTrack: successNull,
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: successNull,
    mergeTags: vi.fn(),
    setTrackTags: successNull,
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: successNull,
    createMemory: vi.fn(),
    updateMemory: vi.fn(),
    deleteMemory: successNull,
    createCue: vi.fn(),
    updateCue: vi.fn(),
    deleteCue: successNull,
    search: vi.fn(),
    recordSearchFeedback: successNull,
    rebuildSearchIndex: vi.fn(),
    ...overrides
  } as LibraryApi
}

export function testPlaybackApi(overrides: Partial<PlaybackApi> = {}): PlaybackApi {
  const noSession = vi.fn(async () => ({ ok: true as const, value: null }))
  const rejectedControl = vi.fn(async () => ({
    ok: true as const,
    value: { accepted: false, nowPlaying: null }
  }))

  return {
    play: vi.fn(),
    openWeb: vi.fn(),
    getNowPlaying: noSession,
    pause: rejectedControl,
    resume: rejectedControl,
    next: rejectedControl,
    previous: rejectedControl,
    ...overrides
  } as PlaybackApi
}

export function testCaptureApi(overrides: Partial<CaptureApi> = {}): CaptureApi {
  return {
    getContext: vi.fn(async () => ({ ok: true as const, value: null })),
    capture: vi.fn(),
    listInbox: vi.fn(async () => ({ ok: true as const, value: [] })),
    resolveInbox: vi.fn(async () => ({ ok: true as const, value: null })),
    ...overrides
  } as CaptureApi
}

export function testImportApi(overrides: Partial<ImportApi> = {}): ImportApi {
  return {
    getStatus: vi.fn(async () => ({
      ok: true as const,
      value: {
        available: false,
        unavailableReason: '测试环境未配置',
        sync: {
          status: 'idle' as const,
          hasCursor: false,
          lastAttemptAt: null,
          lastSuccessAt: null,
          failureReason: null,
          retryCount: 0
        }
      }
    })),
    syncFavorites: vi.fn(),
    ...overrides
  } as ImportApi
}
