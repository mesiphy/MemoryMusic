import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  shell,
  type MessageBoxOptions,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
import { join } from 'node:path'
import type { RuntimeInfo } from '../shared/contracts'
import { applyPendingRestore, createStartupBackupIfNeeded } from './data-safety/database-files'
import { NcmCliNeteaseDataAdapter } from './import/ncm-cli-netease-data-adapter'
import { registerCaptureIpcHandlers } from './ipc/capture-ipc'
import { registerDataSafetyIpcHandlers } from './ipc/data-safety-ipc'
import { registerImportIpcHandlers } from './ipc/import-ipc'
import { registerLibraryIpcHandlers } from './ipc/library-ipc'
import { registerPlaybackIpcHandlers } from './ipc/playback-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from './persistence/database'
import { NeteaseProtocolPlaybackAdapter } from './playback/netease-protocol-adapter'
import { WindowsSmtcAdapter } from './playback/windows-smtc-adapter'
import { DataSafetyService, type DataSafetyDialogAdapter } from './services/data-safety-service'
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

function createDataSafetyDialogs(): DataSafetyDialogAdapter {
  const documentsPath = app.getPath('documents')

  return {
    chooseBackupDestination: async (defaultFileName) => {
      const result = await showSaveDialog({
        title: '保存 MemoryMusic 数据库备份',
        defaultPath: join(documentsPath, defaultFileName),
        filters: [{ name: 'SQLite 数据库', extensions: ['sqlite3'] }]
      })
      return result.canceled ? null : (result.filePath ?? null)
    },
    chooseExportDestination: async (defaultFileName) => {
      const result = await showSaveDialog({
        title: '导出 MemoryMusic JSON',
        defaultPath: join(documentsPath, defaultFileName),
        filters: [{ name: 'JSON 数据', extensions: ['json'] }]
      })
      return result.canceled ? null : (result.filePath ?? null)
    },
    chooseRestoreSource: async () => {
      const result = await showOpenDialog({
        title: '选择 MemoryMusic 数据库备份',
        properties: ['openFile'],
        filters: [{ name: 'SQLite 数据库', extensions: ['sqlite3', 'db'] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    confirmRestore: async (fileName) => {
      const result = await showMessageBox({
        type: 'warning',
        title: '确认恢复备份',
        message: `要从“${fileName}”恢复吗？`,
        detail: '恢复会替换当前资料并重启应用。MemoryMusic 会先自动保存一份恢复前备份。',
        buttons: ['取消', '恢复并重启'],
        cancelId: 0,
        defaultId: 0,
        noLink: true
      })
      return result.response === 1
    }
  }
}

function showSaveDialog(options: SaveDialogOptions): ReturnType<typeof dialog.showSaveDialog> {
  return mainWindow && !mainWindow.isDestroyed()
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options)
}

function showOpenDialog(options: OpenDialogOptions): ReturnType<typeof dialog.showOpenDialog> {
  return mainWindow && !mainWindow.isDestroyed()
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options)
}

function showMessageBox(options: MessageBoxOptions): ReturnType<typeof dialog.showMessageBox> {
  return mainWindow && !mainWindow.isDestroyed()
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options)
}

function scheduleRestart(): void {
  setTimeout(() => {
    closeMusicDatabase()
    app.relaunch()
    app.exit(0)
  }, 600)
}

void app
  .whenReady()
  .then(async () => {
    app.setAppUserModelId(APP_ID)
    const userDataPath = app.getPath('userData')
    const databasePath = join(userDataPath, DATABASE_FILENAME)
    const pendingRestore = applyPendingRestore(databasePath, userDataPath)

    try {
      await createStartupBackupIfNeeded(databasePath, userDataPath, new Date())
    } catch {
      console.warn('MemoryMusic could not create the pre-migration automatic backup')
    }

    musicDatabase = openMusicDatabase(databasePath)
    const repository = new MusicRepository(musicDatabase)
    const mediaSessionAdapter = new WindowsSmtcAdapter()
    const dataSafetyService = new DataSafetyService(
      musicDatabase,
      databasePath,
      userDataPath,
      createDataSafetyDialogs()
    )
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
    registerDataSafetyIpcHandlers(ipcMain, dataSafetyService, scheduleRestart)

    try {
      await dataSafetyService.createAutomaticBackupIfNeeded()
    } catch {
      console.warn('MemoryMusic could not create the daily automatic backup')
    }

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

    const window = createWindow()
    if (pendingRestore.rejected) {
      void dialog.showMessageBox(window, {
        type: 'warning',
        title: '备份恢复已取消',
        message: '暂存的恢复文件未通过完整性检查。',
        detail: '当前资料没有被替换。请重新选择一份有效的 MemoryMusic 备份。',
        buttons: ['知道了']
      })
    }
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
