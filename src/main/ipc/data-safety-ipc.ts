import {
  DATA_SAFETY_IPC_CHANNELS,
  type ApiResult,
  type DataSafetyRestoreResultDto
} from '../../shared/contracts'
import type { DataSafetyService } from '../services/data-safety-service'

export interface DataSafetyIpcHandlerRegistrar {
  handle(channel: string, handler: (event: object) => unknown): void
}

export type DataSafetyOperations = Pick<
  DataSafetyService,
  'getStatus' | 'createBackup' | 'exportJson' | 'restoreBackup'
>

export function registerDataSafetyIpcHandlers(
  ipc: DataSafetyIpcHandlerRegistrar,
  service: DataSafetyOperations,
  scheduleRestart: () => void
): void {
  ipc.handle(DATA_SAFETY_IPC_CHANNELS.getStatus, () => service.getStatus())
  ipc.handle(DATA_SAFETY_IPC_CHANNELS.createBackup, () => service.createBackup())
  ipc.handle(DATA_SAFETY_IPC_CHANNELS.exportJson, () => service.exportJson())
  ipc.handle(DATA_SAFETY_IPC_CHANNELS.restoreBackup, async () => {
    const result = (await service.restoreBackup()) as ApiResult<DataSafetyRestoreResultDto>
    if (result.ok && result.value.restartRequired) scheduleRestart()
    return result
  })
}
