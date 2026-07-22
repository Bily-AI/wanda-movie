import { app, dialog, type BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { dirname, join } from 'node:path'

// 更新源:与后端同一台服务器,统一从 @shared/serverConfig 取(换地址只改那一处)。
// 主进程无 @shared 别名,用相对路径引同一文件。
import { UPDATE_FEED_BASE } from '../shared/serverConfig'

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

// 便携版自定义热更:启动比对版本 → 先问用户 → 同意后下载 → 用 bat 替换旧 exe 再启动
export function setupPortableUpdate(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
  const exeFile = process.env.PORTABLE_EXECUTABLE_FILE
  if (!exeDir || !exeFile) return // 非 portable 打包,跳过

  void (async () => {
    try {
      const manifest = await fetchJson(`${UPDATE_FEED_BASE}/version.json`)
      if (!manifest?.version || !isNewerVersion(manifest.version, app.getVersion())) return

      const win = getWindow()
      // 先问,不静默下载(避免用户以为卡住)
      const ask = await dialog.showMessageBox(win ?? undefined!, {
        type: 'info',
        buttons: ['下载并更新', '暂不更新'],
        defaultId: 0,
        cancelId: 1,
        title: '发现新版本',
        message: `检测到新版本 v${manifest.version}`,
        detail: (manifest.notes ? manifest.notes + '\n\n' : '') + '点击「下载并更新」后会下载更新包(约几十 MB,请稍候),完成后自动重启。'
      })
      if (ask.response !== 0) return

      const rawUrl = manifest.url || ''
      const dlUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `${UPDATE_FEED_BASE}/${rawUrl.replace(/^\/+/, '')}`
      const tmpExe = join(exeDir, 'data', 'update', `update-${manifest.version}.exe`)
      await mkdir(dirname(tmpExe), { recursive: true })
      await download(dlUrl, tmpExe)

      const done = await dialog.showMessageBox(win ?? undefined!, {
        type: 'info',
        buttons: ['立即重启更新', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '更新包已就绪',
        message: `新版本 v${manifest.version} 已下载完成`,
        detail: '点击「立即重启更新」将关闭并自动升级,约几秒钟。'
      })
      if (done.response === 0) {
        await applyUpdateAndRestart(exeFile, tmpExe)
      }
    } catch (err) {
      console.error('[portableUpdate] 检查/更新失败:', err instanceof Error ? err.message : err)
    }
  })()
}

// 生成一个 bat:等本进程退出解锁 exe → 覆盖旧 exe → 重启 → 自删。
// 关键安全点:
//  1. 用 ping 做延迟(timeout 在无控制台的分离进程里会直接失败,导致无等待狂转)
//  2. 重试有硬上限(最多 ~120 次),永不无限循环 —— 失败就放弃退出,绝不卡死系统
function buildUpdateBat(currentExe: string, newExe: string, selfPath: string): string {
  return [
    '@echo off',
    'chcp 65001 >nul',
    'set /a n=0',
    ':wait',
    // 先等一下让旧进程完全退出、释放对 exe 的占用
    'ping -n 2 127.0.0.1 >nul',
    `move /y "${newExe}" "${currentExe}" >nul 2>&1`,
    'if not errorlevel 1 goto ok',
    'set /a n+=1',
    // 上限 ~120 次(约 2 分钟),到了就放弃,绝不无限循环
    'if %n% geq 120 goto giveup',
    'goto wait',
    ':ok',
    `start "" "${currentExe}"`,
    `del "${selfPath}"`,
    'exit',
    ':giveup',
    // 放弃:不重启、不循环。旧版仍可正常使用,下次启动再提示。
    `del "${selfPath}"`,
    'exit'
  ].join('\r\n')
}

async function applyUpdateAndRestart(currentExe: string, newExe: string): Promise<void> {
  const batPath = join(dirname(newExe), 'apply-update.bat')
  await writeFile(batPath, buildUpdateBat(currentExe, newExe, batPath), 'utf8')
  const child = spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  app.quit()
}
