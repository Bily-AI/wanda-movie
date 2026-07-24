import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { dirname, join } from 'node:path'

// 更新源:与后端同一台服务器,统一从 @shared/serverConfig 取(换地址只改那一处)。
import { UPDATE_FEED_BASE } from '../shared/serverConfig'
import { IPC_CHANNELS } from '../shared/ipc'

interface UpdateManifest {
  version: string
  url: string
  notes?: string
}

function httpGetFn(url: string) {
  return url.startsWith('https:') ? httpsGet : httpGet
}

function fetchJson(url: string): Promise<UpdateManifest> {
  return new Promise((resolve, reject) => {
    const req = httpGetFn(url)(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error('HTTP ' + res.statusCode))
        res.resume()
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body) as UpdateManifest)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('invalid json'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => req.destroy(new Error('timeout')))
  })
}

// 下载并回报进度(百分比 + 已收/总字节)
function download(url: string, dest: string, onProgress?: (percent: number, received: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const req = httpGetFn(url)(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error('HTTP ' + res.statusCode))
        res.resume()
        return
      }
      const total = parseInt(String(res.headers['content-length'] || '0'), 10)
      let received = 0
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (onProgress && total > 0) onProgress(Math.min(100, Math.floor((received / total) * 100)), received, total)
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })
    req.on('error', (err) => {
      file.close()
      reject(err)
    })
    req.setTimeout(300_000, () => req.destroy(new Error('download timeout')))
  })
}

function resolveDlUrl(manifest: UpdateManifest): string {
  const rawUrl = manifest.url || ''
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `${UPDATE_FEED_BASE}/${rawUrl.replace(/^\/+/, '')}`
}

// 更新尝试标记:应用更新前记录「要更新到哪个版本」,下次启动若仍是旧版即判定自动更新失败
function stateFilePath(exeDir: string): string {
  return join(exeDir, 'data', 'update', 'update-state.json')
}
async function readUpdateState(exeDir: string): Promise<{ attemptedVersion?: string } | null> {
  try {
    return JSON.parse(await readFile(stateFilePath(exeDir), 'utf8'))
  } catch {
    return null
  }
}
async function writeUpdateState(exeDir: string, attemptedVersion: string): Promise<void> {
  const p = stateFilePath(exeDir)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify({ attemptedVersion }), 'utf8')
}
async function clearUpdateState(exeDir: string): Promise<void> {
  try {
    await rm(stateFilePath(exeDir))
  } catch {
    /* 不存在则忽略 */
  }
}

function isNewerVersion(remote: string, local: string): boolean {
  const toParts = (v: string) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const r = toParts(remote)
  const l = toParts(local)
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] ?? 0
    const b = l[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

let pending: { manifest: UpdateManifest; exeFile: string; exeDir: string } | null = null
let getWin: () => BrowserWindow | null = () => null

// 便携版自定义热更:检查 → 通知渲染进程 → 用户点更新 → 渲染触发下载(带页面进度)→ 隐藏进程替换重启
export function setupPortableUpdate(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow

  // 渲染进程点「立即更新」后触发:下载(推进度)→ 应用更新(退出+隐藏进程替换)
  ipcMain.handle(IPC_CHANNELS.UPDATE_START_DOWNLOAD, async () => {
    if (!pending) return { ok: false, error: 'NO_PENDING' }
    const win = getWin()
    try {
      const { manifest, exeFile, exeDir } = pending
      const rawUrl = manifest.url || ''
      const dlUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${UPDATE_FEED_BASE}/${rawUrl.replace(/^\/+/, '')}`
      const tmpExe = join(exeDir, 'data', 'update', `update-${manifest.version}.exe`)
      await mkdir(dirname(tmpExe), { recursive: true })
      await download(dlUrl, tmpExe, (percent, received, total) => {
        win?.webContents.send(IPC_CHANNELS.UPDATE_PROGRESS, {
          percent,
          receivedMB: Math.round((received / 1048576) * 10) / 10,
          totalMB: Math.round((total / 1048576) * 10) / 10
        })
      })
      win?.webContents.send(IPC_CHANNELS.UPDATE_PROGRESS, { percent: 100, done: true })
      // 给页面一点时间显示「即将重启」
      await new Promise((r) => setTimeout(r, 800))
      // 应用更新前记标记:下次启动若仍是旧版即判定失败,转手动兜底,避免死循环
      await writeUpdateState(exeDir, manifest.version)
      await applyUpdateAndRestart(exeFile, tmpExe)
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      win?.webContents.send(IPC_CHANNELS.UPDATE_ERROR, { message })
      return { ok: false, error: message }
    }
  })

  // 自动更新失败兜底:在浏览器打开下载页 / 打开 exe 所在文件夹,让用户手动替换
  ipcMain.handle(IPC_CHANNELS.UPDATE_OPEN_DOWNLOAD, async () => {
    if (!pending) return { ok: false }
    await shell.openExternal(resolveDlUrl(pending.manifest))
    return { ok: true }
  })
  ipcMain.handle(IPC_CHANNELS.UPDATE_OPEN_FOLDER, async () => {
    if (!pending) return { ok: false }
    await shell.openPath(pending.exeDir)
    return { ok: true }
  })

  if (!app.isPackaged) return
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  const exeFile = process.env.PORTABLE_EXECUTABLE_FILE
  if (!exeDir || !exeFile) return // 非 portable 打包,跳过

  void (async () => {
    try {
      const manifest = await fetchJson(`${UPDATE_FEED_BASE}/version.json`)
      const current = app.getVersion()
      const state = await readUpdateState(exeDir)

      // 曾尝试更新,且当前版本已不低于目标 → 更新成功,清掉标记
      if (state?.attemptedVersion && !isNewerVersion(state.attemptedVersion, current)) {
        await clearUpdateState(exeDir)
      }

      if (!manifest?.version || !isNewerVersion(manifest.version, current)) return
      pending = { manifest, exeFile, exeDir }

      // 曾尝试更新到这个版本却仍是旧版 → 自动更新在这台机器上没成功
      const failedBefore = state?.attemptedVersion === manifest.version

      const notify = () => getWin()?.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, {
        version: manifest.version,
        notes: manifest.notes || '',
        failedBefore,
        downloadUrl: resolveDlUrl(manifest)
      })
      const win = getWin()
      if (win && !win.webContents.isLoading()) notify()
      else win?.webContents.once('did-finish-load', notify)
    } catch (err) {
      console.error('[portableUpdate] 检查失败:', err instanceof Error ? err.message : err)
    }
  })()
}

// bat:等旧进程退出解锁 exe → 覆盖 → 重启 → 自删。
// 安全点:ping 做延迟(timeout 在无控制台的分离进程里会秒退);重试硬上限,永不无限循环。
function buildUpdateBat(currentExe: string, newExe: string, selfPath: string): string {
  return [
    '@echo off',
    'chcp 65001 >nul',
    'set /a n=0',
    ':wait',
    'ping -n 2 127.0.0.1 >nul',
    `move /y "${newExe}" "${currentExe}" >nul 2>&1`,
    'if not errorlevel 1 goto ok',
    'set /a n+=1',
    'if %n% geq 120 goto giveup',
    'goto wait',
    ':ok',
    `start "" "${currentExe}"`,
    `del "${selfPath}"`,
    'exit',
    ':giveup',
    `del "${selfPath}"`,
    'exit'
  ].join('\r\n')
}

// 用 VBScript 以「隐藏窗口」方式启动 bat —— 彻底不出现 cmd 黑框
function buildHiddenLauncherVbs(batPath: string): string {
  const escaped = batPath.replace(/"/g, '""')
  return [
    'Set s = CreateObject("WScript.Shell")',
    `s.Run "cmd /c ""${escaped}""", 0, False`
  ].join('\r\n')
}

async function applyUpdateAndRestart(currentExe: string, newExe: string): Promise<void> {
  const dir = dirname(newExe)
  const batPath = join(dir, 'apply-update.bat')
  const vbsPath = join(dir, 'apply-update.vbs')
  await writeFile(batPath, buildUpdateBat(currentExe, newExe, batPath), 'utf8')
  await writeFile(vbsPath, buildHiddenLauncherVbs(batPath), 'utf8')
  // wscript 以隐藏方式跑 bat:全程无黑框
  const child = spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  app.quit()
}
