export const QUICK_CAPTURE_ACCELERATOR = 'CommandOrControl+Shift+M'

export interface GlobalShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

export interface InstalledQuickCaptureShortcut {
  accelerator: string
  registered: boolean
  dispose(): void
}

export function installQuickCaptureShortcut(
  registrar: GlobalShortcutRegistrar,
  openQuickCapture: () => void
): InstalledQuickCaptureShortcut {
  const registered = registrar.register(QUICK_CAPTURE_ACCELERATOR, openQuickCapture)
  return {
    accelerator: QUICK_CAPTURE_ACCELERATOR,
    registered,
    dispose: () => {
      if (registered) registrar.unregister(QUICK_CAPTURE_ACCELERATOR)
    }
  }
}
