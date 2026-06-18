# 万达快速出票第二阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复第一阶段页面输入不可用问题，并建立本地数据、万达请求核心和 IPC 边界。

**Architecture:** 主进程负责本地 JSON 读写和 HTTP 桥接，预加载层只暴露白名单 API，渲染层通过 Pinia 保存页面状态。页面不写入 mock 业务数据，空数据继续显示旧版空状态。

**Tech Stack:** Electron、Vue 3、Pinia、Element Plus、Axios、TypeScript、Node.js 检查脚本。

---

## File Structure

- Create: `wanda-ticket-1.0.0/tools/check-phase2-contract.mjs`
  - 第二阶段契约检查：确认新增 store、IPC、页面 `v-model`、万达核心文件和敏感内容规则。
- Modify: `wanda-ticket-1.0.0/package.json`
  - 新增 `check:phase2` 脚本。
- Create: `wanda-ticket-1.0.0/src/shared/localData.ts`
  - 本地 JSON 数据类型、默认值和文件名常量。
- Create: `wanda-ticket-1.0.0/src/main/localData.ts`
  - 本地 JSON 读写、默认值恢复和损坏文件备份。
- Modify: `wanda-ticket-1.0.0/src/shared/ipc.ts`
  - 新增本地数据和万达 HTTP IPC channel 与类型。
- Modify: `wanda-ticket-1.0.0/src/preload/index.ts`
  - 暴露本地数据读写和万达 HTTP API。
- Modify: `wanda-ticket-1.0.0/src/main/index.ts`
  - 注册本地数据和万达 HTTP IPC handler。
- Create: `wanda-ticket-1.0.0/src/shared/wandaCore.ts`
  - 旧版万达 host、API 路径、请求类型和参数校验纯函数。
- Create: `wanda-ticket-1.0.0/src/main/wandaHttp.ts`
  - Axios HTTP 桥接，先做 host/path/参数校验和统一错误返回。
- Create: `wanda-ticket-1.0.0/src/renderer/stores/accounts.ts`
  - 账号列表、分组、当前账号、账号登录表单和侧栏筛选状态。
- Create: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`
  - 购票页查询条件、选座占位状态、右侧支付区域状态。
- Create: `wanda-ticket-1.0.0/src/renderer/stores/settings.ts`
  - 设置页、活动页、请求参数、代理 API 和自动支付本地状态。
- Create: `wanda-ticket-1.0.0/src/renderer/stores/orders.ts`
  - 历史订单筛选状态。
- Create: `wanda-ticket-1.0.0/src/renderer/stores/logs.ts`
  - 日志筛选状态。
- Modify: `wanda-ticket-1.0.0/src/renderer/env.d.ts`
  - 同步 `window.wandaApp` 类型。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
  - 给账号区、登录区、购票查询区、右侧支付区绑定状态。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/SettingsView.vue`
  - 给设置输入框、开关、单选按钮绑定状态。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/ActivityView.vue`
  - 给城市、影院、礼包 ID、代理 API 绑定状态。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
  - 给搜索、状态、日期绑定状态。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/LogView.vue`
  - 给日志类型、关键词、日期绑定状态。

---

### Task 1: 第二阶段契约检查

**Files:**
- Create: `wanda-ticket-1.0.0/tools/check-phase2-contract.mjs`
- Modify: `wanda-ticket-1.0.0/package.json`

- [ ] **Step 1: Write the failing contract check**

Create `wanda-ticket-1.0.0/tools/check-phase2-contract.mjs` with this behavior:

```js
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
requireFile('src/renderer/stores/settings.ts', ['useSettingsStore', 'proxyApi'])
requireFile('src/renderer/stores/orders.ts', ['useOrdersStore'])
requireFile('src/renderer/stores/logs.ts', ['useLogsStore'])

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
  ['src/renderer/views/TicketView.vue', ['useAccountsStore', 'useTicketStore', 'v-model="accountsStore.loginForm.phone"', 'v-model="ticketStore.query.keyword"']],
  ['src/renderer/views/SettingsView.vue', ['useSettingsStore', 'v-model="settingsStore.autoPayment.phone"', 'v-model="settingsStore.proxyApi"']],
  ['src/renderer/views/ActivityView.vue', ['useSettingsStore', 'v-model="settingsStore.activity.city"', 'v-model="settingsStore.activity.activityCode"']],
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
```

- [ ] **Step 2: Add script**

Modify `wanda-ticket-1.0.0/package.json` scripts:

```json
"check:phase2": "node tools/check-phase2-contract.mjs"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run check:phase2`

Expected: FAIL with missing files such as `src/shared/localData.ts` and `src/renderer/stores/accounts.ts`.

- [ ] **Step 4: Do not commit yet**

Keep the failing contract check in the worktree. It becomes green after the implementation tasks below.

---

### Task 2: 本地数据和 IPC 边界

**Files:**
- Create: `wanda-ticket-1.0.0/src/shared/localData.ts`
- Create: `wanda-ticket-1.0.0/src/main/localData.ts`
- Modify: `wanda-ticket-1.0.0/src/shared/ipc.ts`
- Modify: `wanda-ticket-1.0.0/src/preload/index.ts`
- Modify: `wanda-ticket-1.0.0/src/main/index.ts`
- Modify: `wanda-ticket-1.0.0/src/renderer/env.d.ts`

- [ ] **Step 1: Implement shared local data types**

`src/shared/localData.ts` defines:

```ts
export const LOCAL_DATA_FILES = {
  ACCOUNTS: 'accounts',
  SETTINGS: 'settings',
  REQUEST_PARAMS: 'requestParams',
  PROXY: 'proxy',
  LOGS: 'logs',
  CITY: 'city'
} as const

export type LocalDataFileName = (typeof LOCAL_DATA_FILES)[keyof typeof LOCAL_DATA_FILES]
export type AccountStatus = 'normal' | 'expired' | 'error' | 'unknown'

export interface WandaAccount {
  id: string
  phone: string
  remark: string
  status: AccountStatus
  statusText: string
  groupId: string
  cookie: string
  userIdentifier: string
}

export interface AccountGroup {
  id: string
  name: string
}

export interface AccountsLocalData {
  groups: AccountGroup[]
  accounts: WandaAccount[]
  currentAccountId: string
}

export interface SettingsLocalData {
  rememberWindow: boolean
  autoClosePaymentWindow: boolean
  paymentCardDisplay: '列表' | '卡片'
  ticketCodeTemplate: '默认' | '万达风格'
  autoPayment: {
    enabled: boolean
    phone: string
    password: string
  }
}

export interface RequestParamsLocalData {
  deviceFingerprint: string
  deviceModel: string
  userId: string
  shumeiBoxId: string
}

export interface ProxyLocalData {
  proxyApi: string
  useProxyIp: boolean
}

export interface LogRecord {
  id: string
  time: string
  type: string
  account: string
  detail: string
}

export interface LogsLocalData {
  records: LogRecord[]
}

export interface CityLocalData {
  cities: unknown[]
  cinemas: unknown[]
  updatedAt: string
}

export interface LocalDataMap {
  accounts: AccountsLocalData
  settings: SettingsLocalData
  requestParams: RequestParamsLocalData
  proxy: ProxyLocalData
  logs: LogsLocalData
  city: CityLocalData
}

export const DEFAULT_LOCAL_DATA: LocalDataMap = {
  accounts: {
    groups: [{ id: 'default', name: '默认分组' }],
    accounts: [],
    currentAccountId: ''
  },
  settings: {
    rememberWindow: true,
    autoClosePaymentWindow: true,
    paymentCardDisplay: '列表',
    ticketCodeTemplate: '默认',
    autoPayment: {
      enabled: false,
      phone: '',
      password: ''
    }
  },
  requestParams: {
    deviceFingerprint: '',
    deviceModel: '',
    userId: '',
    shumeiBoxId: ''
  },
  proxy: {
    proxyApi: '',
    useProxyIp: false
  },
  logs: {
    records: []
  },
  city: {
    cities: [],
    cinemas: [],
    updatedAt: ''
  }
}

export function cloneDefaultLocalData<T extends LocalDataFileName>(name: T): LocalDataMap[T] {
  return structuredClone(DEFAULT_LOCAL_DATA[name])
}
```

- [ ] **Step 2: Implement main local data helper**

`src/main/localData.ts` reads/writes JSON in `app.getPath('userData')/local-data`, creates default files, and backs up invalid JSON as `<name>.json.bak.<timestamp>`.

- [ ] **Step 3: Extend IPC types**

Add channels and types in `src/shared/ipc.ts`:

```ts
LOCAL_DATA_READ: 'local-data:read',
LOCAL_DATA_WRITE: 'local-data:write',
WANDA_HTTP_GET: 'wanda-http:get',
WANDA_HTTP_POST: 'wanda-http:post'
```

Expose `LocalDataResult<T extends LocalDataFileName>` and `LocalDataWriteResult`.

- [ ] **Step 4: Extend preload API**

Add:

```ts
readLocalData: <T extends LocalDataFileName>(name: T) => Promise<LocalDataResult<T>>
writeLocalData: <T extends LocalDataFileName>(name: T, data: LocalDataMap[T]) => Promise<LocalDataWriteResult>
```

- [ ] **Step 5: Register handlers**

In `src/main/index.ts`, import `registerLocalDataHandlers` and call it inside `registerIpcHandlers()`.

- [ ] **Step 6: Run partial checks**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 3: 万达请求核心和 HTTP 桥接

**Files:**
- Create: `wanda-ticket-1.0.0/src/shared/wandaCore.ts`
- Create: `wanda-ticket-1.0.0/src/main/wandaHttp.ts`
- Modify: `wanda-ticket-1.0.0/src/shared/ipc.ts`
- Modify: `wanda-ticket-1.0.0/src/preload/index.ts`
- Modify: `wanda-ticket-1.0.0/src/main/index.ts`

- [ ] **Step 1: Implement shared Wanda constants and validation**

`src/shared/wandaCore.ts` contains host keys, API path constants, request payload types, and:

```ts
export function validateWandaRequest(request: WandaHttpRequest): string | null
```

Validation returns Chinese error strings for missing host, unknown host, missing path, unknown path, or non-object query/body.

- [ ] **Step 2: Implement main HTTP bridge**

`src/main/wandaHttp.ts` exports:

```ts
export function registerWandaHttpHandlers(): void
export async function sendWandaRequest(method: 'GET' | 'POST', request: WandaHttpRequest): Promise<WandaHttpResult>
```

It validates first, builds URL from known hosts, sends through Axios only when validation passes, and returns `{ ok: true, data }` or `{ ok: false, error }`.

- [ ] **Step 3: Extend preload**

Expose:

```ts
wandaHttpGet: (request: WandaHttpRequest) => Promise<WandaHttpResult>
wandaHttpPost: (request: WandaHttpRequest) => Promise<WandaHttpResult>
```

- [ ] **Step 4: Run partial checks**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 4: Pinia store 状态层

**Files:**
- Create: `wanda-ticket-1.0.0/src/renderer/stores/accounts.ts`
- Create: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`
- Create: `wanda-ticket-1.0.0/src/renderer/stores/settings.ts`
- Create: `wanda-ticket-1.0.0/src/renderer/stores/orders.ts`
- Create: `wanda-ticket-1.0.0/src/renderer/stores/logs.ts`

- [ ] **Step 1: Implement account store**

`accounts.ts` has `useAccountsStore`, `loginForm`, groups, accounts, selectedAccountIds, searchKeyword, currentAccountId, and computed-like getters for selected/current account.

- [ ] **Step 2: Implement ticket store**

`ticket.ts` has `query`, arrays for cities/cinemas/movies/dates/showtimes, `selectedSeats`, and booleans:

```ts
canSelectMovie
canSelectDate
canSelectShowtime
canRefreshSeats
```

- [ ] **Step 3: Implement settings store**

`settings.ts` has settings state, request params, proxy API, activity form, and helper text for request params preview.

- [ ] **Step 4: Implement orders and logs stores**

`orders.ts` and `logs.ts` hold filter objects used by views.

- [ ] **Step 5: Run partial checks**

Run: `npm run typecheck`

Expected: PASS.

---

### Task 5: 页面输入控件接入状态

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/SettingsView.vue`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/ActivityView.vue`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/LogView.vue`

- [ ] **Step 1: Bind TicketView**

Import stores:

```ts
const accountsStore = useAccountsStore()
const ticketStore = useTicketStore()
```

Bind all editable inputs with `v-model`, keep movie/date/showtime disabled by `ticketStore.canSelectMovie`, `ticketStore.canSelectDate`, `ticketStore.canSelectShowtime`, and keep business tables empty unless real data exists.

- [ ] **Step 2: Bind SettingsView**

Import `useSettingsStore()` and bind switches, radio groups, payment inputs, request params, and proxy API. Remove `disabled` only from settings that should be editable in phase 2.

- [ ] **Step 3: Bind ActivityView**

Import `useSettingsStore()` and bind city, cinema, activityCode, proxyApi, useProxyIp.

- [ ] **Step 4: Bind OrderHistoryView and LogView**

Import relevant stores and bind filters.

- [ ] **Step 5: Run contract check**

Run: `npm run check:phase2`

Expected: PASS.

---

### Task 6: 全量验证和提交

**Files:**
- Modify as needed only if checks fail.

- [ ] **Step 1: Run renderer contract**

Run: `npm run check:renderer`

Expected: PASS.

- [ ] **Step 2: Run phase 2 contract**

Run: `npm run check:phase2`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS. Rollup dependency comments or bundle-size warnings are acceptable if build exits 0.

- [ ] **Step 5: Sensitive scan**

Run from repository root:

```powershell
rg -n "fn1\.sxjrj\.cn|qp\.sxjrj\.cn|Api\?AppId|固定座位|假数据" wanda-ticket-1.0.0/src wanda-ticket-1.0.0/tools docs/superpowers
```

Expected: no real sensitive values. Mentions of “假数据” inside design/plan documents are acceptable only when describing the no-mock rule.

- [ ] **Step 6: Review diff**

Run:

```powershell
git diff --stat
git diff --check
```

Expected: no whitespace errors and no unrelated changes.

- [ ] **Step 7: Commit**

```powershell
git add -- wanda-ticket-1.0.0 docs/superpowers/plans/2026-06-18-wanda-ticket-phase2.md
git commit -m "完成第二阶段本地状态和请求边界"
```
