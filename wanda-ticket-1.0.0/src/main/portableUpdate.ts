import { app, dialog, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { dirname, join } from 'node:path'

// 更新源:和后端同一台服务器。生产环境改成你的域名(与 renderer/config/authServer.ts 保持一致)。
const UPDATE_FEED_BASE = 'http://127.0.0.1:3000/updates'

interface UpdateManifest {
  version: string
  url: string // 新版 exe 地址(可为相对 /updates/xxx.exe 或绝对 http 地址)
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

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const req = httpGetFn(url)(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error('HTTP ' + res.statusCode))
        res.resume()
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })
    req.on('error', (err) => {
      file.close()
      reject(err)
    })
    req.setTimeout(120_000, () => req.destroy(new Error('download timeout')))
  })
}

// 语义化版本比较:remote 是否比 local 新
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

// 便携版自定义热更:启动比对版本 → 下载新 exe → 提示 → 重启时用 bat 替换旧 exe 再启动
export function setupPortableUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  const exeFile = process.env.PORTABLE_EXECUTABLE_FILE
  if (!exeDir || !exeFile) return // 非 portable 打包,跳过

  void (async () => {
    try {
      const manifest = await fetchJson(`${UPDATE_FEED_BASE}/version.json`)
      if (!manifest?.version || !isNewerVersion(manifest.version, app.getVersion())) return

      const rawUrl = manifest.url || ''
      const dlUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${UPDATE_FEED_BASE}/${rawUrl.replace(/^\/+/, '')}`
      const tmpExe = join(exeDir, 'data', 'update', `update-${manifest.version}.exe`)
      await mkdir(dirname(tmpExe), { recursive: true })
      await download(dlUrl, tmpExe)

      const win = getWindow()
      const result = await dialog.showMessageBox(win ?? undefined!, {
        type: 'info',
        buttons: ['立即重启更新', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '发现新版本',
        message: `新版本 v${manifest.version} 已下载完成`,
        detail: manifest.notes || '是否立即重启并更新?'
      })
      if (result.response === 0) {
        await applyUpdateAndRestart(exeFile, tmpExe)
      }
    } catch (err) {
      console.error('[portableUpdate] 检查/更新失败:', err instanceof Error ? err.message : err)
    }
  })()
}

// 生成一个 bat:等本进程退出(exe 解锁)→ 用新 exe 覆盖旧 exe → 重新启动 → 自删
async function applyUpdateAndRestart(currentExe: string, newExe: string): Promise<void> {
  const batPath = join(dirname(newExe), 'apply-update.bat')
  const bat = [
    '@echo off',
    'chcp 65001 >nul',
    'timeout /t 2 /nobreak >nul',
    ':retry',
    `move /y "${newExe}" "${currentExe}" >nul 2>&1`,
    'if errorlevel 1 (',
    '  timeout /t 1 /nobreak >nul',
    '  goto retry',
    ')',
    `start "" "${currentExe}"`,
    'del "%~f0"'
  ].join('\r\n')
  await writeFile(batPath, bat, 'utf8')
  const child = spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  app.quit()
}
