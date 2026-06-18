# 万达快速出票 1.0.0 阶段 1 实施计划

> **给代理执行者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 建立旧 Electron 打包产物索引，并创建可运行的 `Electron + Vue 3` 新工程骨架，首屏按旧截图进入主界面。

**架构：** 阶段 1 只做工程骨架和旧包事实源索引，不实现 Wanda 下单业务。新工程位于 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0`，旧包 `D:/bily/win-ia32-unpacked/win-ia32-unpacked` 作为只读事实源。主进程、preload、渲染进程先建立稳定边界，后续阶段按旧包索引迁移真实接口和页面逻辑。

**技术栈：** Electron、electron-vite、Vue 3、Vue Router、Pinia、Element Plus、CryptoJS、JSEncrypt、Axios、pinyin-pro、qrcode、docx。

---

## 范围说明

总设计覆盖多个独立子系统：购票、座位、订单、支付、OCR、卡券、储值卡、会员、活动、日志、设置。为了保持可验证，本计划只覆盖阶段 1：

- 建立 git 和忽略规则。
- 创建新工程骨架。
- 生成旧包索引文档和本地 JSON。JSON 仅作为本地结构化缓存，不提交到仓库。
- 创建 Electron 主进程、preload、渲染进程主界面壳。
- 复刻旧截图的主框架和页面入口。
- 验证应用能安装、索引、类型检查、构建和启动。

后续阶段必须继续以旧打包产物索引为准，逐模块迁移真实 Wanda/Baidu/Alipay 逻辑。

## 文件结构

### 本计划会创建

- `D:/bily/win-ia32-unpacked/.gitignore`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package.json`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/electron.vite.config.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.json`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.node.json`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.web.json`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/shared/ipc.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/main/index.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/preload/index.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/index.html`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/main.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/App.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/router/index.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/stores/app.ts`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/styles/base.css`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/StoredValueCardView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ExchangeCouponView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/MemberView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ActivityView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/LogView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/SettingsView.vue`
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/old-package-index.mjs`
- `D:/bily/win-ia32-unpacked/docs/old-package-index.md`
- `D:/bily/win-ia32-unpacked/docs/old-package-index.json`（本地生成，不提交）

### 本计划只读参考

- `D:/bily/win-ia32-unpacked/win-ia32-unpacked/resources/app/package.json`
- `D:/bily/win-ia32-unpacked/win-ia32-unpacked/resources/app/out/main/index.js`
- `D:/bily/win-ia32-unpacked/win-ia32-unpacked/resources/app/out/preload/index.js`
- `D:/bily/win-ia32-unpacked/win-ia32-unpacked/resources/app/out/renderer/assets`
- `D:/bily/win-ia32-unpacked/win-ia32-unpacked/config`

## 任务 1：初始化仓库边界和忽略规则

**文件：**

- 创建： `D:/bily/win-ia32-unpacked/.gitignore`

- [ ] **步骤 1：检查当前根目录是否已经是 git 仓库**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked status --short
```

预期：

```text
fatal: not a git repository (or any of the parent directories): .git
```

- [ ] **步骤 2：初始化 git 仓库**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked init
```

预期：

```text
Initialized empty Git repository
```

- [ ] **步骤 3：创建 `.gitignore`**

创建 `D:/bily/win-ia32-unpacked/.gitignore`：

```gitignore
# 旧 Electron 打包产物作为只读事实源，不纳入新项目提交
win-ia32-unpacked/

# 新工程依赖与产物
wanda-ticket-1.0.0/node_modules/
wanda-ticket-1.0.0/out/
wanda-ticket-1.0.0/dist/
wanda-ticket-1.0.0/dist-electron/
wanda-ticket-1.0.0/release/
wanda-ticket-1.0.0/.electron-vite/
wanda-ticket-1.0.0/.vite/

# 本地运行数据
wanda-ticket-1.0.0/data/
wanda-ticket-1.0.0/logs/

# 根目录兼容规则
node_modules/
dist/
dist-electron/
.vite/
*.log
.env
.env.*
!/.env.example
!wanda-ticket-1.0.0/.env.example

# 系统与编辑器文件
.DS_Store
Thumbs.db
.idea/
.vscode/

# 如果未来临时取消旧包整体忽略，仍不提交本地账号和代理配置
win-ia32-unpacked/config/accounts.json
win-ia32-unpacked/config/proxy.json
win-ia32-unpacked/resources/app/config/accounts.json
win-ia32-unpacked/resources/app/config/proxy.json

# 旧包结构化索引可本地生成，但不提交大型 JSON 缓存
docs/old-package-index.json
```

- [ ] **步骤 4：提交初始化边界**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add .gitignore docs\superpowers\specs\2026-06-18-wanda-ticket-rebuild-design.md docs\superpowers\plans\2026-06-18-wanda-ticket-phase1-plan.md
git -C D:\bily\win-ia32-unpacked commit -m "初始化重构文档和忽略规则"
```

预期：

```text
[main
```

## 任务 2：创建新工程包和构建配置

**文件：**

- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package.json`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/electron.vite.config.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.json`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.node.json`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.web.json`

- [ ] **步骤 1：创建新工程目录**

运行：

```powershell
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0 | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\main | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\preload | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools | Out-Null
```

预期：命令退出码为 `0`。

- [ ] **步骤 2：创建 `package.json`**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package.json`：

```json
{
  "name": "wanda-ticket-tool",
  "version": "1.0.0",
  "description": "万达快速出票 1.0.0 重构版",
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "vue-tsc --noEmit -p tsconfig.web.json && electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "vue-tsc --noEmit -p tsconfig.web.json",
    "index:old": "node tools/old-package-index.mjs"
  },
  "dependencies": {
    "@element-plus/icons-vue": "^2.3.0",
    "axios": "^1.6.0",
    "crypto-js": "^4.2.0",
    "docx": "^9.7.1",
    "element-plus": "^2.4.0",
    "jsencrypt": "^3.5.4",
    "pinia": "^2.1.0",
    "pinyin-pro": "^3.28.0",
    "qrcode": "^1.5.0",
    "vue": "^3.4.0",
    "vue-router": "^4.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "@types/node": "^20.11.0",
    "electron": "^30.0.0",
    "electron-builder": "^24.13.0",
    "electron-vite": "^2.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "vue-tsc": "^2.0.0"
  }
}
```

- [ ] **步骤 3：创建 `electron.vite.config.ts`**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/electron.vite.config.ts`：

```ts
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [vue()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    }
  }
})
```

- [ ] **步骤 4：创建 TypeScript 配置**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.json`：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "types": ["node", "electron"]
  },
  "include": [
    "electron.vite.config.ts",
    "src/main/**/*.ts",
    "src/preload/**/*.ts",
    "src/shared/**/*.ts"
  ]
}
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tsconfig.web.json`：

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": [
    "src/renderer/**/*.ts",
    "src/renderer/**/*.vue",
    "src/shared/**/*.ts"
  ]
}
```

- [ ] **步骤 5：提交工程配置**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\package.json wanda-ticket-1.0.0\electron.vite.config.ts wanda-ticket-1.0.0\tsconfig.json wanda-ticket-1.0.0\tsconfig.node.json wanda-ticket-1.0.0\tsconfig.web.json
git -C D:\bily\win-ia32-unpacked commit -m "创建新工程构建配置"
```

预期：

```text
[main
```

## 任务 3：建立旧打包产物索引工具

**文件：**

- 创建：`D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/old-package-index.mjs`
- 由命令生成：`D:/bily/win-ia32-unpacked/docs/old-package-index.md`
- 由命令本地生成，不提交：`D:/bily/win-ia32-unpacked/docs/old-package-index.json`

- [ ] **步骤 1：创建旧包索引脚本**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/old-package-index.mjs`：

```js
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const workspaceRoot = path.resolve(projectRoot, '..')
const oldRoot = path.join(workspaceRoot, 'win-ia32-unpacked')
const appRoot = path.join(oldRoot, 'resources', 'app')
const docsRoot = path.join(workspaceRoot, 'docs')
const assetsRoot = path.join(appRoot, 'out', 'renderer', 'assets')

const readText = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
const unique = (items) => [...new Set(items)].sort((a, b) => a.localeCompare(b))
const matchGroup = (text, regex, group = 1) => unique([...text.matchAll(regex)].map((item) => item[group]).filter(Boolean))

const packageJsonPath = path.join(appRoot, 'package.json')
const mainPath = path.join(appRoot, 'out', 'main', 'index.js')
const preloadPath = path.join(appRoot, 'out', 'preload', 'index.js')

const packageJson = JSON.parse(readText(packageJsonPath))
const mainText = readText(mainPath)
const preloadText = readText(preloadPath)

const assetFiles = fs.readdirSync(assetsRoot)
const jsAssets = assetFiles.filter((name) => name.endsWith('.js')).sort()
const cssAssets = assetFiles.filter((name) => name.endsWith('.css')).sort()

const rendererText = jsAssets.map((name) => readText(path.join(assetsRoot, name))).join('\n')
const allCode = [mainText, preloadText, rendererText].join('\n')

const index = {
  generatedAt: new Date().toISOString(),
  oldRoot,
  app: {
    name: packageJson.name,
    version: packageJson.version,
    main: packageJson.main,
    dependencies: packageJson.dependencies
  },
  files: {
    main: mainPath,
    preload: preloadPath,
    rendererAssets: assetsRoot,
    config: path.join(oldRoot, 'config')
  },
  ipc: {
    mainHandles: matchGroup(mainText, /ipcMain['"]?\]\?\.handle\(['"]([^'"]+)['"]/g).concat(matchGroup(mainText, /handle\(['"]([^'"]+)['"]/g)),
    preloadApiNames: matchGroup(preloadText, /([A-Za-z0-9_]+)\s*:\s*\(/g)
  },
  wanda: {
    hosts: matchGroup(allCode, /([A-Za-z0-9.-]+\.wandafilm\.com)/g),
    endpoints: matchGroup(allCode, /(['"`])(\/[A-Za-z0-9_./-]+\.api(?:\?[A-Za-z0-9_=&%?./-]*)?)\1/g, 2),
    saltFound: /Wanda1_[A-Za-z0-9]+/.test(allCode)
  },
  externalServices: {
    baiduOcr: matchGroup(mainText, /(https:\/\/aip\.baidubce\.com\/[^'"]+)/g),
    alipay: matchGroup(mainText, /(http:\/\/mcgw\.alipay\.com\/gateway\.do)/g),
    oldAuth: matchGroup(allCode, /(http:\/\/fn1\.sxjrj\.cn\/Api)/g),
    update: matchGroup(mainText, /(http:\/\/qp\.sxjrj\.cn\/update\/[^'"]+)/g)
  },
  renderer: {
    jsAssets,
    cssAssets
  },
  configFiles: fs.existsSync(path.join(oldRoot, 'config'))
    ? fs.readdirSync(path.join(oldRoot, 'config')).sort()
    : []
}

index.ipc.mainHandles = unique(index.ipc.mainHandles)
index.ipc.preloadApiNames = unique(index.ipc.preloadApiNames)
index.wanda.endpoints = unique(index.wanda.endpoints)

fs.mkdirSync(docsRoot, { recursive: true })
fs.writeFileSync(path.join(docsRoot, 'old-package-index.json'), JSON.stringify(index, null, 2), 'utf8')

const lines = [
  '# 旧 Electron 打包产物索引',
  '',
  `生成时间：${index.generatedAt}`,
  '',
  '## 旧应用信息',
  '',
  `- 名称：${index.app.name}`,
  `- 旧包版本：${index.app.version}`,
  `- 主入口：${index.app.main}`,
  '',
  '## 关键文件',
  '',
  `- 主进程：${index.files.main}`,
  `- Preload：${index.files.preload}`,
  `- 渲染资源：${index.files.rendererAssets}`,
  `- 本地配置：${index.files.config}`,
  '',
  '## Wanda 主机',
  '',
  ...index.wanda.hosts.map((host) => `- ${host}`),
  '',
  '## Wanda 接口路径',
  '',
  ...index.wanda.endpoints.map((endpoint) => `- ${endpoint}`),
  '',
  '## 主进程 IPC',
  '',
  ...index.ipc.mainHandles.map((name) => `- ${name}`),
  '',
  '## Preload 暴露 API',
  '',
  ...index.ipc.preloadApiNames.map((name) => `- ${name}`),
  '',
  '## 外部服务',
  '',
  `- 百度 OCR：${index.externalServices.baiduOcr.join('，') || '未提取到'}`,
  `- 支付宝：${index.externalServices.alipay.join('，') || '未提取到'}`,
  `- 旧软件鉴权：${index.externalServices.oldAuth.join('，') || '未提取到'}`,
  `- 旧更新地址：${index.externalServices.update.join('，') || '未提取到'}`,
  '',
  '## 渲染资源统计',
  '',
  `- JS 文件数：${index.renderer.jsAssets.length}`,
  `- CSS 文件数：${index.renderer.cssAssets.length}`,
  '',
  '## 本地配置文件',
  '',
  ...index.configFiles.map((name) => `- ${name}`),
  ''
]

fs.writeFileSync(path.join(docsRoot, 'old-package-index.md'), lines.join('\n'), 'utf8')

console.log(`旧包索引已生成：${path.join(docsRoot, 'old-package-index.md')}`)
console.log(`旧包索引 JSON 已生成：${path.join(docsRoot, 'old-package-index.json')}`)
```

- [ ] **步骤 2：运行旧包索引**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run index:old
```

预期：

```text
旧包索引已生成：
旧包索引 JSON 已生成：
```

- [ ] **步骤 3：确认索引包含核心 Wanda 主机和实时座位接口**

运行：

```powershell
Select-String -Path D:\bily\win-ia32-unpacked\docs\old-package-index.md -Pattern "front-gateway-c.wandafilm.com|/order/real_time_seat.api|/user/login.api|百度 OCR|支付宝"
```

预期：输出包含所有搜索模式。

- [ ] **步骤 4：提交旧包索引工具和产物**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\tools\old-package-index.mjs docs\old-package-index.md
git -C D:\bily\win-ia32-unpacked commit -m "建立旧打包产物索引"
```

预期：

```text
[main
```

## 任务 4：创建主进程和 preload 边界

**文件：**

- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/shared/ipc.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/main/index.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/preload/index.ts`

- [ ] **步骤 1：创建 IPC 常量**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/shared/ipc.ts`：

```ts
export const IPC_CHANNELS = {
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  appVersion: 'app:version',
  oldPackageIndex: 'old-package:index'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
```

- [ ] **步骤 2：创建主进程入口**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/main/index.ts`：

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { IPC_CHANNELS } from '../shared/ipc'

const APP_VERSION = '1.0.0'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1280,
    minHeight: 780,
    frame: false,
    show: false,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.appVersion, () => APP_VERSION)

  ipcMain.handle(IPC_CHANNELS.oldPackageIndex, () => {
    const indexPath = join(app.getAppPath(), '..', '..', 'docs', 'old-package-index.json')
    if (!existsSync(indexPath)) {
      return { exists: false, data: null }
    }

    const data = JSON.parse(readFileSync(indexPath, 'utf8'))
    return { exists: true, data }
  })

  ipcMain.on(IPC_CHANNELS.windowMinimize, () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.on(IPC_CHANNELS.windowMaximize, () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC_CHANNELS.windowClose, () => {
    BrowserWindow.getFocusedWindow()?.close()
  })
}

app.whenReady().then(() => {
  registerIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

- [ ] **步骤 3：创建 preload API**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/preload/index.ts`：

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'

const api = {
  minimize: () => ipcRenderer.send(IPC_CHANNELS.windowMinimize),
  maximize: () => ipcRenderer.send(IPC_CHANNELS.windowMaximize),
  close: () => ipcRenderer.send(IPC_CHANNELS.windowClose),
  getAppVersion: () => ipcRenderer.invoke(IPC_CHANNELS.appVersion) as Promise<string>,
  getOldPackageIndex: () => ipcRenderer.invoke(IPC_CHANNELS.oldPackageIndex)
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
```

- [ ] **步骤 4：创建渲染进程类型声明**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/env.d.ts`：

```ts
import type { DesktopApi } from '../preload'

declare global {
  interface Window {
    api: DesktopApi
  }
}

export {}
```

- [ ] **步骤 5：提交主进程和 preload 边界**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\src\shared\ipc.ts wanda-ticket-1.0.0\src\main\index.ts wanda-ticket-1.0.0\src\preload\index.ts wanda-ticket-1.0.0\src\renderer\env.d.ts
git -C D:\bily\win-ia32-unpacked commit -m "建立桌面主进程边界"
```

预期：

```text
[main
```

## 任务 5：创建渲染进程应用壳

**文件：**

- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/index.html`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/main.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/router/index.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/stores/app.ts`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/App.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/styles/base.css`

- [ ] **步骤 1：创建渲染进程目录**

运行：

```powershell
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\router | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\styles | Out-Null
New-Item -ItemType Directory -Force -Path D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views | Out-Null
```

预期：命令退出码为 `0`。

- [ ] **步骤 2：创建 HTML 入口**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>万达快速出票</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

- [ ] **步骤 3：创建 Vue 入口**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/main.ts`：

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './styles/base.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
```

- [ ] **步骤 4：创建路由**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/router/index.ts`：

```ts
import { createRouter, createWebHashHistory } from 'vue-router'
import TicketView from '../views/TicketView.vue'
import OrderHistoryView from '../views/OrderHistoryView.vue'
import StoredValueCardView from '../views/StoredValueCardView.vue'
import ExchangeCouponView from '../views/ExchangeCouponView.vue'
import MemberView from '../views/MemberView.vue'
import ActivityView from '../views/ActivityView.vue'
import LogView from '../views/LogView.vue'
import SettingsView from '../views/SettingsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/ticket' },
    { path: '/ticket', name: 'ticket', component: TicketView, meta: { title: '购票' } },
    { path: '/orders', name: 'orders', component: OrderHistoryView, meta: { title: '历史订单' } },
    { path: '/cards', name: 'cards', component: StoredValueCardView, meta: { title: '储值卡' } },
    { path: '/coupons', name: 'coupons', component: ExchangeCouponView, meta: { title: '兑换券' } },
    { path: '/member', name: 'member', component: MemberView, meta: { title: '会员' } },
    { path: '/activity', name: 'activity', component: ActivityView, meta: { title: '活动' } },
    { path: '/logs', name: 'logs', component: LogView, meta: { title: '日志' } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { title: '设置' } }
  ]
})

export default router
```

- [ ] **步骤 5：创建应用 store**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/stores/app.ts`：

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const version = ref('1.0.0')
  const oldPackageIndexed = ref(false)

  async function loadVersion(): Promise<void> {
    version.value = await window.api.getAppVersion()
  }

  async function loadOldPackageIndexStatus(): Promise<void> {
    const result = await window.api.getOldPackageIndex()
    oldPackageIndexed.value = Boolean(result?.exists)
  }

  return {
    version,
    oldPackageIndexed,
    loadVersion,
    loadOldPackageIndexStatus
  }
})
```

- [ ] **步骤 6：创建主应用组件**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/App.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Clock,
  CreditCard,
  Files,
  Gift,
  Medal,
  Moon,
  Setting,
  Tickets,
  User,
  Wallet
} from '@element-plus/icons-vue'
import { useAppStore } from './stores/app'

const appStore = useAppStore()
const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/ticket', label: '购票', icon: Tickets },
  { path: '/orders', label: '历史订单', icon: Clock },
  { path: '/cards', label: '储值卡', icon: CreditCard },
  { path: '/coupons', label: '兑换券', icon: Gift },
  { path: '/member', label: '会员', icon: Medal },
  { path: '/activity', label: '活动', icon: Files },
  { path: '/logs', label: '日志', icon: Files },
  { path: '/settings', label: '设置', icon: Setting }
]

const activePath = computed(() => route.path)

onMounted(async () => {
  await Promise.all([
    appStore.loadVersion(),
    appStore.loadOldPackageIndexStatus()
  ])
})
</script>

<template>
  <div class="app-shell">
    <header class="title-bar">
      <div class="app-title">
        <span class="app-logo">W</span>
        <strong>万达快速出票 v{{ appStore.version }}</strong>
      </div>
      <div class="window-actions">
        <button type="button" @click="window.api.minimize()">－</button>
        <button type="button" @click="window.api.maximize()">□</button>
        <button type="button" @click="window.api.close()">×</button>
      </div>
    </header>

    <nav class="top-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        type="button"
        :class="{ active: activePath === item.path }"
        @click="router.push(item.path)"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </button>
      <div class="top-spacer" />
      <span class="status-chip">
        <el-icon><User /></el-icon>
        本地模式
      </span>
      <span class="status-chip success">旧包索引：{{ appStore.oldPackageIndexed ? '已生成' : '未生成' }}</span>
      <el-icon class="moon-icon"><Moon /></el-icon>
      <button type="button" class="exit-btn">退出</button>
    </nav>

    <main class="workspace">
      <router-view />
    </main>
  </div>
</template>
```

- [ ] **步骤 7：创建基础样式**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/styles/base.css`：

```css
* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
  color: #303133;
  background: #f4f7fb;
}

button {
  font: inherit;
}

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f4f7fb;
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 14px 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8edf5;
  -webkit-app-region: drag;
}

.app-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.app-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: #fff;
  background: #409eff;
  font-size: 13px;
  font-weight: 700;
}

.window-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.window-actions button {
  width: 34px;
  height: 28px;
  border: 0;
  color: #909399;
  background: transparent;
  cursor: pointer;
}

.window-actions button:hover {
  color: #303133;
  background: #eef3fa;
}

.top-nav {
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 16px;
  gap: 8px;
  background: #fff;
  border-bottom: 1px solid #e8edf5;
}

.top-nav button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 46px;
  padding: 0 14px;
  border: 0;
  color: #909399;
  background: transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.top-nav button.active {
  color: #409eff;
  border-bottom-color: #409eff;
  font-weight: 700;
}

.top-spacer {
  flex: 1;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 5px;
  color: #606266;
  background: #f5f7fa;
  font-size: 13px;
}

.status-chip.success {
  color: #67c23a;
  background: #f0f9eb;
}

.moon-icon {
  color: #909399;
  margin: 0 8px;
}

.exit-btn {
  color: #f56c6c !important;
}

.workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **步骤 8：提交渲染进程应用壳**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\src\renderer\index.html wanda-ticket-1.0.0\src\renderer\main.ts wanda-ticket-1.0.0\src\renderer\router\index.ts wanda-ticket-1.0.0\src\renderer\stores\app.ts wanda-ticket-1.0.0\src\renderer\App.vue wanda-ticket-1.0.0\src\renderer\styles\base.css
git -C D:\bily\win-ia32-unpacked commit -m "创建主界面应用壳"
```

预期：

```text
[main
```

## 任务 6：创建按截图结构的页面空状态

**文件：**

- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/StoredValueCardView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ExchangeCouponView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/MemberView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ActivityView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/LogView.vue`
- 创建： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/SettingsView.vue`

- [ ] **步骤 1：创建购票页骨架**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`：

```vue
<template>
  <section class="ticket-page">
    <aside class="account-column">
      <div class="panel account-list">
        <div class="account-toolbar">
          <el-icon><User /></el-icon>
          <el-select placeholder="分组" size="small" />
          <el-button size="small" text>刷新</el-button>
          <el-input size="small" placeholder="搜索..." />
        </div>
        <el-table height="100%" empty-text="暂无数据">
          <el-table-column type="selection" width="42" />
          <el-table-column prop="phone" label="手机号" />
          <el-table-column prop="remark" label="备注" />
          <el-table-column prop="status" label="状态" width="78" />
        </el-table>
      </div>

      <div class="panel wanda-login">
        <div class="panel-title">万达账号登录</div>
        <el-input placeholder="请输入手机号">
          <template #prepend>+86</template>
        </el-input>
        <div class="login-row">
          <el-input placeholder="验证码" />
          <el-button type="primary">获取验证码</el-button>
        </div>
        <el-button type="primary" class="full-btn">登录</el-button>
        <div class="login-status">未登录</div>
      </div>
    </aside>

    <section class="ticket-main">
      <div class="panel query-panel">
        <div class="panel-title">购票查询</div>
        <div class="query-grid">
          <label>搜索：</label>
          <el-input placeholder="使用首字母或者汉字搜索" />
          <div class="poster-box" />
          <label>城市：</label>
          <el-select placeholder="选择或搜索城市" />
          <label>影院：</label>
          <el-select placeholder="选择或搜索影院" />
          <label>影片：</label>
          <el-select placeholder="请先选择影院" disabled />
          <label>日期：</label>
          <el-select placeholder="请先选择影片" disabled />
          <label>场次：</label>
          <div class="showtime-row">
            <el-select placeholder="请先选择日期" disabled />
            <el-button type="primary">刷新座位</el-button>
          </div>
        </div>
      </div>

      <div class="panel seat-panel">
        <div class="seat-header">
          <span>选座信息</span>
          <span>已选 0 座</span>
        </div>
        <div class="screen-line">银幕</div>
        <div class="seat-empty">请选择城市、影院、影片、日期和场次后刷新座位</div>
        <div class="seat-legend">
          <span><i class="normal" />普通区</span>
          <span><i class="prime" />优选区</span>
          <span><i class="vip" />VIP区</span>
          <span><i class="wplus" />W+会员区</span>
          <span><i class="couple" />情侣区</span>
          <span><i class="special" />特惠区</span>
        </div>
      </div>
    </section>

    <aside class="order-column">
      <div class="panel small-panel">全局订单信息<div class="empty-text">暂无订单</div></div>
      <div class="panel small-panel">支付活动<div class="empty-text">无活动</div></div>
      <div class="panel small-panel">支付卡<div class="empty-text">暂无可用支付卡</div></div>
      <div class="panel small-panel">兑换券<div class="empty-text">暂无可用兑换券</div></div>
      <div class="panel small-panel">已选座位<div class="empty-text">暂未选择座位</div></div>
    </aside>

    <footer class="bottom-actions">
      <el-button>刷新购票码</el-button>
      <el-button>图片识别</el-button>
      <el-button>文本识别</el-button>
      <span class="bottom-spacer" />
      <el-button type="warning">取消选择</el-button>
      <el-button type="success">确认选座</el-button>
      <el-button type="primary">提交支付</el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { User } from '@element-plus/icons-vue'
</script>

<style scoped>
.ticket-page {
  display: grid;
  grid-template-columns: 340px minmax(620px, 1fr) 420px;
  grid-template-rows: 1fr 56px;
  gap: 14px;
  height: 100%;
  padding: 16px;
}

.account-column,
.ticket-main,
.order-column {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.panel {
  border: 1px solid #e8edf5;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px rgb(31 45 61 / 5%);
}

.account-list {
  flex: 1;
  min-height: 0;
  padding: 12px;
}

.account-toolbar {
  display: grid;
  grid-template-columns: 24px 120px 50px 1fr;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.wanda-login {
  padding: 14px;
  gap: 10px;
  display: flex;
  flex-direction: column;
}

.panel-title,
.seat-header {
  font-weight: 700;
}

.login-row,
.showtime-row {
  display: flex;
  gap: 8px;
}

.full-btn {
  width: 100%;
}

.login-status,
.empty-text,
.seat-empty {
  color: #a8abb2;
  text-align: center;
}

.query-panel {
  padding: 14px;
}

.query-grid {
  display: grid;
  grid-template-columns: 60px minmax(260px, 440px) minmax(260px, 1fr);
  gap: 8px 10px;
  align-items: center;
  margin-top: 14px;
}

.poster-box {
  grid-row: span 6;
  height: 228px;
  border: 1px solid #e4e7ed;
  border-radius: 5px;
}

.seat-panel {
  flex: 1;
  min-height: 0;
  padding: 18px 20px;
}

.seat-header {
  display: flex;
  justify-content: space-between;
}

.screen-line {
  margin: 32px 0 20px;
  border-top: 3px solid #e6eaf2;
  color: #909399;
  text-align: center;
  line-height: 28px;
}

.seat-empty {
  height: calc(100% - 140px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.seat-legend {
  display: flex;
  gap: 14px;
  color: #606266;
  font-size: 13px;
}

.seat-legend i {
  display: inline-block;
  width: 13px;
  height: 13px;
  margin-right: 4px;
  border-radius: 3px;
  vertical-align: -2px;
}

.normal { border: 1px solid #e6a23c; }
.prime { border: 1px solid #67c23a; }
.vip { border: 1px solid #409eff; }
.wplus { border: 1px solid #606ebf; }
.couple { border: 1px solid #f56c6c; }
.special { border: 1px solid #49b45f; }

.small-panel {
  min-height: 92px;
  padding: 14px;
  font-weight: 700;
}

.small-panel .empty-text {
  margin-top: 18px;
  font-weight: 400;
}

.bottom-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.bottom-spacer {
  flex: 1;
}
</style>
```

- [ ] **步骤 2：创建其他页面通用空状态文件**

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`：

```vue
<template>
  <section class="simple-page">
    <div class="toolbar">
      <el-input placeholder="搜索手机号/订单号/影片..." />
      <el-select placeholder="订单状态" />
      <el-date-picker type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
      <el-button type="primary">搜索</el-button>
      <el-button>刷新</el-button>
      <span />
      <el-button type="success">导出</el-button>
    </div>
    <div class="stats-row">
      <div class="stat-card">今日订单<strong>0</strong></div>
      <div class="stat-card">待处理<strong>0</strong></div>
      <div class="stat-card">已完成<strong>0</strong></div>
      <div class="stat-card red">总金额<strong>¥0.00</strong></div>
    </div>
    <el-table height="100%" empty-text="暂无数据">
      <el-table-column prop="phone" label="手机号" />
      <el-table-column prop="orderNo" label="订单号" />
      <el-table-column prop="movie" label="影片" />
      <el-table-column prop="cinema" label="影院" />
      <el-table-column prop="showtime" label="场次" />
      <el-table-column prop="amount" label="金额" />
      <el-table-column prop="status" label="状态" />
      <el-table-column prop="createdAt" label="创建时间" />
      <el-table-column label="操作" />
    </el-table>
  </section>
</template>

<style scoped>
.simple-page {
  display: grid;
  grid-template-rows: 58px 112px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  padding: 16px 16px 16px 0;
}

.toolbar {
  display: grid;
  grid-template-columns: 300px 150px 320px 88px 88px 1fr 88px;
  gap: 10px;
  align-items: center;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  padding: 18px 22px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e8edf5;
  color: #909399;
}

.stat-card strong {
  display: block;
  margin-top: 12px;
  color: #409eff;
  font-size: 28px;
}

.stat-card.red strong {
  color: #f56c6c;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/StoredValueCardView.vue`：

```vue
<template>
  <section class="table-page">
    <header>
      <strong>储值卡</strong>
      <el-tag type="primary">0</el-tag>
      <span class="spacer" />
      <span class="total">总额: ¥0.00</span>
      <el-button>卡片</el-button>
      <el-button type="success">购买储值卡</el-button>
      <el-button type="warning">获取全部账号支付卡</el-button>
      <el-button>刷新</el-button>
    </header>
    <el-table height="100%" empty-text="暂无数据">
      <el-table-column prop="holder" label="持有人" />
      <el-table-column prop="name" label="卡名称" />
      <el-table-column prop="cardNo" label="卡号" />
      <el-table-column prop="balance" label="余额" />
      <el-table-column prop="status" label="状态" />
      <el-table-column label="操作" />
    </el-table>
  </section>
</template>

<style scoped>
.table-page {
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr);
  height: 100%;
  padding: 16px 16px 16px 0;
}

header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.spacer {
  flex: 1;
}

.total {
  color: #409eff;
  font-weight: 700;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ExchangeCouponView.vue`：

```vue
<template>
  <section class="table-page">
    <header>
      <strong>兑换券</strong>
      <el-tag type="primary">0</el-tag>
      <span class="spacer" />
      <el-button type="primary">绑定卡券</el-button>
      <el-button type="warning">批量赠送</el-button>
      <el-select placeholder="按名称筛选" />
      <el-select placeholder="按分类筛选" />
      <el-button>分类管理</el-button>
      <el-input placeholder="搜索关键词" />
      <el-button>统计</el-button>
      <el-button>刷新</el-button>
    </header>
    <el-table height="100%" empty-text="暂无数据">
      <el-table-column type="selection" width="48" />
      <el-table-column prop="voucherNo" label="券号" />
      <el-table-column prop="couponNo" label="couponNo" />
      <el-table-column prop="name" label="券名称" />
      <el-table-column prop="type" label="类型" />
      <el-table-column prop="status" label="状态" />
      <el-table-column prop="validity" label="有效期" />
      <el-table-column label="操作" />
    </el-table>
  </section>
</template>

<style scoped>
.table-page {
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr);
  height: 100%;
  padding: 16px 16px 16px 0;
}

header {
  display: grid;
  grid-template-columns: auto auto 1fr 90px 90px 150px 150px 90px 180px 80px 80px;
  gap: 10px;
  align-items: center;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/MemberView.vue`：

```vue
<template>
  <section class="member-page">
    <el-tabs model-value="rtime">
      <el-tab-pane label="Rtime会员" name="rtime" />
      <el-tab-pane label="W+会员" name="wplus" />
    </el-tabs>
    <div class="member-card">
      <h2>Rtime 会员信息</h2>
      <el-descriptions border>
        <el-descriptions-item label="用户名">未选择账号</el-descriptions-item>
        <el-descriptions-item label="当前等级">-</el-descriptions-item>
      </el-descriptions>
      <div class="sign-row">
        <span>每日签到</span>
        <el-button type="warning">一键领取</el-button>
      </div>
      <el-empty description="选择万达账号后加载会员数据" />
    </div>
  </section>
</template>

<style scoped>
.member-page {
  height: 100%;
  padding: 16px 16px 16px 0;
  overflow: auto;
}

.member-card {
  padding: 22px;
  border: 1px solid #e8edf5;
  border-radius: 8px;
  background: #fff;
}

.sign-row {
  display: flex;
  justify-content: space-between;
  margin: 24px 0;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/ActivityView.vue`：

```vue
<template>
  <section class="activity-page">
    <div class="toolbar">
      <span>选择城市/影院：</span>
      <el-select placeholder="城市" />
      <el-select placeholder="影院" />
      <el-button type="primary">刷新</el-button>
      <el-input placeholder="输入礼包ID/activityCode" />
      <el-button type="success">获取详情</el-button>
    </div>
    <div class="panel">
      <h3>可购买礼包</h3>
      <el-empty description="选择城市和影院后加载活动礼包" />
    </div>
    <div class="panel">
      <h3>我的礼包订单（共 0 单）</h3>
      <el-empty description="暂无订单" />
    </div>
  </section>
</template>

<style scoped>
.activity-page {
  display: grid;
  grid-template-rows: 58px 1fr 1fr;
  gap: 16px;
  height: 100%;
  padding: 16px 16px 16px 0;
}

.toolbar {
  display: grid;
  grid-template-columns: auto 180px 320px 88px 260px 100px;
  gap: 10px;
  align-items: center;
}

.panel {
  padding: 20px;
  border: 1px solid #e8edf5;
  border-radius: 8px;
  background: #fff;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/LogView.vue`：

```vue
<template>
  <section class="log-page">
    <div class="toolbar">
      <el-select placeholder="日志类型" />
      <el-input placeholder="搜索关键词..." />
      <el-date-picker type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
      <el-button>清空日志</el-button>
      <span>共 0 条记录</span>
    </div>
    <el-table height="100%" empty-text="暂无日志记录">
      <el-table-column prop="time" label="日期时间" />
      <el-table-column prop="type" label="类型" />
      <el-table-column prop="account" label="账号" />
      <el-table-column prop="detail" label="详情" />
    </el-table>
  </section>
</template>

<style scoped>
.log-page {
  display: grid;
  grid-template-rows: 58px minmax(0, 1fr);
  height: 100%;
  padding: 16px 16px 16px 0;
}

.toolbar {
  display: grid;
  grid-template-columns: 160px 260px 420px 110px auto;
  gap: 10px;
  align-items: center;
}
</style>
```

创建 `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/views/SettingsView.vue`：

```vue
<template>
  <section class="settings-page">
    <h1>设置</h1>
    <p>管理应用偏好与系统配置</p>

    <div class="setting-card">
      <h3>外观设置</h3>
      <div class="setting-row">
        <span>主题模式</span>
        <el-switch inactive-text="浅色" active-text="深色" />
      </div>
    </div>

    <div class="setting-card">
      <h3>购票设置</h3>
      <div class="setting-row">
        <span>下单成功后自动关闭弹窗</span>
        <el-switch />
      </div>
      <div class="setting-row">
        <span>取票码面板模板</span>
        <el-segmented :options="['默认', '万达风格']" />
      </div>
    </div>

    <div class="setting-card">
      <h3>业务请求头参数</h3>
      <div class="setting-row">
        <span>设备指纹/型号/用户ID</span>
        <el-button>刷新参数</el-button>
      </div>
    </div>

    <div class="setting-card">
      <h3>关于</h3>
      <div class="setting-row">
        <span>应用名称</span>
        <strong>万达快速出票</strong>
      </div>
      <div class="setting-row">
        <span>当前版本</span>
        <strong>1.0.0</strong>
      </div>
      <div class="setting-row">
        <span>运行环境</span>
        <strong>Electron + Vue 3</strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-page {
  height: 100%;
  padding: 28px 44px;
  overflow: auto;
}

.settings-page h1 {
  margin: 0 0 8px;
}

.settings-page p {
  margin: 0 0 24px;
  color: #909399;
}

.setting-card {
  margin-bottom: 18px;
  border: 1px solid #e8edf5;
  border-radius: 8px;
  background: #fff;
}

.setting-card h3 {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid #eef2f8;
  text-align: right;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 20px;
  border-bottom: 1px solid #eef2f8;
}

.setting-row:last-child {
  border-bottom: 0;
}
</style>
```

- [ ] **步骤 3：提交页面骨架**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\src\renderer\views
git -C D:\bily\win-ia32-unpacked commit -m "按旧截图创建页面骨架"
```

预期：

```text
[main
```

## 任务 7：安装依赖并完成阶段验证

**文件：**

- 由包管理器修改： `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package-lock.json`

- [ ] **步骤 1：安装依赖**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm install
```

预期：

```text
added
```

- [ ] **步骤 2：重新生成旧包索引**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run index:old
```

预期：

```text
旧包索引已生成：
旧包索引 JSON 已生成：
```

- [ ] **步骤 3：运行类型检查**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run typecheck
```

预期：

```text
vue-tsc
```

命令退出码为 `0`。

- [ ] **步骤 4：运行构建**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run build
```

预期：

```text
electron-vite
```

命令退出码为 `0`。

- [ ] **步骤 5：启动开发环境人工检查**

运行：

```powershell
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run dev
```

预期：

- Electron 窗口打开。
- 标题显示 `万达快速出票 v1.0.0`。
- 顶部导航显示：购票、历史订单、储值卡、兑换券、会员、活动、日志、设置。
- 默认进入购票页。
- 购票页左侧账号面板、中间查询和座位区、右侧订单信息区、底部操作按钮按旧截图结构排列。
- 没有软件登录/注册页。
- 没有业务 mock 数据。

- [ ] **步骤 6：提交依赖锁文件和阶段验证结果**

运行：

```powershell
git -C D:\bily\win-ia32-unpacked add wanda-ticket-1.0.0\package-lock.json docs\old-package-index.md
git -C D:\bily\win-ia32-unpacked commit -m "完成阶段一工程验证"
```

预期：

```text
[main
```

## 阶段 1 完成标准

- 根目录已初始化 git，并且旧打包产物目录被忽略。
- `wanda-ticket-1.0.0` 新工程存在并能安装依赖。
- `docs/old-package-index.md` 已生成并提交，`docs/old-package-index.json` 已本地生成但不提交。
- 旧包索引包含 Wanda 主机、实时座位接口、万达登录接口、百度 OCR、支付宝入口。
- Electron 应用能启动到主界面。
- 标题版本为 `1.0.0`。
- 主界面结构贴近旧截图。
- 软件鉴权未出现。
- 当前阶段没有伪造业务数据。

## 后续计划拆分

阶段 1 完成后继续创建新的实施计划：

- 阶段 2：本地数据、账号 store、旧配置迁移、万达签名和请求头。
- 阶段 3：万达短信登录、城市/影院/影片/日期/场次联动、实时座位图。
- 阶段 4：创建订单、取消订单、查询订单、支付活动、支付卡、兑换券支付。
- 阶段 5：百度 OCR、截图、剪贴板、支付宝转换和自动支付。
- 阶段 6：历史订单、储值卡、兑换券、会员、活动、日志、设置完整迁移。
- 阶段 7：旧包逐项对照、真实接口验证、打包发布。

## 自检记录

- 设计文档要求覆盖：阶段 1 覆盖旧包索引、工程骨架、主界面壳、版本、无软件鉴权、旧包复用原则。
- 未覆盖的业务功能没有丢弃，已列入后续计划拆分。
- 计划中没有占位词或未完成标记。
- 代码路径均以 `D:/bily/win-ia32-unpacked` 为根。
- commit message 均为中文。
