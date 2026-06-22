import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { IPC_CHANNELS, type OldPackageIndexResult } from '../shared/ipc'
import { registerBaiduOcrHandlers } from './baiduOcr'
import { registerElementCaptureHandlers } from './elementCapture'
import { registerLocalDataHandlers } from './localData'
import { registerWandaHttpHandlers } from './wandaHttp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 780,
    frame: false,
    backgroundColor: '#f4f7fb',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // 当前 Electron/Vite preload 需要关闭 sandbox；renderer 仍只通过 contextBridge 访问白名单 API。
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function getWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function getLocalIp(): string {
  const networks = networkInterfaces()

  for (const addresses of Object.values(networks)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address
      }
    }
  }

  return '127.0.0.1'
}

function oldPackageIndexError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined

  if (code === 'ENOENT') {
    return '旧包索引文件不存在'
  }

  if (error instanceof SyntaxError) {
    return '旧包索引内容不是有效 JSON'
  }

  return '旧包索引读取失败'
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function oldPackageIndexPaths(): string[] {
  const appPath = app.getAppPath()
  const relativeIndexPath = join('docs', 'old-package-index.json')
  const appPaths = [
    join(appPath, '..', relativeIndexPath),
    join(appPath, relativeIndexPath),
    join(appPath, '..', '..', relativeIndexPath)
  ]
  const devPaths = app.isPackaged
    ? []
    : [
        join(process.cwd(), '..', relativeIndexPath),
        join(process.cwd(), relativeIndexPath)
      ]

  return [...appPaths, ...devPaths].filter((value, index, values) => values.indexOf(value) === index)
}

async function readOldPackageIndex(): Promise<OldPackageIndexResult> {
  for (const indexPath of oldPackageIndexPaths()) {
    try {
      const content = await readFile(indexPath, 'utf-8')
      return {
        ok: true,
        data: JSON.parse(content)
      }
    } catch (error) {
      if (isMissingFileError(error)) {
        continue
      }

      return {
        ok: false,
        error: oldPackageIndexError(error)
      }
    }
  }

  return {
    ok: false,
    error: '旧包索引文件不存在'
  }
}

function registerIpcHandlers(): void {
  registerLocalDataHandlers()
  registerWandaHttpHandlers()
  registerBaiduOcrHandlers()
  registerElementCaptureHandlers()

  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    getWindowFromEvent(event)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const window = getWindowFromEvent(event)

    if (!window) {
      return
    }

    if (window.isMaximized()) {
      window.restore()
    } else {
      window.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    getWindowFromEvent(event)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion() || '1.0.0')

  ipcMain.handle(IPC_CHANNELS.APP_GET_LOCAL_IP, () => getLocalIp())

  ipcMain.handle(IPC_CHANNELS.OLD_PACKAGE_INDEX_READ, () => readOldPackageIndex())
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
