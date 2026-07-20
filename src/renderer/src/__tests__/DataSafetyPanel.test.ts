// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DataSafetyPanel from '../components/DataSafetyPanel.vue'
import { testDataSafetyApi } from './test-api'

describe('DataSafetyPanel', () => {
  it('reports confirmed backup and export success', async () => {
    const createBackup = vi.fn(async () => ({
      ok: true as const,
      value: {
        status: 'completed' as const,
        fileName: 'my-backup.sqlite3',
        completedAt: '2026-07-19T08:00:00.000Z'
      }
    }))
    const exportJson = vi.fn(async () => ({
      ok: true as const,
      value: {
        status: 'completed' as const,
        fileName: 'my-export.json',
        completedAt: '2026-07-19T08:01:00.000Z'
      }
    }))
    const wrapper = mount(DataSafetyPanel, {
      props: { api: testDataSafetyApi({ createBackup, exportJson }) }
    })
    await flushPromises()

    await wrapper.get('[data-action="backup"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('my-backup.sqlite3')

    await wrapper.get('[data-action="export"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('my-export.json')
  })

  it('keeps a failed restore visibly failed and never reports success', async () => {
    const wrapper = mount(DataSafetyPanel, {
      props: {
        api: testDataSafetyApi({
          restoreBackup: vi.fn(async () => ({
            ok: false as const,
            error: { code: 'VALIDATION' as const, message: '备份文件无效' }
          }))
        })
      }
    })
    await flushPromises()

    await wrapper.get('[data-action="restore"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('备份文件无效')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('treats a cancelled save dialog as neither success nor failure', async () => {
    const wrapper = mount(DataSafetyPanel, {
      props: {
        api: testDataSafetyApi({
          createBackup: vi.fn(async () => ({
            ok: true as const,
            value: { status: 'cancelled' as const, fileName: null, completedAt: null }
          }))
        })
      }
    })
    await flushPromises()

    await wrapper.get('[data-action="backup"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
})
