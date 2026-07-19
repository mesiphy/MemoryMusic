import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { RuntimeInfo } from '../shared/contracts'
import { NcmCliNeteaseDataAdapter } from './import/ncm-cli-netease-data-adapter'
import { registerCaptureIpcHandlers } from './ipc/capture-ipc'
import { registerImportIpcHandlers } from './ipc/import-ipc'
import { registerLibraryIpcHandlers } from './ipc/library-ipc'
import { registerPlaybackIpcHandlers } from './ipc/playback-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from './persistence/database'
import { NeteaseProtocolPlaybackAdapter } from './playback/netease-protocol-adapter'
import { WindowsSmtcAdapter } from './playback/windows-smtc-adapter'
import { LibraryService } from './services/library-service'
import { NeteaseImportService } from './services/netease-import-service'
import { PlaybackService } from './services/playback-service'
import { QuickCaptureService } from './services/quick-capture-service'
import {
  installQuickCaptureShortcut,
  type InstalledQuickCaptureShortcut
} from './windows/quick-capture-shortcut'

const APP_ID = 'com.memorymusic.app'
const DATABASE_FILENAME = 'memory-music.sqlite3'

let musicDatabase: SqliteDatabase | undefined
let mainWindow: BrowserWindow | undefined
let quickCaptureWindow: BrowserWindow | undefined
let quickCaptureShortcut: InstalledQuickCaptureShortcut | undefined

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#11100f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow = window
  window.once('ready-to-show', () => window.show())
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  configureExternalLinks(window)
  void loadRenderer(window)

  return window
}

function createQuickCaptureWindow(): BrowserWindow {
  if (quickCaptureWindow && !quickCaptureWindow.isDestroyed()) {
    quickCaptureWindow.show()
    quickCaptureWindow.focus()
    return quickCaptureWindow
  }

  const window = new BrowserWindow({
    width: 430,
    height: 500,
    minWidth: 390,
    minHeight: 440,
    show: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    backgroundColor: '#11100f',
    title: 'MemoryMusic 快速记录',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  quickCaptureWindow = window
  window.once('ready-to-show', () => {
    window.show()
    window.focus()
  })
  window.once('closed', () => {
    if (quickCaptureWindow === window) quickCaptureWindow = undefined
  })

  configureExternalLinks(window)
  void loadRenderer(window, 'quickCapture=1')

  return window
}

function configureExternalLinks(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    let protocol = ''
    try {
      protocol = new URL(url).protocol
    } catch {
      return { action: 'deny' }
    }

    if (protocol === 'https:' || protocol === 'http:') {
      void shell.openExternal(url)
    }

    return { action: 'deny' }
  })
}

function loadRenderer(window: BrowserWindow, search = ''): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (search) url.search = search
    return window.loadURL(url.toString())
  }

  return window.loadFile(join(__dirname, '../renderer/index.html'), search ? { search } : undefined)
}

function closeMusicDatabase(): void {
  if (musicDatabase?.open) musicDatabase.close()
  musicDatabase = undefined
}

void app
  .whenReady()
  .then(() => {
    app.setAppUserModelId(APP_ID)
    musicDatabase = openMusicDatabase(join(app.getPath('userData'), DATABASE_FILENAME))
    const repository = new MusicRepository(musicDatabase)
    const mediaSessionAdapter = new WindowsSmtcAdapter()
    registerLibraryIpcHandlers(ipcMain, new LibraryService(repository))
    registerImportIpcHandlers(
      ipcMain,
      new NeteaseImportService(repository, new NcmCliNeteaseDataAdapter())
    )
    registerPlaybackIpcHandlers(
      ipcMain,
      new PlaybackService(
        repository,
        new NeteaseProtocolPlaybackAdapter({
          openExternal: (url) => shell.openExternal(url)
        }),
        mediaSessionAdapter
      )
    )
    registerCaptureIpcHandlers(ipcMain, new QuickCaptureService(repository, mediaSessionAdapter))

    ipcMain.handle('app:get-runtime-info', (): RuntimeInfo => {
      return {
        platform: process.platform,
        versions: {
          chrome: process.versions.chrome,
          electron: process.versions.electron,
          node: process.versions.node
        }
      }
    })

    createWindow()
    quickCaptureShortcut = installQuickCaptureShortcut(globalShortcut, () => {
      createQuickCaptureWindow()
    })
    if (!quickCaptureShortcut.registered) {
      console.warn('MemoryMusic quick capture shortcut could not be registered')
    }

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Failed to initialize the local database', error)
    dialog.showErrorBox('MemoryMusic 启动失败', '无法打开本地数据库，请检查磁盘空间和目录权限。')
    app.quit()
  })

app.on('before-quit', closeMusicDatabase)

app.on('will-quit', () => {
  quickCaptureShortcut?.dispose()
  quickCaptureShortcut = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
