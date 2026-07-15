import { contextBridge, ipcRenderer } from 'electron'
import {
  LIBRARY_IPC_CHANNELS,
  type ApiResult,
  type MemoryMusicApi,
  type RuntimeInfo
} from '../shared/contracts'

function invoke<T>(channel: string, input?: unknown): Promise<ApiResult<T>> {
  return ipcRenderer.invoke(channel, input) as Promise<ApiResult<T>>
}

const api: MemoryMusicApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info') as Promise<RuntimeInfo>,
  library: {
    getLibrary: () => invoke(LIBRARY_IPC_CHANNELS.getLibrary),
    getTrack: (input) => invoke(LIBRARY_IPC_CHANNELS.getTrack, input),
    createTrack: (input) => invoke(LIBRARY_IPC_CHANNELS.createTrack, input),
    updateTrack: (input) => invoke(LIBRARY_IPC_CHANNELS.updateTrack, input),
    deleteTrack: (input) => invoke(LIBRARY_IPC_CHANNELS.deleteTrack, input),
    createTag: (input) => invoke(LIBRARY_IPC_CHANNELS.createTag, input),
    updateTag: (input) => invoke(LIBRARY_IPC_CHANNELS.updateTag, input),
    deleteTag: (input) => invoke(LIBRARY_IPC_CHANNELS.deleteTag, input),
    mergeTags: (input) => invoke(LIBRARY_IPC_CHANNELS.mergeTags, input),
    setTrackTags: (input) => invoke(LIBRARY_IPC_CHANNELS.setTrackTags, input),
    createNote: (input) => invoke(LIBRARY_IPC_CHANNELS.createNote, input),
    updateNote: (input) => invoke(LIBRARY_IPC_CHANNELS.updateNote, input),
    deleteNote: (input) => invoke(LIBRARY_IPC_CHANNELS.deleteNote, input),
    createMemory: (input) => invoke(LIBRARY_IPC_CHANNELS.createMemory, input),
    updateMemory: (input) => invoke(LIBRARY_IPC_CHANNELS.updateMemory, input),
    deleteMemory: (input) => invoke(LIBRARY_IPC_CHANNELS.deleteMemory, input),
    createCue: (input) => invoke(LIBRARY_IPC_CHANNELS.createCue, input),
    updateCue: (input) => invoke(LIBRARY_IPC_CHANNELS.updateCue, input),
    deleteCue: (input) => invoke(LIBRARY_IPC_CHANNELS.deleteCue, input)
  }
}

contextBridge.exposeInMainWorld('memoryMusic', api)
