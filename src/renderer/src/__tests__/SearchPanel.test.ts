// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SearchPanel from '../components/SearchPanel.vue'
import { testLibraryApi } from './test-api'

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
    const wrapper = mount(SearchPanel, { props: { api: testLibraryApi({ search }) } })

    await wrapper.get('[data-testid="search-input"]').setValue('青海湖')
    await wrapper.get('[data-testid="search-form"]').trigger('submit')
    await flushPromises()

    expect(search).toHaveBeenCalledWith({ query: '青海湖' })
    expect(wrapper.get('[data-testid="search-results"]').text()).toContain('命中事件')
    expect(wrapper.text()).toContain('个人线索优先')

    await wrapper.get('.search-result-card').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[7]])
  })

  it('keeps the query when searching fails', async () => {
    const search = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE' as const, message: '搜索失败，请重试' }
    }))
    const wrapper = mount(SearchPanel, { props: { api: testLibraryApi({ search }) } })
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
      props: { api: testLibraryApi({ search, recordSearchFeedback }) }
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
})
