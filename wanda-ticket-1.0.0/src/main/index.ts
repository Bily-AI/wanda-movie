import { app, BrowserWindow, ipcMain, screen, session, shell, type IpcMainInvokeEvent } from 'electron'
import { readFile } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { IPC_CHANNELS, type OldPackageIndexResult, type WandaH5OpenWindowRequest } from '../shared/ipc'
import { getMachineFingerprint } from './machineId'
import { registerAlipayHandlers } from './alipay'
import { registerBaiduOcrHandlers } from './baiduOcr'
import { registerElementCaptureHandlers } from './elementCapture'
import { localDataDir, registerLocalDataHandlers } from './localData'
import { registerProxyHandlers } from './proxy'
import { registerWandaHttpHandlers } from './wandaHttp'
import { setupPortableUpdate } from './portableUpdate'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let autoOrderWindow: BrowserWindow | null = null
let wandaH5Window: BrowserWindow | null = null

const WANDA_H5_PARTITION = 'persist:wanda-h5'

function loadRenderer(window: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = hash ? `${process.env.ELECTRON_RENDERER_URL}#${hash}` : process.env.ELECTRON_RENDERER_URL
    void window.loadURL(url)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

function windowStatePath(): string {
  return join(localDataDir(), 'window-state.json')
}

// 「记住窗口位置」开关(存在 settings.json 里,默认开启)
function isRememberWindowOn(): boolean {
  try {
    const settings = JSON.parse(readFileSync(join(localDataDir(), 'settings.json'), 'utf8')) as { rememberWindow?: boolean }
    return settings.rememberWindow !== false
  } catch {
    return true
  }
}

function readWindowState(): WindowState | null {
  try {
    const state = JSON.parse(readFileSync(windowStatePath(), 'utf8')) as WindowState
    if (typeof state.width !== 'number' || typeof state.height !== 'number') return null
    return state
  } catch {
    return null
  }
}

// 校验位置至少部分落在某个显示器内,避免上次在副屏、这次副屏没了导致窗口飞到屏幕外
function isBoundsVisible(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const wa = display.workArea
    return x < wa.x + wa.width && x + width > wa.x && y < wa.y + wa.height && y + height > wa.y
  })
}

function saveWindowState(window: BrowserWindow): void {
  try {
    if (!isRememberWindowOn() || window.isDestroyed()) return
    const maximized = window.isMaximized()
    const bounds = window.getNormalBounds()
    writeFileSync(
      windowStatePath(),
      JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized })
    )
  } catch {
    /* 忽略写入失败 */
  }
}

function createWindow(): void {
  const saved = isRememberWindowOn() ? readWindowState() : null
  const usePosition =
    saved && typeof saved.x === 'number' && typeof saved.y === 'number'
      ? isBoundsVisible(saved.x, saved.y, saved.width, saved.height)
      : false

  const window = new BrowserWindow({
    width: saved?.width ?? 1600,
    height: saved?.height ?? 1000,
    x: usePosition ? saved!.x : undefined,
    y: usePosition ? saved!.y : undefined,
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

  if (saved?.maximized) {
    window.maximize()
  }

  window.on('ready-to-show', () => {
    window.show()
  })

  // 记住窗口位置:关闭前保存当前位置/大小/最大化状态
  window.on('close', () => {
    saveWindowState(window)
  })

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  mainWindow = window
  loadRenderer(window)
}

function createAutoOrderWindow(): BrowserWindow {
  if (autoOrderWindow && !autoOrderWindow.isDestroyed()) {
    autoOrderWindow.focus()
    return autoOrderWindow
  }

  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: '#f4f7fb',
    show: false,
    title: '自动接单服务',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (autoOrderWindow === window) {
      autoOrderWindow = null
    }
  })

  autoOrderWindow = window
  loadRenderer(window, '/auto-order')
  return window
}

function parseH5Url(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return url
  } catch {
    return null
  }
}

function getOrCreateWandaH5Window(): { window: BrowserWindow; reusedWindow: boolean } {
  if (wandaH5Window && !wandaH5Window.isDestroyed()) {
    wandaH5Window.focus()
    return { window: wandaH5Window, reusedWindow: true }
  }

  const window = new BrowserWindow({
    width: 430,
    height: 820,
    minWidth: 390,
    minHeight: 680,
    backgroundColor: '#ffffff',
    show: false,
    title: '万达 H5 工具',
    webPreferences: {
      partition: WANDA_H5_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (wandaH5Window === window) {
      wandaH5Window = null
    }
  })

  wandaH5Window = window
  return { window, reusedWindow: false }
}

function buildWandaH5CookieScript(token: string): string {
  return `document.cookie = ${JSON.stringify(`mi=${token}; path=/`)};`
}

async function createWandaH5Window(request: WandaH5OpenWindowRequest) {
  const targetUrl = parseH5Url(String(request.url || '').trim())
  const token = String(request.token || '').trim()

  if (!targetUrl) {
    return { ok: false, error: '请输入有效的 H5 网址' }
  }

  if (!token) {
    return { ok: false, error: '请先选择已登录的万达账号' }
  }

  const h5Session = session.fromPartition(WANDA_H5_PARTITION)
  await h5Session.cookies.set({
    url: targetUrl.origin,
    name: 'mi',
    value: token,
    path: '/',
    secure: targetUrl.protocol === 'https:'
  })

  const { window, reusedWindow } = getOrCreateWandaH5Window()
  window.setTitle(request.title || '万达 H5 工具')
  window.webContents.removeAllListeners('did-finish-load')
  window.webContents.on('did-finish-load', () => {
    void window.webContents.executeJavaScript(buildWandaH5CookieScript(token), true).catch(() => undefined)
  })

  await window.loadURL(targetUrl.toString())

  return { ok: true, data: { reusedWindow } }
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
  registerProxyHandlers()
  registerAlipayHandlers()

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

  ipcMain.handle(IPC_CHANNELS.WANDA_H5_OPEN_WINDOW, (_event, payload) => createWandaH5Window(payload))

  ipcMain.handle(IPC_CHANNELS.AUTO_ORDER_OPEN_WINDOW, () => {
    createAutoOrderWindow()
    return { ok: true, data: true }
  })

  ipcMain.handle(IPC_CHANNELS.AUTO_ORDER_PROCESS_TICKET, (_event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, error: '主窗口未打开' }
    }

    mainWindow.webContents.send(IPC_CHANNELS.AUTO_ORDER_PROCESS_EVENT, payload)
    return { ok: true, data: true }
  })

  ipcMain.handle(IPC_CHANNELS.MACHINE_FINGERPRINT, () => getMachineFingerprint())

  ipcMain.handle(IPC_CHANNELS.AUTO_ORDER_REPORT_RESULT, (_event, payload) => {
    if (!autoOrderWindow || autoOrderWindow.isDestroyed()) {
      return { ok: false, error: '自动接单窗口未打开' }
    }

    autoOrderWindow.webContents.send(IPC_CHANNELS.AUTO_ORDER_PROCESS_RESULT_EVENT, payload)
    return { ok: true, data: true }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
  setupPortableUpdate(() => mainWindow)

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
