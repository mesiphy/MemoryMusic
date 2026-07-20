// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MemoryPanel from '../components/MemoryPanel.vue'
import { testLibraryApi } from './test-api'

describe('MemoryPanel', () => {
  it('creates one event associated with multiple tracks', async () => {
    const createMemory = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 9,
        title: '青海湖自驾',
        description: '',
        happenedAt: null,
        location: null,
        people: null,
        trackIds: [1, 2],
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z'
      }
    }))
    const wrapper = mount(MemoryPanel, {
      props: {
        api: testLibraryApi({ createMemory }),
        memories: [],
        tracks: [
          {
            id: 1,
            title: '公路之歌',
            artist: null,
            album: null,
            updatedAt: '',
            tags: [],
            personalCueCount: 0
          },
          {
            id: 2,
            title: '旅行的意义',
            artist: null,
            album: null,
            updatedAt: '',
            tags: [],
            personalCueCount: 0
          }
        ]
      }
    })

    await wrapper.get('[data-testid="memory-title-input"]').setValue('青海湖自驾')
    const checkboxes = wrapper.findAll('[data-testid="memory-track-options"] input')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    await wrapper.get('[data-testid="memory-form"]').trigger('submit')
    await flushPromises()

    expect(createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ title: '青海湖自驾', trackIds: [1, 2] })
    )
    expect(
      (wrapper.get('[data-testid="memory-title-input"]').element as HTMLInputElement).value
    ).toBe('')
  })
})
