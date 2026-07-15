import { contextBridge, ipcRenderer } from 'electron'
import type { MemoryMusicApi, RuntimeInfo } from '../shared/contracts'

const api: MemoryMusicApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('app:get-runtime-info') as Promise<RuntimeInfo>
}

contextBridge.exposeInMainWorld('memoryMusic', api)
