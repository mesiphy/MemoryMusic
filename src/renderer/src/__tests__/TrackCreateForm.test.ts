// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TrackCreateForm from '../components/TrackCreateForm.vue'

describe('TrackCreateForm', () => {
  it('keeps user input and shows feedback when saving fails', async () => {
    const save = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE' as const, message: '数据库暂时不可用' }
    }))
    const wrapper = mount(TrackCreateForm, { props: { save } })

    await wrapper.get('[data-testid="track-title-input"]').setValue('不会丢失的输入')
    await wrapper.get('[data-testid="track-create-form"]').trigger('submit')
    await flushPromises()

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: '不会丢失的输入' }))
    expect(
      (wrapper.get('[data-testid="track-title-input"]').element as HTMLInputElement).value
    ).toBe('不会丢失的输入')
    expect(wrapper.text()).toContain('数据库暂时不可用')
  })

  it('clears the form only after a confirmed save', async () => {
    const save = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 1,
        title: '已保存',
        artist: null,
        album: null,
        durationMs: null,
        updatedAt: '2026-07-15T00:00:00.000Z',
        tags: [],
        providerTracks: [],
        notes: [],
        memories: [],
        cues: []
      }
    }))
    const wrapper = mount(TrackCreateForm, { props: { save } })

    await wrapper.get('[data-testid="track-title-input"]').setValue('已保存')
    await wrapper.get('[data-testid="track-create-form"]').trigger('submit')
    await flushPromises()

    expect(
      (wrapper.get('[data-testid="track-title-input"]').element as HTMLInputElement).value
    ).toBe('')
  })
})
