import { LIBRARY_IPC_CHANNELS } from '../../shared/contracts'
import { LibraryService } from '../services/library-service'

export type LibraryInvokeHandler = (event: object, input?: unknown) => unknown

export interface IpcHandlerRegistrar {
  handle(channel: string, handler: LibraryInvokeHandler): void
}

export function registerLibraryIpcHandlers(
  ipc: IpcHandlerRegistrar,
  service: LibraryService
): void {
  ipc.handle(LIBRARY_IPC_CHANNELS.getLibrary, () => service.getLibrary())
  ipc.handle(LIBRARY_IPC_CHANNELS.getTrack, (_event, input) => service.getTrack(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.createTrack, (_event, input) => service.createTrack(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.updateTrack, (_event, input) => service.updateTrack(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.deleteTrack, (_event, input) => service.deleteTrack(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.createTag, (_event, input) => service.createTag(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.updateTag, (_event, input) => service.updateTag(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.deleteTag, (_event, input) => service.deleteTag(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.mergeTags, (_event, input) => service.mergeTags(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.setTrackTags, (_event, input) => service.setTrackTags(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.createNote, (_event, input) => service.createNote(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.updateNote, (_event, input) => service.updateNote(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.deleteNote, (_event, input) => service.deleteNote(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.createMemory, (_event, input) => service.createMemory(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.updateMemory, (_event, input) => service.updateMemory(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.deleteMemory, (_event, input) => service.deleteMemory(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.createCue, (_event, input) => service.createCue(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.updateCue, (_event, input) => service.updateCue(input))
  ipc.handle(LIBRARY_IPC_CHANNELS.deleteCue, (_event, input) => service.deleteCue(input))
}
