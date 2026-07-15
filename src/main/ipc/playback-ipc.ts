import { PLAYBACK_IPC_CHANNELS } from '../../shared/contracts'
import type { IpcHandlerRegistrar } from './library-ipc'
import { PlaybackService } from '../services/playback-service'

export function registerPlaybackIpcHandlers(
  ipc: IpcHandlerRegistrar,
  service: PlaybackService
): void {
  ipc.handle(PLAYBACK_IPC_CHANNELS.play, (_event, input) => service.play(input))
  ipc.handle(PLAYBACK_IPC_CHANNELS.openWeb, (_event, input) => service.openWeb(input))
  ipc.handle(PLAYBACK_IPC_CHANNELS.getNowPlaying, () => service.getNowPlaying())
  ipc.handle(PLAYBACK_IPC_CHANNELS.pause, () => service.pause())
  ipc.handle(PLAYBACK_IPC_CHANNELS.resume, () => service.resume())
  ipc.handle(PLAYBACK_IPC_CHANNELS.next, () => service.next())
  ipc.handle(PLAYBACK_IPC_CHANNELS.previous, () => service.previous())
}
