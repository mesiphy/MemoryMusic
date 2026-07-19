import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLAYBACK_IPC_CHANNELS,
  type ApiResult,
  type NowPlayingDto,
  type PlaybackControlResultDto,
  type PlaybackLaunchResultDto
} from '../../shared/contracts'
import type { IpcHandlerRegistrar, LibraryInvokeHandler } from '../ipc/library-ipc'
import { registerPlaybackIpcHandlers } from '../ipc/playback-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from '../persistence/database'
import { MockPlaybackAdapter } from '../playback/mock-playback-adapter'
import { PlaybackAdapterError, type MediaSessionAdapter } from '../playback/playback-adapter'
import { PlaybackService } from '../services/playback-service'

class FakeIpc implements IpcHandlerRegistrar {
  private readonly handlers = new Map<string, LibraryInvokeHandler>()

  handle(channel: string, handler: LibraryInvokeHandler): void {
    this.handlers.set(channel, handler)
  }

  async invoke<T>(channel: string, input?: unknown): Promise<ApiResult<T>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return (await handler({}, input)) as ApiResult<T>
  }
}

describe('playback IPC service', () => {
  let database: SqliteDatabase
  let repository: MusicRepository
  let playback: MockPlaybackAdapter
  let mediaSession: MediaSessionAdapter
  let ipc: FakeIpc

  beforeEach(() => {
    database = openMusicDatabase()
    repository = new MusicRepository(database)
    playback = new MockPlaybackAdapter()
    mediaSession = {
      getNowPlaying: vi.fn(async () => null),
      pause: vi.fn(async () => ({ accepted: false, nowPlaying: null })),
      resume: vi.fn(async () => ({ accepted: false, nowPlaying: null })),
      next: vi.fn(async () => ({ accepted: false, nowPlaying: null })),
      previous: vi.fn(async () => ({ accepted: false, nowPlaying: null }))
    }
    ipc = new FakeIpc()
    registerPlaybackIpcHandlers(ipc, new PlaybackService(repository, playback, mediaSession))
  })

  afterEach(() => database.close())

  it('plays a mapped song without modifying any library or search records', async () => {
    const trackId = mappedTrack(repository)
    playback.playResult = {
      method: 'protocol',
      protocolAttempted: true,
      webUrl: 'https://music.163.com/song?id=347230'
    }
    const before = databaseSnapshot(database)

    const result = await ipc.invoke<PlaybackLaunchResultDto>(PLAYBACK_IPC_CHANNELS.play, {
      trackId
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        trackId,
        method: 'protocol',
        protocolAttempted: true
      }
    })
    expect(playback.playCalls).toEqual([{ provider: 'netease', providerTrackId: '347230' }])
    expect(databaseSnapshot(database)).toEqual(before)
  })

  it('validates track IDs and reports missing or unavailable provider mappings', async () => {
    expect(await ipc.invoke(PLAYBACK_IPC_CHANNELS.play, { trackId: '1' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' }
    })

    const track = repository.createTrack({
      title: '没有平台映射',
      artist: null,
      album: null,
      durationMs: null
    })
    expect(await ipc.invoke(PLAYBACK_IPC_CHANNELS.play, { trackId: track.id })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: expect.stringContaining('网易云歌曲 ID') }
    })

    const mappedId = mappedTrack(repository)
    repository.markProviderTrackUnavailable('netease', '347230')
    expect(await ipc.invoke(PLAYBACK_IPC_CHANNELS.play, { trackId: mappedId })).toMatchObject({
      ok: false,
      error: { code: 'PLAYBACK', message: expect.stringContaining('平台不可用') }
    })
    expect(await ipc.invoke(PLAYBACK_IPC_CHANNELS.openWeb, { trackId: mappedId })).toMatchObject({
      ok: true,
      value: { method: 'web' }
    })
  })

  it('keeps playback failures stable and preserves all personal data', async () => {
    const trackId = mappedTrack(repository)
    const tag = repository.createTag('珍藏')
    repository.tagTrack(trackId, tag.id)
    repository.addNote(trackId, '不能因播放失败丢失')
    const memory = repository.createMemory('旧旅行', '保留事件')
    repository.linkMemoryTrack(memory.id, trackId)
    repository.addAlias(trackId, '旧称呼')
    const before = databaseSnapshot(database)
    playback.playError = new PlaybackAdapterError('协议和网页都不可用')

    const result = await ipc.invoke<PlaybackLaunchResultDto>(PLAYBACK_IPC_CHANNELS.play, {
      trackId
    })

    expect(result).toEqual({
      ok: false,
      error: { code: 'PLAYBACK', message: '协议和网页都不可用' }
    })
    expect(databaseSnapshot(database)).toEqual(before)
  })

  it('exposes current media and all four SMTC controls through typed IPC', async () => {
    const nowPlaying: NowPlayingDto = {
      sourceAppId: 'cloudmusic.exe',
      title: '海阔天空',
      artist: 'Beyond',
      albumTitle: '',
      status: 'playing'
    }
    vi.mocked(mediaSession.getNowPlaying).mockResolvedValue(nowPlaying)
    for (const method of ['pause', 'resume', 'next', 'previous'] as const) {
      vi.mocked(mediaSession[method]).mockResolvedValue({ accepted: true, nowPlaying })
    }

    expect(await ipc.invoke<NowPlayingDto | null>(PLAYBACK_IPC_CHANNELS.getNowPlaying)).toEqual({
      ok: true,
      value: nowPlaying
    })

    for (const channel of [
      PLAYBACK_IPC_CHANNELS.pause,
      PLAYBACK_IPC_CHANNELS.resume,
      PLAYBACK_IPC_CHANNELS.next,
      PLAYBACK_IPC_CHANNELS.previous
    ]) {
      expect(await ipc.invoke<PlaybackControlResultDto>(channel)).toEqual({
        ok: true,
        value: { accepted: true, nowPlaying }
      })
    }
  })
})

function mappedTrack(repository: MusicRepository): number {
  const track = repository.createTrack({
    title: '海阔天空',
    artist: 'Beyond',
    album: null,
    durationMs: null
  })
  repository.addProviderTrack({
    trackId: track.id,
    provider: 'netease',
    providerTrackId: '347230',
    url: null,
    available: true,
    lastSeenAt: null,
    metadataJson: null
  })
  return track.id
}

function databaseSnapshot(database: SqliteDatabase): unknown {
  return {
    tracks: database.prepare('SELECT * FROM tracks ORDER BY id').all(),
    providers: database.prepare('SELECT * FROM provider_tracks ORDER BY id').all(),
    tags: database.prepare('SELECT * FROM tags ORDER BY id').all(),
    trackTags: database.prepare('SELECT * FROM track_tags ORDER BY track_id, tag_id').all(),
    notes: database.prepare('SELECT * FROM notes ORDER BY id').all(),
    memories: database.prepare('SELECT * FROM memories ORDER BY id').all(),
    memoryTracks: database
      .prepare('SELECT * FROM memory_tracks ORDER BY memory_id, track_id')
      .all(),
    aliases: database.prepare('SELECT * FROM aliases ORDER BY id').all(),
    searchDocuments: database.prepare('SELECT * FROM search_documents ORDER BY track_id').all()
  }
}
