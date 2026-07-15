import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  LIBRARY_IPC_CHANNELS,
  type ApiResult,
  type LibrarySnapshotDto,
  type MemoryDto,
  type SearchIndexStatsDto,
  type SearchResponseDto,
  type TagDto,
  type TrackDetailDto
} from '../../shared/contracts'
import {
  registerLibraryIpcHandlers,
  type IpcHandlerRegistrar,
  type LibraryInvokeHandler
} from '../ipc/library-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from '../persistence/database'
import { LibraryService } from '../services/library-service'

class FakeIpc implements IpcHandlerRegistrar {
  private readonly handlers = new Map<string, LibraryInvokeHandler>()

  handle(channel: string, handler: LibraryInvokeHandler): void {
    this.handlers.set(channel, handler)
  }

  invoke<T>(channel: string, input?: unknown): ApiResult<T> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`)
    return handler({}, input) as ApiResult<T>
  }
}

const blankTrack = {
  title: '',
  artist: '',
  album: '',
  neteaseId: '',
  neteaseUrl: ''
}

describe('library IPC service', () => {
  let database: SqliteDatabase
  let ipc: FakeIpc

  beforeEach(() => {
    database = openMusicDatabase()
    ipc = new FakeIpc()
    registerLibraryIpcHandlers(ipc, new LibraryService(new MusicRepository(database)))
  })

  afterEach(() => database.close())

  it('rejects invalid input without creating partial records', () => {
    const result = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.createTrack, blankTrack)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { title: '请输入歌曲名称' } }
    })

    const snapshot = ipc.invoke<LibrarySnapshotDto>(LIBRARY_IPC_CHANNELS.getLibrary)
    expect(snapshot.ok && snapshot.value.tracks).toHaveLength(0)
  })

  it('creates and updates a track from a NetEase link and rolls back provider conflicts', () => {
    const created = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.createTrack, {
      ...blankTrack,
      title: '夜曲',
      artist: '周杰伦',
      neteaseUrl: 'https://music.163.com/#/song?id=185924'
    })
    expect(created).toMatchObject({
      ok: true,
      value: {
        title: '夜曲',
        providerTracks: [{ provider: 'netease', providerTrackId: '185924' }]
      }
    })

    const duplicate = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.createTrack, {
      ...blankTrack,
      title: '重复记录',
      neteaseId: '185924'
    })
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    const snapshot = ipc.invoke<LibrarySnapshotDto>(LIBRARY_IPC_CHANNELS.getLibrary)
    expect(snapshot.ok && snapshot.value.tracks).toHaveLength(1)

    if (!created.ok) throw new Error('Expected track creation to succeed')
    const updated = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.updateTrack, {
      ...blankTrack,
      trackId: created.value.id,
      title: '夜曲（现场）',
      artist: '周杰伦',
      album: '现场版'
    })
    expect(updated).toMatchObject({
      ok: true,
      value: { title: '夜曲（现场）', album: '现场版', providerTracks: [] }
    })
  })

  it('reuses and merges tags across multiple tracks', () => {
    const first = thisTrack(ipc, '第一首')
    const second = thisTrack(ipc, '第二首')
    const night = thisTag(ipc, '夜晚')
    const lateNight = thisTag(ipc, '深夜')

    expect(
      ipc.invoke(LIBRARY_IPC_CHANNELS.setTrackTags, {
        trackId: first.id,
        tagIds: [night.id, lateNight.id]
      })
    ).toEqual({ ok: true, value: null })
    expect(
      ipc.invoke(LIBRARY_IPC_CHANNELS.setTrackTags, {
        trackId: second.id,
        tagIds: [lateNight.id]
      })
    ).toEqual({ ok: true, value: null })

    const merged = ipc.invoke<TagDto>(LIBRARY_IPC_CHANNELS.mergeTags, {
      sourceTagId: lateNight.id,
      targetTagId: night.id
    })
    expect(merged).toMatchObject({ ok: true, value: { id: night.id } })

    for (const track of [first, second]) {
      const detail = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.getTrack, {
        trackId: track.id
      })
      expect(detail.ok && detail.value.tags).toEqual([expect.objectContaining({ id: night.id })])
    }
  })

  it('keeps multiple notes, cues, and one event linked to multiple tracks', () => {
    const first = thisTrack(ipc, '公路之歌')
    const second = thisTrack(ipc, '旅行的意义')

    const firstNote = ipc.invoke(LIBRARY_IPC_CHANNELS.createNote, {
      trackId: first.id,
      body: '第一次自驾时听到'
    })
    const secondNote = ipc.invoke(LIBRARY_IPC_CHANNELS.createNote, {
      trackId: first.id,
      body: '鼓点让人想起夜路'
    })
    expect(firstNote.ok && secondNote.ok).toBe(true)

    expect(
      ipc.invoke(LIBRARY_IPC_CHANNELS.createCue, {
        trackId: first.id,
        name: '我一直错记成“远方没有尽头”',
        kind: 'lyric'
      })
    ).toMatchObject({ ok: true, value: { kind: 'lyric' } })

    const memory = ipc.invoke<MemoryDto>(LIBRARY_IPC_CHANNELS.createMemory, {
      title: '青海湖自驾',
      description: '日落后沿湖开车',
      happenedAt: '2025-08-16T20:30',
      location: '青海湖',
      people: '小林、小周',
      trackIds: [first.id, second.id]
    })
    expect(memory).toMatchObject({
      ok: true,
      value: { location: '青海湖', trackIds: [first.id, second.id] }
    })

    for (const track of [first, second]) {
      const detail = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.getTrack, {
        trackId: track.id
      })
      expect(detail.ok && detail.value.memories).toHaveLength(1)
    }

    const firstDetail = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.getTrack, {
      trackId: first.id
    })
    expect(firstDetail.ok && firstDetail.value.notes).toHaveLength(2)
    expect(firstDetail.ok && firstDetail.value.cues).toHaveLength(1)
  })

  it('searches personal fields through IPC and explains why a track matched', () => {
    const track = thisTrack(ipc, '公路之歌')
    const tag = thisTag(ipc, '自驾')
    ipc.invoke(LIBRARY_IPC_CHANNELS.setTrackTags, { trackId: track.id, tagIds: [tag.id] })
    ipc.invoke(LIBRARY_IPC_CHANNELS.createNote, {
      trackId: track.id,
      body: '过隧道时鼓点突然响起来'
    })
    ipc.invoke(LIBRARY_IPC_CHANNELS.createMemory, {
      title: '青海湖自驾',
      description: '日落后沿湖开车',
      happenedAt: '2025-08-16T20:30',
      location: '青海湖',
      people: '小林',
      trackIds: [track.id]
    })

    const result = ipc.invoke<SearchResponseDto>(LIBRARY_IPC_CHANNELS.search, {
      query: '青海湖'
    })
    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: 'fts',
        results: [
          {
            track: { id: track.id, title: '公路之歌' },
            matchedPersonalField: true,
            matches: [expect.objectContaining({ field: 'memory' })]
          }
        ]
      }
    })

    const rebuilt = ipc.invoke<SearchIndexStatsDto>(LIBRARY_IPC_CHANNELS.rebuildSearchIndex)
    expect(rebuilt).toMatchObject({ ok: true, value: { documentCount: 1 } })
  })

  it('validates search input and records missing-field feedback for no results', () => {
    expect(
      ipc.invoke<SearchResponseDto>(LIBRARY_IPC_CHANNELS.search, { query: '　' })
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })

    const missing = ipc.invoke<SearchResponseDto>(LIBRARY_IPC_CHANNELS.search, {
      query: '记得旋律但没有记录'
    })
    if (!missing.ok || !missing.value.noResultLogId) {
      throw new Error('Expected a no-result search log')
    }

    expect(
      ipc.invoke(LIBRARY_IPC_CHANNELS.recordSearchFeedback, {
        queryLogId: missing.value.noResultLogId,
        missingField: 'note'
      })
    ).toEqual({ ok: true, value: null })
    expect(
      database.prepare('SELECT result_count, missing_field FROM search_query_log').get()
    ).toEqual({ result_count: 0, missing_field: 'note' })
  })
})

function thisTrack(ipc: FakeIpc, title: string): TrackDetailDto {
  const result = ipc.invoke<TrackDetailDto>(LIBRARY_IPC_CHANNELS.createTrack, {
    ...blankTrack,
    title
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function thisTag(ipc: FakeIpc, name: string): TagDto {
  const result = ipc.invoke<TagDto>(LIBRARY_IPC_CHANNELS.createTag, {
    name,
    color: '#d39b66'
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
