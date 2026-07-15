import { vi } from 'vitest'
import type { LibraryApi } from '@shared/contracts'

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
    ...overrides
  } as LibraryApi
}
