// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryApi } from '@shared/contracts'
import SearchPanel from '../components/SearchPanel.vue'
import { testLibraryApi, testPlaybackApi } from './test-api'

describe('SearchPanel', () => {
  it('shows field-level match reasons and selects a result', async () => {
    const search = vi.fn(async () => ({
      ok: true as const,
      value: {
        query: '青海湖',
        normalizedQuery: '青海湖',
        mode: 'fts' as const,
        noResultLogId: null,
        results: [
          {
            track: {
              id: 7,
              title: '公路之歌',
              artist: '痛仰',
              album: '不要停止我的音乐',
              updatedAt: '2026-07-15T10:00:00.000Z',
              tags: []
            },
            matches: [{ field: 'memory' as const, label: '事件', value: '青海湖自驾 · 日落' }],
            matchedPersonalField: true,
            exactTitle: false
          }
        ]
      }
    }))
    const wrapper = mount(SearchPanel, {
      props: { api: testLibraryApi({ search }), playbackApi: testPlaybackApi() }
    })

    await wrapper.get('[data-testid="search-input"]').setValue('青海湖')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(search).toHaveBeenCalledWith({ query: '青海湖' })
    expect(wrapper.get('[data-testid="search-results"]').text()).toContain('命中事件')
    expect(wrapper.text()).toContain('个人线索优先')

    await wrapper.get('.search-result-select').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[7]])
  })

  it('keeps the query when searching fails', async () => {
    const search = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE' as const, message: '搜索失败，请重试' }
    }))
    const wrapper = mount(SearchPanel, {
      props: { api: testLibraryApi({ search }), playbackApi: testPlaybackApi() }
    })
    const input = wrapper.get<HTMLInputElement>('[data-testid="search-input"]')

    await input.setValue('毕业晚会')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(input.element.value).toBe('毕业晚会')
    expect(wrapper.get('[role="alert"]').text()).toContain('搜索失败')
  })

  it('records the expected missing field after a no-result search', async () => {
    const search = vi.fn(async () => ({
      ok: true as const,
      value: {
        query: '那次海边日落',
        normalizedQuery: '那次海边日落',
        mode: 'fts' as const,
        noResultLogId: 12,
        results: []
      }
    }))
    const recordSearchFeedback = vi.fn(async () => ({ ok: true as const, value: null }))
    const wrapper = mount(SearchPanel, {
      props: {
        api: testLibraryApi({ search, recordSearchFeedback }),
        playbackApi: testPlaybackApi()
      }
    })

    await wrapper.get('[data-testid="search-input"]').setValue('那次海边日落')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="missing-field-select"]').setValue('memory')
    await wrapper.get('[data-testid="save-search-feedback"]').trigger('click')
    await flushPromises()

    expect(recordSearchFeedback).toHaveBeenCalledWith({
      queryLogId: 12,
      missingField: 'memory'
    })
    expect(wrapper.get('[role="status"]').text()).toContain('已记录')
  })

  it('plays from a search result and keeps a visible web fallback', async () => {
    const search = searchWithOneResult()
    const play = vi.fn(async () => ({
      ok: true as const,
      value: {
        trackId: 7,
        method: 'protocol' as const,
        protocolAttempted: true,
        webUrl: 'https://music.163.com/song?id=347230',
        message: '已请求网易云音乐播放；若客户端未开始播放，可打开歌曲网页。'
      }
    }))
    const openWeb = vi.fn(async () => ({
      ok: true as const,
      value: {
        trackId: 7,
        method: 'web' as const,
        protocolAttempted: false,
        webUrl: 'https://music.163.com/song?id=347230',
        message: '已打开网易云歌曲网页。'
      }
    }))
    const wrapper = mount(SearchPanel, {
      props: {
        api: testLibraryApi({ search }),
        playbackApi: testPlaybackApi({ play, openWeb })
      }
    })

    await wrapper.get('[data-testid="search-input"]').setValue('海阔天空')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="play-track-7"]').trigger('click')
    await flushPromises()

    expect(play).toHaveBeenCalledWith({ trackId: 7 })
    expect(wrapper.get('.playback-notice').text()).toContain('已请求网易云音乐播放')
    expect(wrapper.find('[data-testid="open-web-7"]').exists()).toBe(true)

    await wrapper.get('[data-testid="open-web-7"]').trigger('click')
    await flushPromises()
    expect(openWeb).toHaveBeenCalledWith({ trackId: 7 })
    expect(wrapper.get('.playback-notice').text()).toContain('已打开网易云歌曲网页')
  })

  it('keeps the query and exposes fallback after a playback failure', async () => {
    const play = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'PLAYBACK' as const, message: '协议唤起失败' }
    }))
    const wrapper = mount(SearchPanel, {
      props: {
        api: testLibraryApi({ search: searchWithOneResult() }),
        playbackApi: testPlaybackApi({ play })
      }
    })
    const input = wrapper.get<HTMLInputElement>('[data-testid="search-input"]')

    await input.setValue('海阔天空')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="play-track-7"]').trigger('click')
    await flushPromises()

    expect(input.element.value).toBe('海阔天空')
    expect(wrapper.get('.playback-notice[role="alert"]').text()).toContain('协议唤起失败')
    expect(wrapper.find('[data-testid="open-web-7"]').exists()).toBe(true)
  })
})

function searchWithOneResult(): LibraryApi['search'] {
  return vi.fn(async (input) => {
    void input
    return {
      ok: true as const,
      value: {
        query: '海阔天空',
        normalizedQuery: '海阔天空',
        mode: 'fts' as const,
        noResultLogId: null,
        results: [
          {
            track: {
              id: 7,
              title: '海阔天空',
              artist: 'Beyond',
              album: '乐与怒',
              updatedAt: '2026-07-15T10:00:00.000Z',
              tags: []
            },
            matches: [{ field: 'title' as const, label: '歌名', value: '海阔天空' }],
            matchedPersonalField: false,
            exactTitle: true
          }
        ]
      }
    }
  })
}
