# 万达购票第三阶段主链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 跑通万达业务账号短信登录、真实影院场次联动、实时座位、选座、电影票创建订单和取消订单。

**Architecture:** 继续沿用第二阶段 Electron + Vue 3 + Pinia + Element Plus 结构。渲染进程只组织页面和调用服务，所有万达网络请求仍走 `window.wandaApp.wandaHttpGet/Post`，主进程保留 host/path 白名单和 HTTP 转发。旧包接口、字段、座位坐标和订单路径作为事实源，敏感签名值不写入文档、测试样例或提交说明。

**Tech Stack:** Electron 30、electron-vite、Vue 3、Pinia、Element Plus、Axios、TypeScript、Node.js 检查脚本。

---

## 文件结构

- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\ipc.ts`：允许万达 POST body 为对象或字符串。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\wandaCore.ts`：补电影票下单路径 `/order/create_order.api`，放宽 body 校验。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\wandaTicketTypes.ts`：万达登录、城市影院、场次、座位和订单类型。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\wandaRequest.ts`：统一 URL、表单体、签名请求头和 IPC 调用入口。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\wandaAuthApi.ts`：验证码、登录、登录状态检查。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\cinemaApi.ts`：影院场次、影院详情。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\seatApi.ts`：实时座位、电影票下单、取消订单。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\logs.ts`：补日志追加和脱敏工具。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\accounts.ts`：接短信登录流程、保存账号、检查登录状态。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\ticket.ts`：接城市、影院、影片、日期、场次、座位、订单状态。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\components\SeatMap.vue`：旧包坐标规则座位图。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\components\SelectedSeatList.vue`：已选座位列表。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views\TicketView.vue`：绑定登录、联动、座位、订单按钮。
- 新建 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`：第三阶段静态契约检查。
- 修改 `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\package.json`：增加 `check:phase3` 脚本。

## Task 1: 请求边界和第三阶段契约检查

**Files:**
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\ipc.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\wandaCore.ts`
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\package.json`

- [ ] **Step 1: 写失败的阶段契约检查**

Create `tools/check-phase3-contract.mjs` with this full content:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function assertIncludes(file, content, label) {
  if (!content.includes(label)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

const packageJson = read('package.json')
const ipc = read('src/shared/ipc.ts')
const core = read('src/shared/wandaCore.ts')

assertIncludes('package.json', packageJson, '"check:phase3"')
assertIncludes('src/shared/ipc.ts', ipc, 'Record<string, unknown> | string')
assertIncludes('src/shared/wandaCore.ts', core, 'ORDER_CREATE_TICKET')
assertIncludes('src/shared/wandaCore.ts', core, '/order/create_order.api')
assertIncludes('src/shared/wandaCore.ts', core, "typeof request.body !== 'string'")

console.log('第三阶段请求边界契约检查通过')
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL，原因是 `package.json` 还没有 `check:phase3` 脚本。

- [ ] **Step 3: 增加 npm 脚本**

Modify `package.json` scripts block so it contains:

```json
"check:phase3": "node tools/check-phase3-contract.mjs"
```

Keep the existing `check:renderer` and `check:phase2` entries.

- [ ] **Step 4: 修改 IPC body 类型**

In `src/shared/ipc.ts`, update `WandaHttpRequest` so `body` accepts an object or old form body string:

```ts
export interface WandaHttpRequest {
  url: string
  headers?: Record<string, unknown>
  params?: Record<string, unknown>
  body?: Record<string, unknown> | string
}
```

- [ ] **Step 5: 修改万达路径白名单和 body 校验**

In `src/shared/wandaCore.ts`, add the ticket order path:

```ts
ORDER_CREATE_TICKET: '/order/create_order.api',
```

Then replace the body validation with:

```ts
if (request.body !== undefined && !isRecord(request.body) && typeof request.body !== 'string') {
  return '万达请求 body 必须是对象或字符串'
}
```

- [ ] **Step 6: 运行契约检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: PASS with `第三阶段请求边界契约检查通过`.

- [ ] **Step 7: 运行既有检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase2 && npm run typecheck`

Expected: both PASS.

- [ ] **Step 8: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/package.json wanda-ticket-1.0.0/src/shared/ipc.ts wanda-ticket-1.0.0/src/shared/wandaCore.ts wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "补充第三阶段请求边界"
```

## Task 2: 共享业务类型和格式化工具

**Files:**
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\shared\wandaTicketTypes.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Append these checks to `tools/check-phase3-contract.mjs`:

```js
const types = read('src/shared/wandaTicketTypes.ts')

for (const label of [
  'WandaLoginRequestId',
  'WandaLoginResult',
  'CityRecord',
  'CinemaRecord',
  'ShowtimeFilm',
  'RealTimeSeats',
  'RawSeat',
  'SeatNode',
  'TicketOrderResult'
]) {
  assertIncludes('src/shared/wandaTicketTypes.ts', types, label)
}
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL，因为 `src/shared/wandaTicketTypes.ts` 尚不存在。

- [ ] **Step 3: 新建共享类型文件**

Create `src/shared/wandaTicketTypes.ts` with this full content:

```ts
export interface WandaApiResponse<T = unknown> {
  code?: number
  msg?: string
  success?: boolean
  data?: T
}

export interface WandaLoginRequestId {
  requestID: string
}

export interface WandaLoginResult {
  userToken: string
  userIdentifier: string
  mobile?: string
  isPayMember?: boolean
}

export interface WandaLoginStatus {
  success: boolean
  userInfo?: {
    mobile?: string
    userIdentifier?: string
    isPayMember?: boolean
  }
}

export interface CityRecord {
  id: string
  name: string
  pinyin?: string
  firstLetter?: string
  raw: unknown
}

export interface CinemaRecord {
  id: string
  cityId: string
  name: string
  address?: string
  pinyin?: string
  firstLetter?: string
  raw: unknown
}

export interface ShowtimeFilm {
  filmId: string
  filmName: string
  raw: unknown
}

export interface ShowtimeDate {
  date: string
  label: string
  raw: unknown
}

export interface ShowtimeItem {
  dId: string
  label: string
  startTime?: string
  hallName?: string
  filmId: string
  date: string
  raw: unknown
}

export interface SeatArea {
  areaId: string | number
  areaPrice?: {
    areaCode?: string | number
    salesPrice?: number
  }
  seat?: RawSeat[]
}

export interface RealTimeSeats {
  area: SeatArea[]
}

export interface RawSeat {
  row: string | number
  column: string | number
  coordx: number
  coordy: number
  status: number
  seatId: string | number
  areaId?: string | number
}

export type SeatStatus = 'available' | 'occupied' | 'selected'
export type SeatZone = 'normal' | 'preferred' | 'vip' | 'couple' | 'wplus' | 'discount'

export interface SeatNode {
  id: string
  rowLabel: string
  columnLabel: string
  coordx: number
  coordy: number
  status: SeatStatus
  zone: SeatZone
  price: number
  seatId: string
  areaId: string
  raw: RawSeat
}

export interface TicketOrderResult {
  orderId: string
  bizCode: number
  bizMsg?: string
}
```

- [ ] **Step 4: 运行类型和契约检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/shared/wandaTicketTypes.ts wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "定义第三阶段万达业务类型"
```

## Task 3: 万达请求服务和旧接口封装

**Files:**
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\wandaRequest.ts`
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\wandaAuthApi.ts`
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\cinemaApi.ts`
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\services\seatApi.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Append these checks:

```js
const requestService = read('src/renderer/services/wandaRequest.ts')
const authApi = read('src/renderer/services/wandaAuthApi.ts')
const cinemaApi = read('src/renderer/services/cinemaApi.ts')
const seatApi = read('src/renderer/services/seatApi.ts')

for (const label of ['buildWandaUrl', 'toFormBody', 'wandaGet', 'wandaPost', 'buildWandaHeaders']) {
  assertIncludes('src/renderer/services/wandaRequest.ts', requestService, label)
}

for (const label of ['sendVerifyCode', 'loginWithCode', 'checkLoginStatus']) {
  assertIncludes('src/renderer/services/wandaAuthApi.ts', authApi, label)
}

for (const label of ['fetchCinemaShowtime', 'fetchCinemaDetail']) {
  assertIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, label)
}

for (const label of ['fetchRealTimeSeat', 'createTicketOrder', 'cancelTicketOrder']) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL because service files are absent.

- [ ] **Step 3: 创建万达请求基础服务**

Create `src/renderer/services/wandaRequest.ts` with these exported functions and keep the sensitive header material out of comments:

```ts
import { WANDA_HOSTS } from '@shared/wandaCore'
import type { WandaApiResponse } from '@shared/wandaTicketTypes'

export type WandaQuery = Record<string, string | number | boolean | undefined>
export type WandaBody = Record<string, string | number | boolean | undefined>

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

export function buildWandaUrl(host: string, path: string, query: WandaQuery = {}): string {
  const url = new URL(`https://${host}${path}`)

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

export function toFormBody(body: WandaBody): string {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

export function buildWandaHeaders(
  path: string,
  body: string,
  ck = '',
  userIdentifier = ''
): Record<string, string> {
  const timestamp = String(Date.now())

  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-RY-TIMESTAMP': timestamp,
    'X-RY-TOKEN': ck,
    'X-RY-USER': userIdentifier,
    'X-RY-PATH': path,
    'X-RY-BODY': body
  }
}

export async function wandaGet<T>(
  host: string,
  path: string,
  query: WandaQuery,
  ck = '',
  userIdentifier = ''
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path, query)
  const headers = buildWandaHeaders(path, '', ck, userIdentifier)
  const result = await getWandaApp()?.wandaHttpGet({ url, headers })

  if (!result?.ok) {
    throw new Error(result?.message || '万达 GET 请求失败')
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaPost<T>(
  host: string,
  path: string,
  body: WandaBody,
  ck = '',
  userIdentifier = ''
): Promise<WandaApiResponse<T>> {
  const formBody = toFormBody(body)
  const url = buildWandaUrl(host, path)
  const headers = buildWandaHeaders(path, formBody, ck, userIdentifier)
  const result = await getWandaApp()?.wandaHttpPost({ url, headers, body: formBody })

  if (!result?.ok) {
    throw new Error(result?.message || '万达 POST 请求失败')
  }

  return result.data as WandaApiResponse<T>
}

export { WANDA_HOSTS }
```

During implementation, compare `buildWandaHeaders` with the old packaged signer before live verification. If the old signer needs extra non-secret device fields, add them from local request params; if a sensitive value is required, read it from local runtime configuration and keep it out of git.

- [ ] **Step 4: 创建账号接口服务**

Create `src/renderer/services/wandaAuthApi.ts`:

```ts
import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { WandaLoginRequestId, WandaLoginResult, WandaLoginStatus } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, wandaPost } from './wandaRequest'

export async function sendVerifyCode(phone: string): Promise<WandaLoginRequestId> {
  const response = await wandaPost<WandaLoginRequestId>(WANDA_HOSTS.USER, WANDA_API_PATHS.USER_LOGIN_VERIFY_CODE, {
    phone
  })

  if (!response.data?.requestID) {
    throw new Error(response.msg || '验证码发送失败')
  }

  return response.data
}

export async function loginWithCode(phone: string, code: string, requestId: string): Promise<WandaLoginResult> {
  const response = await wandaPost<WandaLoginResult>(WANDA_HOSTS.USER, WANDA_API_PATHS.USER_LOGIN, {
    cinemaId: '',
    userPlat: '6',
    phone,
    vcode: code,
    requestId
  })

  if (response.code !== 0 || !response.data?.userToken) {
    throw new Error(response.msg || '万达账号登录失败')
  }

  return response.data
}

export async function checkLoginStatus(ck: string, userIdentifier: string): Promise<WandaLoginStatus> {
  const response = await wandaPost<WandaLoginStatus>(
    WANDA_HOSTS.USER,
    WANDA_API_PATHS.USER_IS_LOGIN,
    { json: true },
    ck,
    userIdentifier
  )

  if (!response.data?.success) {
    throw new Error(response.msg || '万达账号登录已失效')
  }

  return response.data
}
```

- [ ] **Step 5: 创建影院接口服务**

Create `src/renderer/services/cinemaApi.ts`:

```ts
import { WANDA_API_PATHS } from '@shared/wandaCore'
import { WANDA_HOSTS, wandaGet } from './wandaRequest'

export async function fetchCinemaShowtime(cinemaId: string, ck: string, userIdentifier: string): Promise<unknown> {
  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CINEMA,
    WANDA_API_PATHS.SHOWTIME_BY_CINEMA,
    { cinemaId, showType: 0, json: true },
    ck,
    userIdentifier
  )

  if (response.code !== 0 && response.success !== true) {
    throw new Error(response.msg || '影院场次加载失败')
  }

  return response.data
}

export async function fetchCinemaDetail(cinemaId: string, ck: string, userIdentifier: string): Promise<unknown> {
  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CINEMA,
    WANDA_API_PATHS.CINEMA_BY_CINEMA_ID,
    { cinemaid: cinemaId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 && response.success !== true) {
    throw new Error(response.msg || '影院详情加载失败')
  }

  return response.data
}
```

- [ ] **Step 6: 创建座位和订单接口服务**

Create `src/renderer/services/seatApi.ts`:

```ts
import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { RealTimeSeats, TicketOrderResult } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, wandaGet, wandaPost } from './wandaRequest'

export async function fetchRealTimeSeat(dId: string, ck: string, userIdentifier: string): Promise<RealTimeSeats> {
  const response = await wandaGet<{ realtimeSeats?: RealTimeSeats }>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_REAL_TIME_SEAT,
    { dId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 || !response.data?.realtimeSeats) {
    throw new Error(response.msg || '座位数据获取失败')
  }

  return response.data.realtimeSeats
}

export async function createTicketOrder(
  dId: string,
  seatIds: string[],
  totalPrice: number,
  mobile: string,
  ck: string,
  userIdentifier: string
): Promise<TicketOrderResult> {
  const response = await wandaPost<TicketOrderResult>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_CREATE_TICKET,
    {
      retailerCode: 'MX',
      mobile,
      seatId: seatIds.join('|'),
      totalPrice,
      dId
    },
    ck,
    userIdentifier
  )

  if (response.code !== 0 || response.data?.bizCode !== 0 || !response.data?.orderId) {
    throw new Error(response.data?.bizMsg || response.msg || '创建订单失败')
  }

  return response.data
}

export async function cancelTicketOrder(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<TicketOrderResult> {
  const response = await wandaPost<TicketOrderResult>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_CANCEL,
    { orderId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 || response.data?.bizCode !== 0) {
    throw new Error(response.data?.bizMsg || response.msg || '取消订单失败')
  }

  return response.data
}
```

- [ ] **Step 7: 运行检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run typecheck`

Expected: PASS. If TypeScript reports `ORDER_CREATE_TICKET` missing, finish Task 1 Step 5 first.

- [ ] **Step 8: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/renderer/services wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "封装第三阶段万达接口"
```

## Task 4: 万达账号短信登录

**Files:**
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\logs.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\accounts.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views\TicketView.vue`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Add checks for login actions and bindings:

```js
const accountsStore = read('src/renderer/stores/accounts.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const logsStore = read('src/renderer/stores/logs.ts')

for (const label of ['sendLoginCode', 'loginWandaAccount', 'checkCurrentLoginStatus', 'requestId']) {
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, label)
}

for (const label of ['@click="accountsStore.sendLoginCode"', '@click="accountsStore.loginWandaAccount"']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertIncludes('src/renderer/stores/logs.ts', logsStore, 'addLog')
assertIncludes('src/renderer/stores/logs.ts', logsStore, 'maskAccount')
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL because account actions are not implemented.

- [ ] **Step 3: 补日志 store**

In `src/renderer/stores/logs.ts`, add these helpers inside the store actions:

```ts
addLog(type: string, account: string, detail: string) {
  this.records.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    type,
    account: this.maskAccount(account),
    detail
  })
},
maskAccount(account: string) {
  if (account.length < 7) {
    return account
  }

  return `${account.slice(0, 3)}****${account.slice(-4)}`
}
```

- [ ] **Step 4: 补账号 store 状态**

In `src/renderer/stores/accounts.ts`, import the services and logs store:

```ts
import { sendVerifyCode, loginWithCode, checkLoginStatus } from '@renderer/services/wandaAuthApi'
import { useLogsStore } from './logs'
```

Extend `loginForm`:

```ts
loginForm: {
  phone: '',
  code: '',
  requestId: '',
  sending: false,
  loggingIn: false
}
```

- [ ] **Step 5: 补账号 store 动作**

Add these actions:

```ts
async sendLoginCode() {
  const phone = this.loginForm.phone.trim()

  if (!phone) {
    return
  }

  this.loginForm.sending = true

  try {
    const result = await sendVerifyCode(phone)
    this.loginForm.requestId = result.requestID
    useLogsStore().addLog('万达登录', phone, '验证码发送成功')
  } finally {
    this.loginForm.sending = false
  }
},
async loginWandaAccount() {
  const phone = this.loginForm.phone.trim()
  const code = this.loginForm.code.trim()

  if (!phone || !code || !this.loginForm.requestId) {
    return
  }

  this.loginForm.loggingIn = true

  try {
    const result = await loginWithCode(phone, code, this.loginForm.requestId)
    const now = new Date()
    const account = {
      id: phone,
      phone,
      remark: '登录成功',
      status: 'normal' as const,
      statusText: '正常',
      groupId: this.selectedGroupId,
      ck: result.userToken,
      userIdentifier: result.userIdentifier,
      loginDate: now.toISOString().slice(0, 10),
      loginTime: now.toLocaleTimeString('zh-CN', { hour12: false }),
      createdAt: now.toISOString(),
      isPayMember: Boolean(result.isPayMember)
    }
    const index = this.accounts.findIndex((item) => item.phone === phone)

    if (index >= 0) {
      this.accounts[index] = { ...this.accounts[index], ...account }
    } else {
      this.accounts.unshift(account)
    }

    this.currentAccountId = account.id
    this.selectedAccountIds = [account.id]
    await this.saveAccounts()
    useLogsStore().addLog('万达登录', phone, '登录成功，账号已保存')
  } finally {
    this.loginForm.loggingIn = false
  }
},
async checkCurrentLoginStatus() {
  const account = this.currentAccount

  if (!account?.ck || !account.userIdentifier) {
    return
  }

  try {
    const status = await checkLoginStatus(account.ck, account.userIdentifier)
    account.status = 'normal'
    account.statusText = '正常'
    account.isPayMember = Boolean(status.userInfo?.isPayMember)
    await this.saveAccounts()
  } catch {
    account.status = 'expired'
    account.statusText = '失效'
    await this.saveAccounts()
  }
}
```

- [ ] **Step 6: 绑定登录按钮**

In `TicketView.vue`, update buttons:

```vue
<el-button
  type="primary"
  :loading="accountsStore.loginForm.sending"
  :disabled="!accountsStore.loginForm.phone"
  @click="accountsStore.sendLoginCode"
>
  获取验证码
</el-button>
```

```vue
<el-button
  class="full-button"
  type="primary"
  :loading="accountsStore.loginForm.loggingIn"
  :disabled="!accountsStore.loginForm.phone || !accountsStore.loginForm.code"
  @click="accountsStore.loginWandaAccount"
>
  登录
</el-button>
```

- [ ] **Step 7: 运行检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: 手动验证登录输入**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run dev`

Expected: app opens; phone and code inputs are writable; buttons call actions. Live SMS success depends on old signer and real network.

- [ ] **Step 9: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/renderer/stores/logs.ts wanda-ticket-1.0.0/src/renderer/stores/accounts.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "接入万达账号短信登录"
```

## Task 5: 城市影院和场次联动

**Files:**
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\ticket.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views\TicketView.vue`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Add checks:

```js
const ticketStore = read('src/renderer/stores/ticket.ts')

for (const label of [
  'loadCityData',
  'loadCinemaShowtimes',
  'selectMovie',
  'selectDate',
  'setShowtime',
  'rawShowtimeData',
  'currentShowtime'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of [
  '@change="ticketStore.loadCinemaShowtimes"',
  '@change="ticketStore.selectMovie"',
  '@change="ticketStore.selectDate"',
  '@change="ticketStore.setShowtime"'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL because ticket linkage actions are absent.

- [ ] **Step 3: 扩展 ticket store 状态**

In `src/renderer/stores/ticket.ts`, add imports:

```ts
import { fetchCinemaShowtime } from '@renderer/services/cinemaApi'
import type { CinemaRecord, CityRecord, ShowtimeItem } from '@shared/wandaTicketTypes'
import { useAccountsStore } from './accounts'
import { useLogsStore } from './logs'
```

Add state fields:

```ts
cityRecords: [] as CityRecord[],
cinemaRecords: [] as CinemaRecord[],
rawShowtimeData: null as unknown,
currentShowtime: null as ShowtimeItem | null,
loadingShowtimes: false,
showtimeItems: [] as ShowtimeItem[],
showtimeError: ''
```

- [ ] **Step 4: 实现真实城市数据加载**

Add this action:

```ts
async loadCityData() {
  const result = await window.wandaApp?.readLocalData('city')

  if (!result?.ok) {
    this.showtimeError = '缺少真实城市/影院数据'
    return
  }

  this.cityRecords = result.data.cities.map((item: unknown) => {
    const record = item as Record<string, unknown>
    const id = String(record.id ?? record.cityId ?? record.code ?? record.name ?? '')
    const name = String(record.name ?? record.cityName ?? '')

    return { id, name, pinyin: String(record.pinyin ?? ''), firstLetter: String(record.firstLetter ?? ''), raw: item }
  }).filter((item) => item.id && item.name)

  this.cinemaRecords = result.data.cinemas.map((item: unknown) => {
    const record = item as Record<string, unknown>
    const id = String(record.id ?? record.cinemaId ?? record.cinemaid ?? '')
    const cityId = String(record.cityId ?? record.cityid ?? record.cityCode ?? '')
    const name = String(record.name ?? record.cinemaName ?? '')

    return { id, cityId, name, address: String(record.address ?? ''), raw: item }
  }).filter((item) => item.id && item.name)

  this.cities = this.cityRecords.map((city) => ({ label: city.name, value: city.id }))
}
```

- [ ] **Step 5: 实现影院筛选和场次加载**

Add actions:

```ts
selectCity() {
  this.resetQueryAfterCityChange()
  this.cinemas = this.cinemaRecords
    .filter((cinema) => !this.query.city || cinema.cityId === this.query.city)
    .map((cinema) => ({ label: cinema.name, value: cinema.id }))
},
async loadCinemaShowtimes() {
  this.resetQueryAfterCinemaChange()
  const account = useAccountsStore().currentAccount

  if (!account?.ck || !account.userIdentifier || !this.query.cinema) {
    this.showtimeError = '请先选择已登录万达账号和影院'
    return
  }

  this.loadingShowtimes = true

  try {
    this.rawShowtimeData = await fetchCinemaShowtime(this.query.cinema, account.ck, account.userIdentifier)
    this.movies = this.extractMovies(this.rawShowtimeData)
    useLogsStore().addLog('购票查询', account.phone, `影院场次加载成功：${this.movies.length} 部影片`)
  } finally {
    this.loadingShowtimes = false
  }
}
```

Also add local extraction helpers in actions with explicit conservative parsing:

```ts
extractMovies(raw: unknown): TicketOption[] {
  const root = raw as { showtimeFilmInf?: unknown[] }
  const list = Array.isArray(root.showtimeFilmInf) ? root.showtimeFilmInf : []

  return list.map((item) => {
    const record = item as Record<string, unknown>
    const value = String(record.filmId ?? record.id ?? record.movieId ?? record.filmName ?? '')
    const label = String(record.filmName ?? record.name ?? '')

    return { value, label }
  }).filter((item) => item.value && item.label)
},
selectMovie() {
  this.resetQueryAfterMovieChange()
  this.dates = this.extractDates(this.rawShowtimeData, this.query.movie)
},
extractDates(raw: unknown, filmId: string): TicketOption[] {
  const root = raw as { showtimeFilmInf?: unknown[] }
  const films = Array.isArray(root.showtimeFilmInf) ? root.showtimeFilmInf : []
  const film = films.find((item) => String((item as Record<string, unknown>).filmId ?? '') === filmId) as Record<string, unknown> | undefined
  const dates = Array.isArray(film?.showtimeFilmDateInf) ? film.showtimeFilmDateInf : []

  return dates.map((item) => {
    const record = item as Record<string, unknown>
    const value = String(record.date ?? record.showDate ?? record.showtimeDate ?? '')

    return { value, label: value }
  }).filter((item) => item.value)
},
selectDate() {
  this.resetQueryAfterDateChange()
  this.showtimes = this.extractShowtimes(this.rawShowtimeData, this.query.movie, this.query.date)
},
extractShowtimes(raw: unknown, filmId: string, date: string): TicketOption[] {
  const root = raw as { showtimeFilmInf?: unknown[] }
  const films = Array.isArray(root.showtimeFilmInf) ? root.showtimeFilmInf : []
  const film = films.find((item) => String((item as Record<string, unknown>).filmId ?? '') === filmId) as Record<string, unknown> | undefined
  const dates = Array.isArray(film?.showtimeFilmDateInf) ? film.showtimeFilmDateInf : []
  const matchedDate = dates.find((item) => String((item as Record<string, unknown>).date ?? '') === date) as Record<string, unknown> | undefined
  const showtimeInfo = matchedDate?.showtimesInf as Record<string, unknown> | undefined
  const showtimeList = Array.isArray(showtimeInfo?.showtimeList) ? showtimeInfo.showtimeList : []

  return showtimeList.map((item) => {
    const record = item as Record<string, unknown>
    const value = String(record.dId ?? record.showtimeId ?? record.id ?? '')
    const start = String(record.startTime ?? record.showTime ?? '')
    const hall = String(record.hallName ?? record.hall ?? '')

    return { value, label: [start, hall].filter(Boolean).join(' - ') || value }
  }).filter((item) => item.value)
},
setShowtime() {
  const selected = this.showtimes.find((item) => item.value === this.query.showtime)
  this.currentShowtime = selected
    ? { dId: selected.value, label: selected.label, filmId: this.query.movie, date: this.query.date, raw: selected }
    : null
  this.clearSeatSelection()
}
```

- [ ] **Step 6: 绑定购票页 change 事件**

In `TicketView.vue`, update city select:

```vue
@change="ticketStore.selectCity"
```

Update cinema select:

```vue
@change="ticketStore.loadCinemaShowtimes"
```

Update movie select:

```vue
@change="ticketStore.selectMovie"
```

Update date select:

```vue
@change="ticketStore.selectDate"
```

Update showtime select:

```vue
@change="ticketStore.setShowtime"
```

- [ ] **Step 7: 加载本地城市数据**

In `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\App.vue`, after existing store load calls, call:

```ts
await ticketStore.loadCityData()
```

Import `useTicketStore` if missing.

- [ ] **Step 8: 运行检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run check:renderer && npm run typecheck`

Expected: PASS.

- [ ] **Step 9: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue wanda-ticket-1.0.0/src/renderer/App.vue wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "接入购票城市影院场次联动"
```

## Task 6: 实时座位和本地选座

**Files:**
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\components\SeatMap.vue`
- Create: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\components\SelectedSeatList.vue`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\ticket.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views\TicketView.vue`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Add checks:

```js
const seatMap = read('src/renderer/components/SeatMap.vue')
const selectedSeatList = read('src/renderer/components/SelectedSeatList.vue')

for (const label of ['loadRealTimeSeats', 'normalizeSeats', 'toggleSeat', 'seatNodes', 'selectedSeatNodes']) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of ['SeatMap', 'SelectedSeatList', '@click="ticketStore.loadRealTimeSeats"']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertIncludes('src/renderer/components/SeatMap.vue', seatMap, 'coordx')
assertIncludes('src/renderer/components/SeatMap.vue', seatMap, 'coordy')
assertIncludes('src/renderer/components/SelectedSeatList.vue', selectedSeatList, 'selectedSeats')
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL because seat components and store methods are absent.

- [ ] **Step 3: 扩展 ticket store 座位状态和归一化**

In `src/renderer/stores/ticket.ts`, import:

```ts
import { fetchRealTimeSeat } from '@renderer/services/seatApi'
import type { RawSeat, RealTimeSeats, SeatArea, SeatNode, SeatZone } from '@shared/wandaTicketTypes'
```

Add state:

```ts
seatData: null as RealTimeSeats | null,
seatNodes: [] as SeatNode[],
selectedSeatNodes: [] as SeatNode[],
loadingSeats: false,
seatError: ''
```

Add actions:

```ts
getSeatZone(areaCode: string): SeatZone {
  const map: Record<string, SeatZone> = {
    '1': 'normal',
    '32': 'preferred',
    '33': 'discount',
    '36': 'wplus'
  }

  return map[areaCode] ?? 'normal'
},
normalizeSeats(data: RealTimeSeats): SeatNode[] {
  return data.area.flatMap((area: SeatArea) => {
    const seats = Array.isArray(area.seat) ? area.seat : []
    const areaCode = String(area.areaPrice?.areaCode ?? '1')
    const price = Number(area.areaPrice?.salesPrice ?? 0) / 100

    return seats.map((seat: RawSeat) => ({
      id: `${seat.row}-${seat.column}-${seat.seatId}`,
      rowLabel: String(seat.row),
      columnLabel: String(seat.column),
      coordx: Number(seat.coordx),
      coordy: Number(seat.coordy),
      status: seat.status === 1 ? 'available' : 'occupied',
      zone: this.getSeatZone(areaCode),
      price,
      seatId: String(seat.seatId),
      areaId: String(seat.areaId ?? area.areaId),
      raw: seat
    }))
  })
},
async loadRealTimeSeats() {
  const account = useAccountsStore().currentAccount

  if (!account?.ck || !account.userIdentifier || !this.query.showtime) {
    this.seatError = '请先选择已登录账号和场次'
    return
  }

  this.loadingSeats = true

  try {
    this.seatData = await fetchRealTimeSeat(this.query.showtime, account.ck, account.userIdentifier)
    this.seatNodes = this.normalizeSeats(this.seatData)
    this.selectedSeatNodes = []
    this.selectedSeats = []
    useLogsStore().addLog('座位', account.phone, `座位数据获取成功，共 ${this.seatNodes.length} 座`)
  } finally {
    this.loadingSeats = false
  }
},
toggleSeat(seat: SeatNode) {
  if (seat.status === 'occupied') {
    return
  }

  const exists = this.selectedSeatNodes.some((item) => item.id === seat.id)

  if (exists) {
    this.selectedSeatNodes = this.selectedSeatNodes.filter((item) => item.id !== seat.id)
  } else if (this.selectedSeatNodes.length < this.maxSeatCount) {
    this.selectedSeatNodes.push(seat)
  }

  this.selectedSeats = this.selectedSeatNodes.map((item) => ({
    id: item.id,
    rowName: item.rowLabel,
    columnName: item.columnLabel,
    areaName: item.zone
  }))
},
clearSeatSelection() {
  this.selectedSeatNodes = []
  this.selectedSeats = []
}
```

- [ ] **Step 4: 创建座位图组件**

Create `src/renderer/components/SeatMap.vue` with this content:

```vue
<script setup lang="ts">
import type { SeatNode } from '@shared/wandaTicketTypes'

const props = defineProps<{
  seats: SeatNode[]
  selectedSeats: SeatNode[]
}>()

const emit = defineEmits<{
  select: [seat: SeatNode]
}>()

const seatWidth = 26
const seatHeight = 22
const seatGap = 2
const rowLabelWidth = 28
const mapPadding = 4

function isSelected(seat: SeatNode): boolean {
  return props.selectedSeats.some((item) => item.id === seat.id)
}

function seatClass(seat: SeatNode): string[] {
  return ['seat-node', `seat-${seat.zone}`, seat.status, isSelected(seat) ? 'selected' : '']
}

function seatStyle(seat: SeatNode): Record<string, string> {
  return {
    width: `${seatWidth}px`,
    height: `${seatHeight}px`,
    left: `${mapPadding + rowLabelWidth + seat.coordx * (seatGap + seatWidth)}px`,
    top: `${mapPadding + seat.coordy * (seatGap + seatHeight)}px`
  }
}
</script>

<template>
  <div class="seat-map">
    <button
      v-for="seat in seats"
      :key="seat.id"
      type="button"
      :class="seatClass(seat)"
      :style="seatStyle(seat)"
      :disabled="seat.status === 'occupied'"
      @click="emit('select', seat)"
    >
      {{ seat.columnLabel }}
    </button>
  </div>
</template>

<style scoped>
.seat-map {
  min-width: 760px;
  min-height: 360px;
  position: relative;
}

.seat-node {
  position: absolute;
  border: 1px solid #e6a23c;
  border-radius: 2px;
  background: #fff;
  color: #667085;
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}

.seat-node.occupied {
  border-color: #1f2937;
  background: #1f2937;
  color: #1f2937;
  cursor: not-allowed;
}

.seat-node.selected {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.seat-preferred { border-color: #7ec8e3; }
.seat-vip { border-color: #3a5a9f; }
.seat-couple { border-color: #e85d75; }
.seat-wplus { border-color: #1a3a7a; }
.seat-discount { border-color: #4caf50; }
</style>
```

- [ ] **Step 5: 创建已选座位列表组件**

Create `src/renderer/components/SelectedSeatList.vue`:

```vue
<script setup lang="ts">
import type { SeatNode } from '@shared/wandaTicketTypes'

defineProps<{
  selectedSeats: SeatNode[]
}>()
</script>

<template>
  <div class="selected-seat-list">
    <div v-if="selectedSeats.length === 0" class="side-empty">暂未选择座位</div>
    <div v-for="seat in selectedSeats" v-else :key="seat.id" class="selected-seat-item">
      <span>{{ seat.rowLabel }}排{{ seat.columnLabel }}座</span>
      <strong>¥{{ seat.price.toFixed(2) }}</strong>
    </div>
  </div>
</template>

<style scoped>
.selected-seat-list {
  min-height: 48px;
  padding: 8px 12px 12px;
}

.side-empty {
  min-height: 48px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
}

.selected-seat-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  color: var(--app-text);
}
</style>
```

- [ ] **Step 6: 接入 TicketView**

Import components:

```ts
import SeatMap from '@renderer/components/SeatMap.vue'
import SelectedSeatList from '@renderer/components/SelectedSeatList.vue'
```

Replace seat-stage empty block with:

```vue
<div class="seat-stage">
  <el-empty v-if="ticketStore.seatNodes.length === 0" description="请选择城市、影院、影片、日期和场次后刷新座位" />
  <div v-else class="seat-scroll">
    <SeatMap
      :seats="ticketStore.seatNodes"
      :selected-seats="ticketStore.selectedSeatNodes"
      @select="ticketStore.toggleSeat"
    />
  </div>
</div>
```

Replace selected-seat side empty with:

```vue
<SelectedSeatList :selected-seats="ticketStore.selectedSeatNodes" />
```

Bind refresh button:

```vue
<el-button
  type="primary"
  :icon="Refresh"
  :loading="ticketStore.loadingSeats"
  :disabled="!ticketStore.canRefreshSeats"
  @click="ticketStore.loadRealTimeSeats"
>
  刷新座位
</el-button>
```

Add scroll style:

```css
.seat-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
}
```

- [ ] **Step 7: 运行检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run typecheck && npm run build`

Expected: PASS. Build may print existing Rollup annotation warnings only.

- [ ] **Step 8: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/renderer/components/SeatMap.vue wanda-ticket-1.0.0/src/renderer/components/SelectedSeatList.vue wanda-ticket-1.0.0/src/renderer/stores/ticket.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "接入实时座位和本地选座"
```

## Task 7: 创建电影票订单和取消订单

**Files:**
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\stores\ticket.ts`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\src\renderer\views\TicketView.vue`
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 扩展契约检查**

Add checks:

```js
for (const label of ['createCurrentOrder', 'cancelCurrentOrder', 'currentOrderId', 'orderCreating', 'orderCancelling']) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of ['ticketStore.createCurrentOrder', 'ticketStore.cancelCurrentOrder', 'currentOrderId']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}
```

- [ ] **Step 2: 运行契约检查并确认失败**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3`

Expected: FAIL because order actions are absent.

- [ ] **Step 3: 扩展 ticket store 订单状态**

Import:

```ts
import { createTicketOrder, cancelTicketOrder } from '@renderer/services/seatApi'
```

Add state:

```ts
currentOrderId: '',
currentOrderMessage: '',
orderCreating: false,
orderCancelling: false
```

Add getter:

```ts
selectedSeatTotalPrice(state) {
  return state.selectedSeatNodes.reduce((sum, seat) => sum + seat.price, 0)
}
```

- [ ] **Step 4: 实现创建和取消订单动作**

Add actions:

```ts
async createCurrentOrder() {
  const account = useAccountsStore().currentAccount

  if (!account?.ck || !account.userIdentifier || !account.phone || !this.query.showtime || this.selectedSeatNodes.length === 0) {
    this.currentOrderMessage = '请先选择账号、场次和座位'
    return
  }

  this.orderCreating = true

  try {
    const result = await createTicketOrder(
      this.query.showtime,
      this.selectedSeatNodes.map((seat) => seat.seatId),
      Math.round(this.selectedSeatTotalPrice * 100),
      account.phone,
      account.ck,
      account.userIdentifier
    )

    this.currentOrderId = result.orderId
    this.currentOrderMessage = result.bizMsg || '订单创建成功'
    useLogsStore().addLog('订单', account.phone, `订单创建成功：${result.orderId}`)
  } finally {
    this.orderCreating = false
  }
},
async cancelCurrentOrder() {
  const account = useAccountsStore().currentAccount

  if (!account?.ck || !account.userIdentifier || !this.currentOrderId) {
    this.currentOrderMessage = '暂无可取消订单'
    return
  }

  this.orderCancelling = true

  try {
    await cancelTicketOrder(this.currentOrderId, account.ck, account.userIdentifier)
    useLogsStore().addLog('订单', account.phone, `订单已取消：${this.currentOrderId}`)
    this.currentOrderMessage = '订单已取消'
    this.currentOrderId = ''
  } finally {
    this.orderCancelling = false
  }
}
```

- [ ] **Step 5: 更新订单信息面板**

In `TicketView.vue`, replace global order empty content with:

```vue
<div v-if="ticketStore.currentOrderId" class="order-summary">
  <p>订单号：{{ ticketStore.currentOrderId }}</p>
  <p>{{ ticketStore.currentOrderMessage }}</p>
  <el-button
    size="small"
    type="warning"
    :loading="ticketStore.orderCancelling"
    @click="ticketStore.cancelCurrentOrder"
  >
    取消订单
  </el-button>
</div>
<div v-else class="side-empty">暂无订单</div>
```

Bind submit button:

```vue
<el-popconfirm
  title="确认创建电影票订单？本阶段不会发起支付。"
  confirm-button-text="确认"
  cancel-button-text="取消"
  @confirm="ticketStore.createCurrentOrder"
>
  <template #reference>
    <el-button type="primary" :loading="ticketStore.orderCreating" :disabled="ticketStore.selectedSeatCount === 0">
      提交支付
    </el-button>
  </template>
</el-popconfirm>
```

Add style:

```css
.order-summary {
  padding: 12px 16px;
  color: var(--app-text);
  line-height: 1.8;
}
```

- [ ] **Step 6: 运行检查**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run check:phase3 && npm run typecheck && npm run build`

Expected: PASS. No real order is created by automated checks.

- [ ] **Step 7: 提交**

Run:

```bash
git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "接入电影票下单和取消订单"
```

## Task 8: 阶段总验证和手动验收

**Files:**
- Modify: `D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0\tools\check-phase3-contract.mjs`

- [ ] **Step 1: 补敏感信息静态检查**

Append this block to `tools/check-phase3-contract.mjs`:

```js
const forbidden = [
  /\b1\d{10}\b/,
  /CK:\s*[A-Za-z0-9]/,
  /ck=[A-Za-z0-9]/,
  /token=[A-Za-z0-9]/,
  /password\s*[:=]\s*['"][^'"]+['"]/,
  /secret\s*[:=]\s*['"][^'"]+['"]/
]

for (const [file, content] of [
  ['src/renderer/services/wandaRequest.ts', requestService],
  ['src/renderer/services/wandaAuthApi.ts', authApi],
  ['src/renderer/services/cinemaApi.ts', cinemaApi],
  ['src/renderer/services/seatApi.ts', seatApi],
  ['src/renderer/stores/accounts.ts', accountsStore],
  ['src/renderer/stores/ticket.ts', ticketStore],
  ['src/renderer/views/TicketView.vue', ticketView]
]) {
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${file} 疑似包含敏感信息：${pattern}`)
    }
  }
}
```

- [ ] **Step 2: 运行全部自动检查**

Run:

```bash
cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0
npm run check:renderer
npm run check:phase2
npm run check:phase3
npm run typecheck
npm run build
```

Expected: all PASS. Build may print existing Rollup annotation warnings only.

- [ ] **Step 3: 启动应用做本地手动验证**

Run: `cd D:\bily\win-ia32-unpacked\wanda-ticket-1.0.0; npm run dev`

Expected:

- app opens at `v1.0.0`.
- phone/code/search/city/cinema inputs still writable.
- city list comes from local real city data; if missing, page shows missing real data message.
- movie/date/showtime stay disabled until upstream selection exists.
- seat refresh is disabled until city/cinema/movie/date/showtime all selected.

- [ ] **Step 4: 使用真实账号验证主链路**

Manual actions:

1. 输入手机号并点击获取验证码。
2. 输入短信验证码并登录。
3. 选择真实城市和影院。
4. 选择影片、日期、场次。
5. 点击刷新座位。
6. 选择和取消座位。
7. 检查右侧已选座位和总价。
8. 如需验证下单，点击提交支付前确认当前账号和场次可控；弹窗确认后只创建订单，不进入支付。
9. 如创建订单成功，点击取消订单验证取消链路。

Expected:

- 登录成功后账号列表显示正常。
- 座位图来自真实接口，不是固定模板。
- 不同影院或场次的座位图会变化。
- 下单有二次确认。
- 自动检查不会触发真实下单。

- [ ] **Step 5: 提交最终验证增强**

Run:

```bash
git add wanda-ticket-1.0.0/tools/check-phase3-contract.mjs
git commit -m "完善第三阶段验收检查"
```

## 执行顺序

按 Task 1 到 Task 8 顺序执行。每个任务完成后先跑该任务的检查，再提交。真实下单只允许在 Task 8 手动验收中由用户确认后触发。

## 计划自查

- 设计范围覆盖：账号登录在 Task 4；城市影院和场次在 Task 5；实时座位和选座在 Task 6；创建订单和取消订单在 Task 7；自动检查和手动验收在 Task 8。
- 敏感信息边界：计划没有写入旧包签名敏感值、真实 CK、验证码、代理凭证或密钥。
- 数据边界：城市、影院、影片、座位、订单均来自本地真实数据或旧万达接口；缺失时显示错误，不填业务 mock。
- 类型一致性：共享类型在 Task 2 定义，服务在 Task 3 使用，store 和组件在后续任务消费。
