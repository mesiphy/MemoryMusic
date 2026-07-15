import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import type { RuntimeInfo } from '../shared/contracts'
import { registerLibraryIpcHandlers } from './ipc/library-ipc'
import { MusicRepository, openMusicDatabase, type SqliteDatabase } from './persistence/database'
import { LibraryService } from './services/library-service'

const APP_ID = 'com.memorymusic.app'
const DATABASE_FILENAME = 'memory-music.sqlite3'

let musicDatabase: SqliteDatabase | undefined

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const protocol = new URL(url).protocol

    if (protocol === 'https:' || protocol === 'http:') {
      void shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
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
    registerLibraryIpcHandlers(ipcMain, new LibraryService(new MusicRepository(musicDatabase)))

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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Failed to initialize the local database', error)
    dialog.showErrorBox('MemoryMusic 启动失败', '无法打开本地数据库，请检查磁盘空间和目录权限。')
    app.quit()
  })

app.on('before-quit', closeMusicDatabase)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
