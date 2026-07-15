// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { NowPlayingDto } from '@shared/contracts'
import NowPlayingPanel from '../components/NowPlayingPanel.vue'
import { testPlaybackApi } from './test-api'

const playing: NowPlayingDto = {
  sourceAppId: 'cloudmusic.exe',
  title: '海阔天空',
  artist: 'Beyond',
  albumTitle: '',
  status: 'playing'
}

describe('NowPlayingPanel', () => {
  it('reads the current song and confirms a successful pause', async () => {
    const getNowPlaying = vi.fn(async () => ({ ok: true as const, value: playing }))
    const pause = vi.fn(async () => ({
      ok: true as const,
      value: { accepted: true, nowPlaying: { ...playing, status: 'paused' as const } }
    }))
    const wrapper = mount(NowPlayingPanel, {
      props: { api: testPlaybackApi({ getNowPlaying, pause }) }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('海阔天空')
    expect(wrapper.text()).toContain('正在播放')
    await wrapper.get('[data-testid="media-pause"]').trigger('click')
    await flushPromises()

    expect(pause).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('已暂停')
    expect(wrapper.get('[role="status"]').text()).toContain('已执行')
  })

  it('keeps the current song visible when a control fails', async () => {
    const next = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'PLAYBACK' as const, message: '下一首控制失败' }
    }))
    const wrapper = mount(NowPlayingPanel, {
      props: {
        api: testPlaybackApi({
          getNowPlaying: vi.fn(async () => ({ ok: true as const, value: playing })),
          next
        })
      }
    })
    await flushPromises()

    await wrapper.get('[data-testid="media-next"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('海阔天空')
    expect(wrapper.get('[role="alert"]').text()).toContain('下一首控制失败')
  })
})
