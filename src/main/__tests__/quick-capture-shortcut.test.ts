import { describe, expect, it, vi } from 'vitest'
import {
  installQuickCaptureShortcut,
  QUICK_CAPTURE_ACCELERATOR,
  type GlobalShortcutRegistrar
} from '../windows/quick-capture-shortcut'

describe('quick capture global shortcut', () => {
  it('opens the compact capture window and unregisters the exact accelerator', () => {
    let callback: (() => void) | undefined
    const registrar: GlobalShortcutRegistrar = {
      register: vi.fn((_accelerator, handler) => {
        callback = handler
        return true
      }),
      unregister: vi.fn()
    }
    const open = vi.fn()

    const installed = installQuickCaptureShortcut(registrar, open)
    callback?.()
    installed.dispose()

    expect(installed).toMatchObject({
      accelerator: QUICK_CAPTURE_ACCELERATOR,
      registered: true
    })
    expect(registrar.register).toHaveBeenCalledWith(QUICK_CAPTURE_ACCELERATOR, open)
    expect(open).toHaveBeenCalledOnce()
    expect(registrar.unregister).toHaveBeenCalledWith(QUICK_CAPTURE_ACCELERATOR)
  })

  it('does not attempt to unregister when Windows rejects the shortcut', () => {
    const registrar: GlobalShortcutRegistrar = {
      register: vi.fn(() => false),
      unregister: vi.fn()
    }

    const installed = installQuickCaptureShortcut(registrar, vi.fn())
    installed.dispose()

    expect(installed.registered).toBe(false)
    expect(registrar.unregister).not.toHaveBeenCalled()
  })
})
