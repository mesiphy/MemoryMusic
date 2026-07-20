// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { TrackDetailDto } from '@shared/contracts'
import TrackDetail from '../components/TrackDetail.vue'
import { testLibraryApi } from './test-api'

const track: TrackDetailDto = {
  id: 7,
  title: '夜曲',
  artist: '周杰伦',
  album: '十一月的萧邦',
  durationMs: null,
  updatedAt: '2026-07-15T00:00:00.000Z',
  tags: [{ id: 1, name: '夜晚', color: '#d39b66' }],
  personalCueCount: 1,
  providerTracks: [],
  notes: [],
  memories: [],
  cues: []
}

describe('TrackDetail', () => {
  it('saves multiple tag associations and adds another note', async () => {
    const setTrackTags = vi.fn(async () => ({ ok: true as const, value: null }))
    const createNote = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 10,
        body: '雨夜散步时听到',
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z'
      }
    }))
    const api = testLibraryApi({ setTrackTags, createNote })
    const wrapper = mount(TrackDetail, {
      props: {
        api,
        track,
        tags: [...track.tags, { id: 2, name: '散步', color: '#8cc28c' }]
      }
    })

    const checkboxes = wrapper.findAll('[data-testid="tag-options"] input[type="checkbox"]')
    await checkboxes[1].setValue(true)
    await wrapper.get('[data-testid="save-track-tags"]').trigger('click')
    await flushPromises()
    expect(setTrackTags).toHaveBeenCalledWith({ trackId: 7, tagIds: [1, 2] })

    await wrapper.get('[data-testid="new-note-input"]').setValue('雨夜散步时听到')
    await wrapper.get('form.composer').trigger('submit')
    await flushPromises()
    expect(createNote).toHaveBeenCalledWith({ trackId: 7, body: '雨夜散步时听到' })
    expect(
      (wrapper.get('[data-testid="new-note-input"]').element as HTMLTextAreaElement).value
    ).toBe('')
  })
})
