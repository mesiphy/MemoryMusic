import { CAPTURE_IPC_CHANNELS } from '../../shared/contracts'
import { QuickCaptureService } from '../services/quick-capture-service'

export type CaptureInvokeHandler = (event: object, input?: unknown) => unknown

export interface CaptureIpcHandlerRegistrar {
  handle(channel: string, handler: CaptureInvokeHandler): void
}

export function registerCaptureIpcHandlers(
  ipc: CaptureIpcHandlerRegistrar,
  service: QuickCaptureService
): void {
  ipc.handle(CAPTURE_IPC_CHANNELS.getContext, () => service.getContext())
  ipc.handle(CAPTURE_IPC_CHANNELS.capture, (_event, input) => service.capture(input))
  ipc.handle(CAPTURE_IPC_CHANNELS.listInbox, () => service.listInbox())
  ipc.handle(CAPTURE_IPC_CHANNELS.resolveInbox, (_event, input) => service.resolveInbox(input))
}
