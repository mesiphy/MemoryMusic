import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IMPORT_IPC_CHANNELS, type ApiResult } from '../../shared/contracts'
import { MockNeteaseDataAdapter } from '../import/mock-netease-data-adapter'
import { registerImportIpcHandlers, type ImportIpcHandlerRegistrar } from '../ipc/import-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from '../persistence/database'
import { NeteaseImportService } from '../services/netease-import-service'

class FakeIpc implements ImportIpcHandlerRegistrar {
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

describe('NetEase import IPC', () => {
  let database: SqliteDatabase
  let repository: MusicRepository
  let ipc: FakeIpc

  beforeEach(() => {
    database = openMusicDatabase()
    repository = new MusicRepository(database)
    const adapter = new MockNeteaseDataAdapter(
      new Map([
        [
          MockNeteaseDataAdapter.startCursorKey(),
          {
            items: [
              {
                providerTrackId: '347230',
                title: '海阔天空',
                artist: 'Beyond',
                album: null,
                durationMs: null,
                url: 'https://music.163.com/song?id=347230',
                favoritedAt: null,
                available: true
              }
            ],
            nextCursor: null,
            checkpoint: 'ipc-checkpoint',
            unavailableProviderTrackIds: []
          }
        ]
      ])
    )
    ipc = new FakeIpc()
    registerImportIpcHandlers(ipc, new NeteaseImportService(repository, adapter))
  })

  afterEach(() => database.close())

  it('exposes status and sync through the fixed typed channels', async () => {
    expect(await ipc.invoke(IMPORT_IPC_CHANNELS.getStatus)).toMatchObject({
      ok: true,
      value: { available: true, sync: { status: 'idle' } }
    })
    expect(await ipc.invoke(IMPORT_IPC_CHANNELS.syncFavorites)).toMatchObject({
      ok: true,
      value: { importedCount: 1, processedCount: 1, sync: { status: 'succeeded' } }
    })
    expect(repository.getProviderTrack('netease', '347230')).toMatchObject({ available: true })
  })
})
