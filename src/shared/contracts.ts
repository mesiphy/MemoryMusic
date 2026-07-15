export interface RuntimeInfo {
  platform: NodeJS.Platform
  versions: {
    chrome: string
    electron: string
    node: string
  }
}

export interface MemoryMusicApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
}
