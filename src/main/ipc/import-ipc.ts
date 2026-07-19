import { IMPORT_IPC_CHANNELS } from '../../shared/contracts'
import { NeteaseImportService } from '../services/netease-import-service'

export interface ImportIpcHandlerRegistrar {
  handle(channel: string, handler: (event: object) => unknown): void
}

export function registerImportIpcHandlers(
  ipc: ImportIpcHandlerRegistrar,
  service: NeteaseImportService
): void {
  ipc.handle(IMPORT_IPC_CHANNELS.getStatus, () => service.getStatus())
  ipc.handle(IMPORT_IPC_CHANNELS.syncFavorites, () => service.syncFavorites())
}
