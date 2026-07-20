// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { TrackSummaryDto } from '@shared/contracts'
import TrackList from '../components/TrackList.vue'

const tracks: TrackSummaryDto[] = [
  {
    id: 1,
    title: '已有线索',
    artist: null,
    album: null,
    updatedAt: '',
    tags: [],
    personalCueCount: 2
  },
  {
    id: 2,
    title: '等待标注',
    artist: null,
    album: null,
    updatedAt: '',
    tags: [],
    personalCueCount: 0
  }
]

describe('TrackList', () => {
  it('shows clue status and filters to unannotated tracks', async () => {
    const wrapper = mount(TrackList, {
      props: { tracks, selectedId: null }
    })

    expect(wrapper.text()).toContain('已有 2 条个人线索')
    expect(wrapper.text()).toContain('待补个人线索')

    await wrapper.get('.track-filter input').setValue(true)

    expect(wrapper.get('[data-testid="track-list"]').text()).not.toContain('已有线索')
    expect(wrapper.get('[data-testid="track-list"]').text()).toContain('等待标注')
  })
})
