import type { MemoryMusicApi } from '../shared/contracts'

declare global {
  interface Window {
    memoryMusic: MemoryMusicApi
  }
}

export {}
