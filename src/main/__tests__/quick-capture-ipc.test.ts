import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTURE_IPC_CHANNELS,
  type ApiResult,
  type NowPlayingDto,
  type QuickCaptureInboxItemDto,
  type QuickCaptureResultDto
} from '../../shared/contracts'
import {
  registerCaptureIpcHandlers,
  type CaptureInvokeHandler,
  type CaptureIpcHandlerRegistrar
} from '../ipc/capture-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from '../persistence/database'
import type { MediaSessionAdapter } from '../playback/playback-adapter'
import { QuickCaptureService } from '../services/quick-capture-service'

class FakeIpc implements CaptureIpcHandlerRegistrar {
  private readonly handlers = new Map<string, CaptureInvokeHandler>()

  handle(channel: string, handler: CaptureInvokeHandler): void {
    this.handlers.set(channel, handler)
  }

  async invoke<T>(channel: string, input?: unknown): Promise<ApiResult<T>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return (await handler({}, input)) as ApiResult<T>
  }
}

const playing: NowPlayingDto = {
  sourceAppId: 'cloudmusic.exe',
  title: '海阔天空',
  artist: 'Beyond',
  albumTitle: '乐与怒',
  status: 'playing'
}

describe('quick capture IPC service', () => {
  let database: SqliteDatabase
  let repository: MusicRepository
  let mediaSession: MediaSessionAdapter
  let ipc: FakeIpc

  beforeEach(() => {
    database = openMusicDatabase()
    repository = new MusicRepository(database)
    mediaSession = {
      getNowPlaying: vi.fn(async () => playing),
      pause: vi.fn(async () => ({ accepted: false, nowPlaying: playing })),
      resume: vi.fn(async () => ({ accepted: false, nowPlaying: playing })),
      next: vi.fn(async () => ({ accepted: false, nowPlaying: playing })),
      previous: vi.fn(async () => ({ accepted: false, nowPlaying: playing }))
    }
    ipc = new FakeIpc()
    registerCaptureIpcHandlers(ipc, new QuickCaptureService(repository, mediaSession))
  })

  afterEach(() => database.close())

  it('saves a one-line note, one tag, and an unresolved inbox item without duplicate tracks', async () => {
    const note = await ipc.invoke<QuickCaptureResultDto>(CAPTURE_IPC_CHANNELS.capture, {
      kind: 'note',
      text: '第一次听见时正在回家的路上'
    })
    const tag = await ipc.invoke<QuickCaptureResultDto>(CAPTURE_IPC_CHANNELS.capture, {
      kind: 'tag',
      text: ' 深夜循环 '
    })
    const inbox = await ipc.invoke<QuickCaptureResultDto>(CAPTURE_IPC_CHANNELS.capture, {
      kind: 'inbox',
      text: ''
    })

    expect(note).toMatchObject({ ok: true, value: { createdTrack: true, kind: 'note' } })
    expect(tag).toMatchObject({ ok: true, value: { createdTrack: false, kind: 'tag' } })
    expect(inbox).toMatchObject({
      ok: true,
      value: { createdTrack: false, kind: 'inbox', captureText: null }
    })
    expect(repository.listTracks()).toMatchObject([
      { title: '海阔天空', artist: 'Beyond', album: '乐与怒' }
    ])
    const trackId = repository.listTracks()[0].id
    expect(repository.notesForTrack(trackId)).toMatchObject([
      { body: '第一次听见时正在回家的路上' }
    ])
    expect(repository.tagsForTrack(trackId)).toMatchObject([{ name: '深夜循环' }])

    const pending = await ipc.invoke<QuickCaptureInboxItemDto[]>(CAPTURE_IPC_CHANNELS.listInbox)
    expect(pending).toMatchObject({
      ok: true,
      value: [{ trackId, title: '海阔天空', sourceAppId: 'cloudmusic.exe' }]
    })
    if (!pending.ok) throw new Error('Expected pending item')

    expect(
      await ipc.invoke(CAPTURE_IPC_CHANNELS.resolveInbox, {
        inboxItemId: pending.value[0].id
      })
    ).toEqual({ ok: true, value: null })
    expect(repository.listPendingQuickCaptureInboxItems()).toEqual([])
  })

  it('reuses an existing personal track without overwriting its metadata or annotations', async () => {
    const existing = repository.createTrack({
      title: '海阔天空',
      artist: 'Beyond',
      album: '我的专辑名',
      durationMs: 123
    })
    const memory = repository.createMemory('个人事件', '必须保留')
    repository.linkMemoryTrack(memory.id, existing.id)
    repository.addAlias(existing.id, '旧称')

    const result = await ipc.invoke<QuickCaptureResultDto>(CAPTURE_IPC_CHANNELS.capture, {
      kind: 'note',
      text: '新感悟'
    })

    expect(result).toMatchObject({
      ok: true,
      value: { trackId: existing.id, createdTrack: false }
    })
    expect(repository.getTrack(existing.id)).toMatchObject({
      album: '我的专辑名',
      durationMs: 123
    })
    expect(repository.memoriesForTrack(existing.id)).toMatchObject([{ title: '个人事件' }])
    expect(repository.aliasesForTrack(existing.id)).toMatchObject([{ name: '旧称' }])
  })

  it('validates input and reports a missing media session without writing data', async () => {
    expect(
      await ipc.invoke(CAPTURE_IPC_CHANNELS.capture, { kind: 'tag', text: ' ' })
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION', message: '请输入一个标签' } })

    vi.mocked(mediaSession.getNowPlaying).mockResolvedValue(null)
    expect(
      await ipc.invoke(CAPTURE_IPC_CHANNELS.capture, { kind: 'inbox', text: '' })
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(repository.listTracks()).toEqual([])
    expect(repository.listPendingQuickCaptureInboxItems()).toEqual([])
  })
})
