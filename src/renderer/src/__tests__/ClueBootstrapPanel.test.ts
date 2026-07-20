// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { TrackSummaryDto } from '@shared/contracts'
import ClueBootstrapPanel from '../components/ClueBootstrapPanel.vue'
import { testLibraryApi } from './test-api'

const tracks: TrackSummaryDto[] = [
  {
    id: 1,
    title: '公路之歌',
    artist: '痛仰',
    album: null,
    updatedAt: '2026-07-20T00:00:00.000Z',
    tags: [],
    personalCueCount: 0
  },
  {
    id: 2,
    title: '旅行的意义',
    artist: '陈绮贞',
    album: null,
    updatedAt: '2026-07-19T00:00:00.000Z',
    tags: [],
    personalCueCount: 1
  },
  {
    id: 3,
    title: '夜空中最亮的星',
    artist: '逃跑计划',
    album: null,
    updatedAt: '2026-07-18T00:00:00.000Z',
    tags: [],
    personalCueCount: 0
  }
]

describe('ClueBootstrapPanel', () => {
  it('shows coverage and saves one real clue for the selected unannotated track', async () => {
    const createCue = vi.fn(async () => ({
      ok: true as const,
      value: { id: 9, name: '第一次自驾去青海时循环', kind: 'cue' as const }
    }))
    const wrapper = mount(ClueBootstrapPanel, {
      props: {
        api: testLibraryApi({ createCue }),
        tracks,
        selectedId: 1
      }
    })

    expect(wrapper.get('[data-testid="clue-target-progress"]').text()).toContain('1/3')
    expect(wrapper.text()).toContain('已有个人线索 1 / 3 首')
    expect(wrapper.get('[data-testid="bootstrap-track"]').text()).toContain('公路之歌')

    await wrapper.get('[data-testid="bootstrap-input"]').setValue('第一次自驾去青海时循环')
    await wrapper.get('[data-testid="bootstrap-form"]').trigger('submit')
    await flushPromises()

    expect(createCue).toHaveBeenCalledWith({
      trackId: 1,
      kind: 'cue',
      name: '第一次自驾去青海时循环'
    })
    expect(wrapper.emitted('saved')).toEqual([[1]])
    expect(
      (wrapper.get('[data-testid="bootstrap-input"]').element as HTMLTextAreaElement).value
    ).toBe('')
  })

  it('keeps the clue visible when saving fails', async () => {
    const createCue = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'STORAGE' as const, message: '数据库暂时不可用' }
    }))
    const wrapper = mount(ClueBootstrapPanel, {
      props: {
        api: testLibraryApi({ createCue }),
        tracks,
        selectedId: 1
      }
    })

    const input = wrapper.get<HTMLTextAreaElement>('[data-testid="bootstrap-input"]')
    await input.setValue('这条不能丢')
    await wrapper.get('[data-testid="bootstrap-form"]').trigger('submit')
    await flushPromises()

    expect(input.element.value).toBe('这条不能丢')
    expect(wrapper.get('[role="alert"]').text()).toContain('数据库暂时不可用')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('skips to the next unannotated track without creating data', async () => {
    const wrapper = mount(ClueBootstrapPanel, {
      props: {
        api: testLibraryApi(),
        tracks,
        selectedId: 1
      }
    })

    await wrapper.get('.bootstrap-skip').trigger('click')

    expect(wrapper.emitted('select')).toEqual([[3]])
  })
})
