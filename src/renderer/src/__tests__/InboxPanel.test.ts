// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import InboxPanel from '../components/InboxPanel.vue'
import { testCaptureApi } from './test-api'

const item = {
  id: 3,
  trackId: 7,
  title: '海阔天空',
  artist: 'Beyond',
  captureText: '稍后补充旅行地点',
  sourceAppId: 'cloudmusic.exe',
  capturedAt: '2026-07-15T14:00:00.000Z'
}

describe('InboxPanel', () => {
  it('removes an item only after the resolve operation succeeds', async () => {
    const resolveInbox = vi.fn(async () => ({ ok: true as const, value: null }))
    const wrapper = mount(InboxPanel, {
      props: {
        api: testCaptureApi({
          listInbox: vi.fn(async () => ({ ok: true as const, value: [item] })),
          resolveInbox
        })
      }
    })
    await flushPromises()

    await wrapper.get('.inbox-item .text-button').trigger('click')
    await flushPromises()

    expect(resolveInbox).toHaveBeenCalledWith({ inboxItemId: 3 })
    expect(wrapper.text()).toContain('没有待整理记录')
  })

  it('keeps the item visible when resolving fails', async () => {
    const wrapper = mount(InboxPanel, {
      props: {
        api: testCaptureApi({
          listInbox: vi.fn(async () => ({ ok: true as const, value: [item] })),
          resolveInbox: vi.fn(async () => ({
            ok: false as const,
            error: { code: 'STORAGE' as const, message: '待整理箱暂时不可写' }
          }))
        })
      }
    })
    await flushPromises()

    await wrapper.get('.inbox-item .text-button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('海阔天空')
    expect(wrapper.get('[role="alert"]').text()).toContain('待整理箱暂时不可写')
  })
})
