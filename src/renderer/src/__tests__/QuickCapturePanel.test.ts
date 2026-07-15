// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { NowPlayingDto } from '@shared/contracts'
import QuickCapturePanel from '../components/QuickCapturePanel.vue'
import { testCaptureApi } from './test-api'

const playing: NowPlayingDto = {
  sourceAppId: 'cloudmusic.exe',
  title: '海阔天空',
  artist: 'Beyond',
  albumTitle: '',
  status: 'playing'
}

describe('QuickCapturePanel', () => {
  it('keeps the sentence visible when saving fails', async () => {
    const capture = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE' as const, message: '数据库暂时不可用' }
    }))
    const wrapper = mount(QuickCapturePanel, {
      props: {
        api: testCaptureApi({
          getContext: vi.fn(async () => ({ ok: true as const, value: playing })),
          capture
        })
      }
    })
    await flushPromises()

    await wrapper.get('[data-testid="quick-capture-text"]').setValue('不会丢失的一句话')
    await wrapper.get('[data-testid="quick-capture-form"]').trigger('submit')
    await flushPromises()

    expect(capture).toHaveBeenCalledWith({ kind: 'note', text: '不会丢失的一句话' })
    expect(
      (wrapper.get('[data-testid="quick-capture-text"]').element as HTMLTextAreaElement).value
    ).toBe('不会丢失的一句话')
    expect(wrapper.get('[role="alert"]').text()).toContain('数据库暂时不可用')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('clears input and confirms only after a successful capture', async () => {
    const capture = vi.fn(async () => ({
      ok: true as const,
      value: {
        trackId: 1,
        title: '海阔天空',
        artist: 'Beyond',
        createdTrack: true,
        kind: 'tag' as const,
        captureText: '深夜循环',
        inboxItemId: null
      }
    }))
    const wrapper = mount(QuickCapturePanel, {
      props: {
        api: testCaptureApi({
          getContext: vi.fn(async () => ({ ok: true as const, value: playing })),
          capture
        })
      }
    })
    await flushPromises()

    await wrapper.get('input[value="tag"]').setValue()
    await wrapper.get('[data-testid="quick-capture-text"]').setValue('深夜循环')
    await wrapper.get('[data-testid="quick-capture-form"]').trigger('submit')
    await flushPromises()

    expect(capture).toHaveBeenCalledWith({ kind: 'tag', text: '深夜循环' })
    expect(
      (wrapper.get('[data-testid="quick-capture-text"]').element as HTMLInputElement).value
    ).toBe('')
    expect(wrapper.get('[role="status"]').text()).toContain('已保存')
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('allows a zero-text capture to enter the inbox', async () => {
    const capture = vi.fn(async () => ({
      ok: true as const,
      value: {
        trackId: 1,
        title: '海阔天空',
        artist: 'Beyond',
        createdTrack: true,
        kind: 'inbox' as const,
        captureText: null,
        inboxItemId: 1
      }
    }))
    const wrapper = mount(QuickCapturePanel, {
      props: {
        api: testCaptureApi({
          getContext: vi.fn(async () => ({ ok: true as const, value: playing })),
          capture
        })
      }
    })
    await flushPromises()

    await wrapper.get('input[value="inbox"]').setValue()
    await wrapper.get('[data-testid="quick-capture-form"]').trigger('submit')
    await flushPromises()

    expect(capture).toHaveBeenCalledWith({ kind: 'inbox', text: '' })
    expect(wrapper.get('[role="status"]').text()).toContain('待整理箱')
  })
})
