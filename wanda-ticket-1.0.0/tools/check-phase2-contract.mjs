import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const srcRoot = path.join(projectRoot, 'src')
const failures = []

function read(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

function requireFile(relativePath, markers = []) {
  const filePath = path.join(projectRoot, relativePath)

  if (!existsSync(filePath)) {
    failures.push(`缺少文件：${relativePath}`)
    return ''
  }

  const text = read(relativePath)

  for (const marker of markers) {
    if (!text.includes(marker)) {
      failures.push(`${relativePath} 缺少标记：${marker}`)
    }
  }

  return text
}

function listSourceFiles(root) {
  const files = []

  for (const item of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, item.name)

    if (item.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
    } else if (/\.(ts|vue|mjs|js)$/.test(item.name)) {
      files.push(fullPath)
    }
  }

  return files
}

requireFile('src/shared/localData.ts', ['DEFAULT_LOCAL_DATA', 'LocalDataFileName'])
requireFile('src/main/localData.ts', ['readLocalDataFile', 'writeLocalDataFile'])
requireFile('src/shared/wandaCore.ts', ['WANDA_HOSTS', 'WANDA_API_PATHS', 'validateWandaRequest'])
requireFile('src/main/wandaHttp.ts', ['sendWandaRequest'])
requireFile('src/renderer/stores/accounts.ts', ['useAccountsStore', 'loginForm'])
requireFile('src/renderer/stores/ticket.ts', ['useTicketStore', 'query'])
const settingsStoreText = requireFile('src/renderer/stores/settings.ts', ['useSettingsStore', 'proxyApi'])
requireFile('src/renderer/stores/orders.ts', ['useOrdersStore'])
requireFile('src/renderer/stores/logs.ts', ['useLogsStore'])
requireFile('src/renderer/App.vue', ['useAccountsStore', 'useSettingsStore', 'loadAccounts', 'loadSettings', 'saveSettings'])

const ipcText = requireFile('src/shared/ipc.ts', [
  'LOCAL_DATA_READ',
  'LOCAL_DATA_WRITE',
  'WANDA_HTTP_GET',
  'WANDA_HTTP_POST'
])

const preloadText = requireFile('src/preload/index.ts', [
  'readLocalData',
  'writeLocalData',
  'wandaHttpGet',
  'wandaHttpPost'
])

const mainText = requireFile('src/main/index.ts', [
  'registerLocalDataHandlers',
  'registerWandaHttpHandlers'
])

const viewRequirements = [
  [
    'src/renderer/views/TicketView.vue',
    [
      'useAccountsStore',
      'useTicketStore',
      'v-model="accountsStore.loginForm.phone"',
      'v-model="ticketStore.query.keyword"'
    ]
  ],
  [
    'src/renderer/views/SettingsView.vue',
    ['useSettingsStore', 'v-model="settingsStore.autoPayment.phone"', 'v-model="settingsStore.proxyApi"']
  ],
  [
    'src/renderer/views/ActivityView.vue',
    ['useSettingsStore', 'v-model="settingsStore.activity.city"', 'v-model="settingsStore.activity.activityCode"']
  ],
  ['src/renderer/views/OrderHistoryView.vue', ['useOrdersStore', 'v-model="ordersStore.filters.keyword"']],
  ['src/renderer/views/LogView.vue', ['useLogsStore', 'v-model="logsStore.filters.keyword"']]
]

for (const [relativePath, markers] of viewRequirements) {
  requireFile(relativePath, markers)
}

if (!ipcText.includes('type LocalDataResult')) {
  failures.push('src/shared/ipc.ts 需要暴露 LocalDataResult 类型')
}

if (!preloadText.includes('Window') || !mainText.includes('ipcMain.handle')) {
  failures.push('IPC 边界未完整接入')
}

if (!settingsStoreText.includes('toPlainSettingsData')) {
  failures.push('src/renderer/stores/settings.ts 需要在保存设置前转成普通对象，避免 Electron IPC 无法克隆 Vue 响应式对象')
}

if (!settingsStoreText.includes('toPlainProxyData')) {
  failures.push('src/renderer/stores/settings.ts 需要在保存代理设置前转成普通对象')
}

if (!settingsStoreText.includes('toPlainRequestParamsData')) {
  failures.push('src/renderer/stores/settings.ts 需要在同步/保存业务请求头参数前转成普通对象')
}

if (settingsStoreText.includes("writeLocalData('requestParams', this.requestParams)")) {
  failures.push('src/renderer/stores/settings.ts 不能直接保存 this.requestParams，会触发 An object could not be cloned')
}

if (settingsStoreText.includes('setWandaRequestParams(this.requestParams)')) {
  failures.push('src/renderer/stores/settings.ts 不能直接同步 this.requestParams，应使用普通对象')
}

const forbiddenPatterns = [
  /fn1\.sxjrj\.cn/i,
  /qp\.sxjrj\.cn/i,
  /Api\?AppId/i,
  new RegExp(['1898', '2268', '306'].join('')),
  new RegExp(['P6A3390E239', 'A4636C808F6078'].join(''), 'i'),
  /固定座位/,
  /假数据/
]

for (const filePath of listSourceFiles(srcRoot)) {
  const relativePath = path.relative(projectRoot, filePath)
  const text = readFileSync(filePath, 'utf8')

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      failures.push(`${relativePath} 命中禁止提交内容：${pattern}`)
    }
  }
}

if (failures.length > 0) {
  console.error('第二阶段契约检查失败：')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('第二阶段契约检查通过')
