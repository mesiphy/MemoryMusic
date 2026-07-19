// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ImportPanel from '../components/ImportPanel.vue'
import { testImportApi } from './test-api'

const availableStatus = {
  available: true,
  unavailableReason: null,
  sync: {
    status: 'idle' as const,
    hasCursor: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    failureReason: null,
    retryCount: 0
  }
}

describe('ImportPanel', () => {
  it('confirms a successful favorite sync and requests a library refresh', async () => {
    const syncFavorites = vi.fn(async () => ({
      ok: true as const,
      value: {
        importedCount: 124,
        reusedTrackCount: 1,
        updatedMappingCount: 0,
        unavailableCount: 0,
        processedCount: 125,
        pageCount: 3,
        sync: { ...availableStatus.sync, status: 'succeeded' as const }
      }
    }))
    const wrapper = mount(ImportPanel, {
      props: {
        api: testImportApi({
          getStatus: vi.fn(async () => ({ ok: true as const, value: availableStatus })),
          syncFavorites
        })
      }
    })
    await flushPromises()

    await wrapper.get('button.full-width').trigger('click')
    await flushPromises()

    expect(syncFavorites).toHaveBeenCalledOnce()
    expect(wrapper.get('[role="status"]').text()).toContain('已处理 125 首')
    expect(wrapper.emitted('imported')).toHaveLength(1)
  })

  it('shows an explicit failure and never emits a false success', async () => {
    const wrapper = mount(ImportPanel, {
      props: {
        api: testImportApi({
          getStatus: vi.fn(async () => ({ ok: true as const, value: availableStatus })),
          syncFavorites: vi.fn(async () => ({
            ok: false as const,
            error: { code: 'SYNC' as const, message: '官方服务暂时不可用' }
          }))
        })
      }
    })
    await flushPromises()

    await wrapper.get('button.full-width').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('官方服务暂时不可用')
    expect(wrapper.emitted('imported')).toBeUndefined()
  })

  it('keeps offline use available while official authorization is missing', async () => {
    const wrapper = mount(ImportPanel, { props: { api: testImportApi() } })
    await flushPromises()

    expect(wrapper.text()).toContain('测试环境未配置')
    expect(wrapper.get('button.full-width').attributes('disabled')).toBeDefined()
  })
})
