import { describe, expect, it, vi } from 'vitest'
import {
  DATA_SAFETY_IPC_CHANNELS,
  type ApiResult,
  type DataSafetyRestoreResultDto
} from '../../shared/contracts'
import {
  registerDataSafetyIpcHandlers,
  type DataSafetyIpcHandlerRegistrar,
  type DataSafetyOperations
} from '../ipc/data-safety-ipc'

class FakeIpc implements DataSafetyIpcHandlerRegistrar {
  private readonly handlers = new Map<string, (event: object) => unknown>()

  handle(channel: string, handler: (event: object) => unknown): void {
    this.handlers.set(channel, handler)
  }

  async invoke<T>(channel: string): Promise<ApiResult<T>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return (await handler({})) as ApiResult<T>
  }
}

describe('data safety IPC', () => {
  it('uses fixed channels and restarts only after a prepared restore', async () => {
    const ipc = new FakeIpc()
    const scheduleRestart = vi.fn()
    const restoreBackup = vi
      .fn<() => Promise<ApiResult<DataSafetyRestoreResultDto>>>()
      .mockResolvedValueOnce({
        ok: true as const,
        value: {
          status: 'cancelled',
          fileName: null,
          completedAt: null,
          restartRequired: false
        }
      })
      .mockResolvedValueOnce({
        ok: true as const,
        value: {
          status: 'completed',
          fileName: 'restore.sqlite3',
          completedAt: '2026-07-19T08:00:00.000Z',
          restartRequired: true
        }
      })
    const service: DataSafetyOperations = {
      getStatus: vi.fn(() => ({
        ok: true as const,
        value: {
          schemaVersion: 4,
          exportFormatVersion: 1,
          automaticBackupCount: 1,
          lastAutomaticBackupAt: null,
          restorePending: false
        }
      })),
      createBackup: vi.fn(async () => ({
        ok: true as const,
        value: {
          status: 'cancelled' as const,
          fileName: null,
          completedAt: null
        }
      })),
      exportJson: vi.fn(async () => ({
        ok: true as const,
        value: {
          status: 'cancelled' as const,
          fileName: null,
          completedAt: null
        }
      })),
      restoreBackup
    }

    registerDataSafetyIpcHandlers(ipc, service, scheduleRestart)

    expect(await ipc.invoke(DATA_SAFETY_IPC_CHANNELS.getStatus)).toMatchObject({
      ok: true,
      value: { schemaVersion: 4, exportFormatVersion: 1 }
    })
    await ipc.invoke(DATA_SAFETY_IPC_CHANNELS.createBackup)
    await ipc.invoke(DATA_SAFETY_IPC_CHANNELS.exportJson)
    await ipc.invoke(DATA_SAFETY_IPC_CHANNELS.restoreBackup)
    expect(scheduleRestart).not.toHaveBeenCalled()

    await ipc.invoke(DATA_SAFETY_IPC_CHANNELS.restoreBackup)
    expect(scheduleRestart).toHaveBeenCalledOnce()
  })
})
