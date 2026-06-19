# 万达快速出票第四阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入真实旧万达支付前置数据和历史订单查询，让购票页订单创建后能展示支付活动、支付卡、兑换券、订单状态，并让历史订单页加载真实订单。

**Architecture:** 继续沿用当前 Electron + Vue 3 + Pinia + Element Plus 结构。接口仍集中在 `seatApi.ts`，请求底座继续使用 `wandaRequest.ts` 的旧万达签名、host、cookie 机制；页面只消费 store 的标准化状态，不直接拼接口参数。

**Tech Stack:** Electron Vite、Vue 3、Pinia、Element Plus、TypeScript、CryptoJS、旧万达 HTTP 接口。

---

## 文件结构

- Modify: `wanda-ticket-1.0.0/package.json`
  - 增加 `check:phase4` 脚本。
- Create: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`
  - 第四阶段契约检查：函数、接口路径、状态字段、页面绑定、禁止真实支付调用。
- Modify: `wanda-ticket-1.0.0/src/shared/wandaTicketTypes.ts`
  - 增加支付活动、支付卡、兑换券、订单状态、历史订单、当前订单上下文类型。
- Modify: `wanda-ticket-1.0.0/src/shared/wandaCore.ts`
  - 增加旧历史订单详情路径 `/order/query_by_userid.api` 的白名单常量。
- Modify: `wanda-ticket-1.0.0/src/renderer/services/seatApi.ts`
  - 增加旧万达支付前置和订单查询接口：支付活动、支付卡、兑换券、订单状态、历史订单、支付信息查询。
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`
  - 增加当前订单上下文、支付前置数据、刷新/清理/状态查询动作。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
  - 接入购票页右侧真实数据；“确认选座”创建订单，“提交支付”只做支付前检查和订单状态查询。
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/orders.ts`
  - 增加真实订单列表、分页、筛选、汇总、支付信息查询和导出数据生成。
- Modify: `wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
  - 接入真实订单列表、loading、分页、刷新、搜索、导出和支付信息查看。

---

### Task 1: 建立第四阶段契约检查

**Files:**
- Modify: `wanda-ticket-1.0.0/package.json`
- Create: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`

- [ ] **Step 1: 写入会失败的第四阶段检查**

在 `package.json` 的 `scripts` 中加入：

```json
"check:phase4": "node tools/check-phase4-contract.mjs"
```

创建 `tools/check-phase4-contract.mjs`：

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

function assertNotIncludes(file, content, label) {
  if (content.includes(label)) {
    throw new Error(`${file} 不应包含 ${label}`)
  }
}

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

const packageJson = read('package.json')
const types = read('src/shared/wandaTicketTypes.ts')
const seatApi = read('src/renderer/services/seatApi.ts')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const ordersStore = read('src/renderer/stores/orders.ts')
const ordersView = read('src/renderer/views/OrderHistoryView.vue')

assertIncludes('package.json', packageJson, '"check:phase4"')

for (const label of [
  'TicketOrderContext',
  'TicketOrderSeatRef',
  'PaymentActivityItem',
  'PaymentActivityResult',
  'PaymentCard',
  'CouponItem',
  'OrderStatusResult',
  'OrderRecord',
  'OrderListResult',
  'OrderPayInfoResult'
]) {
  assertIncludes('src/shared/wandaTicketTypes.ts', types, label)
}

for (const label of [
  'buildSeatPartition',
  'buildQueryPath',
  'decryptActivityPayload',
  'fetchPaymentActivity',
  'fetchPayCards',
  'fetchCoupons',
  'queryOrderStatus',
  'queryOrderList',
  'queryOrderByUserId',
  'queryPayInfoUpgrade',
  '/mkt/activity/secret/list.api',
  '/mkt/activity/secret/ncoupons.api',
  'WANDA_API_PATHS.CARD_PAY_LIST',
  'WANDA_API_PATHS.ORDER_STATUS',
  'WANDA_API_PATHS.ORDER_QUERY_LIST',
  'WANDA_API_PATHS.ORDER_QUERY_BY_USER_ID',
  'WANDA_API_PATHS.ORDER_QUERY_PAY_INFO'
]) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}

assertMatches(
  'src/renderer/services/seatApi.ts',
  seatApi,
  /queryOrderList\([\s\S]*?busiType:\s*3[\s\S]*?pageIndex[\s\S]*?pageSize[\s\S]*?timeLeagth:\s*0/,
  '历史订单必须沿用旧包 busiType=3、timeLeagth=0'
)

for (const label of [
  'currentOrder',
  'paymentActivities',
  'paymentCards',
  'coupons',
  'orderStatus',
  'loadingPaymentData',
  'checkingPayment',
  'refreshPaymentPrerequisites',
  'clearCurrentOrderPaymentContext',
  'checkCurrentOrderBeforePayment'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /createCurrentOrder\(\)[\s\S]*?this\.currentOrder =[\s\S]*?await this\.refreshPaymentPrerequisites\(\)/,
  '订单创建成功后必须刷新支付前置数据'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /cancelCurrentOrder\(\)[\s\S]*?this\.clearCurrentOrderPaymentContext\(\)/,
  '取消订单后必须清空支付前置上下文'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /handleAccountChanged\(\)[\s\S]*?this\.clearCurrentOrderPaymentContext\(\)/,
  '账号切换后必须清空当前订单和支付前置数据'
)

for (const label of [
  'ticketStore.currentOrder',
  'ticketStore.paymentActivities',
  'ticketStore.paymentCards',
  'ticketStore.coupons',
  'ticketStore.checkCurrentOrderBeforePayment',
  '@confirm="ticketStore.createCurrentOrder"'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertMatches(
  'src/renderer/views/TicketView.vue',
  ticketView,
  /确认选座[\s\S]*?<el-popconfirm[\s\S]*?@confirm="ticketStore\.createCurrentOrder"/,
  '确认选座按钮负责创建订单'
)
assertMatches(
  'src/renderer/views/TicketView.vue',
  ticketView,
  /提交支付[\s\S]*?@click="ticketStore\.checkCurrentOrderBeforePayment"/,
  '提交支付本阶段只做支付前检查'
)

for (const label of [
  'orders',
  'filteredOrders',
  'loadOrders',
  'queryOrderPayInfo',
  'exportCurrentOrders',
  'queryOrderList',
  'queryOrderByUserId'
]) {
  assertIncludes('src/renderer/stores/orders.ts', ordersStore, label)
}

for (const label of [
  'ordersStore.filteredOrders',
  'ordersStore.loadOrders',
  'ordersStore.exportCurrentOrders',
  'ordersStore.queryOrderPayInfo',
  '<el-pagination'
]) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', ordersView, label)
}

assertNotIncludes('src/renderer/views/OrderHistoryView.vue', ordersView, ':data="[]"')

for (const [file, content] of [
  ['src/renderer/stores/ticket.ts', ticketStore],
  ['src/renderer/views/TicketView.vue', ticketView]
]) {
  assertNotIncludes(file, content, 'ORDER_PREPAY')
  assertNotIncludes(file, content, 'ORDER_MERGE_PAYMENT')
  assertNotIncludes(file, content, 'prepay')
  assertNotIncludes(file, content, 'mergePayment')
}

console.log('第四阶段支付前置与订单查询契约检查通过')
```

- [ ] **Step 2: 运行检查确认失败**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
```

Expected: FAIL，提示缺少 `TicketOrderContext`、`fetchPaymentActivity`、`currentOrder` 等第四阶段实现。

- [ ] **Step 3: 提交检查脚本**

```bash
git add wanda-ticket-1.0.0/package.json wanda-ticket-1.0.0/tools/check-phase4-contract.mjs
git commit -m "新增第四阶段契约检查"
```

---

### Task 2: 补齐第四阶段类型和接口服务

**Files:**
- Modify: `wanda-ticket-1.0.0/src/shared/wandaTicketTypes.ts`
- Modify: `wanda-ticket-1.0.0/src/shared/wandaCore.ts`
- Modify: `wanda-ticket-1.0.0/src/renderer/services/seatApi.ts`
- Test: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`

- [ ] **Step 1: 先保持检查失败**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
```

Expected: FAIL，确认当前任务要补的是类型和接口函数。

- [ ] **Step 2: 在共享类型中增加第四阶段类型**

在 `src/shared/wandaTicketTypes.ts` 末尾加入：

```ts
export interface TicketOrderSeatRef {
  areaId: string
  seatId: string
  rowName: string
  columnName: string
  areaName: string
}

export interface TicketOrderContext {
  orderId: string
  accountId: string
  phone: string
  cityName: string
  cinemaId: string
  cinemaName: string
  movieName: string
  showtimeId: string
  showtimeLabel: string
  amountCent: number
  seats: TicketOrderSeatRef[]
}

export interface PaymentActivityItem {
  code: string
  name: string
  price: number
  channelPrice: number
  able: boolean
  groupName: string
  groupType: string
  note: string
  typeCode: string
  allotSeat: string
  raw: unknown
}

export interface PaymentActivityResult {
  availableActivities: PaymentActivityItem[]
  unavailableActivities: PaymentActivityItem[]
}

export interface PaymentCard {
  cardNo: string
  cardName: string
  cardTypeName: string
  balance: number
  available: boolean
  statusDesc: string
  raw: unknown
}

export interface CouponItem {
  code: string
  name: string
  couponNo: string
  typeCode: string
  able: boolean
  amount: number
  validity: string
  detailTypeName: string
  raw: unknown
}

export interface OrderStatusResult {
  bizCode?: number
  bizMsg?: string
  payStatus?: string | number
  showOrderStatus?: string | number
  showOrderStatusStr?: string
  raw: unknown
}

export type NormalizedOrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded' | 'unknown'

export interface OrderRecord {
  orderId: string
  orderNo: string
  phone: string
  movieName: string
  cinema: string
  showtime: string
  amount: number
  status: NormalizedOrderStatus
  statusText: string
  createdAt: string
  raw: unknown
}

export interface OrderListResult {
  records: OrderRecord[]
  total: number
  raw: unknown
}

export interface OrderPayInfoResult {
  orderId: string
  ticketCodes: string[]
  qrCodes: string[]
  raw: unknown
}
```

- [ ] **Step 3: 增加旧历史订单详情路径并加入接口辅助函数**

先在 `src/shared/wandaCore.ts` 的 `WANDA_API_PATHS` 中加入旧历史订单详情接口：

```ts
  ORDER_QUERY_BY_USER_ID: '/order/query_by_userid.api',
```

在 `src/renderer/services/seatApi.ts` 引入 `CryptoJS` 和新增类型：

```ts
import CryptoJS from 'crypto-js'
import type {
  CouponItem,
  OrderListResult,
  OrderPayInfoResult,
  OrderRecord,
  OrderStatusResult,
  PaymentActivityItem,
  PaymentActivityResult,
  PaymentCard,
  RealTimeSeats,
  TicketOrderResult,
  TicketOrderSeatRef
} from '@shared/wandaTicketTypes'
```

在 `assertNotBlank` 后加入本地辅助函数：

```ts
const ACTIVITY_AES_KEY = '6f34faeefba8fd39'
const PAYMENT_ACTIVITY_LIST_PATH = `${WANDA_API_PATHS.MKT_ACTIVITY_SECRET}list.api`
const PAYMENT_COUPON_LIST_PATH = `${WANDA_API_PATHS.MKT_ACTIVITY_SECRET}ncoupons.api`

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value).trim()

    if (text) {
      return text
    }
  }

  return ''
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function centsToYuan(value: unknown): number {
  return Number((toNumber(value) / 100).toFixed(2))
}

export function buildSeatPartition(seats: TicketOrderSeatRef[]): string {
  const grouped = new Map<string, string[]>()

  for (const seat of seats) {
    const areaId = seat.areaId.trim()
    const seatId = seat.seatId.trim()

    if (!areaId || !seatId) {
      continue
    }

    const seatIds = grouped.get(areaId) ?? []
    seatIds.push(seatId)
    grouped.set(areaId, seatIds)
  }

  return [...grouped.entries()].map(([areaId, seatIds]) => `${areaId}-${seatIds.join(',')}`).join('|')
}

export function buildQueryPath(path: string, query: Record<string, string | number | boolean>): string {
  const queryString = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return `${path}?${queryString}`
}

export function decryptActivityPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  const key = CryptoJS.enc.Utf8.parse(ACTIVITY_AES_KEY)
  const ciphertext = CryptoJS.enc.Hex.parse(value)
  const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
  }).toString(CryptoJS.enc.Utf8)

  return asRecord(JSON.parse(decrypted))
}
```

- [ ] **Step 4: 增加数据标准化函数**

继续在 `seatApi.ts` 中加入：

```ts
function normalizePaymentActivity(item: unknown, group: Record<string, unknown>): PaymentActivityItem {
  const record = asRecord(item)

  return {
    code: firstText(record.code, record.activityCode),
    name: firstText(record.name),
    price: centsToYuan(record.price),
    channelPrice: centsToYuan(record.channelPrice),
    able: Boolean(record.able),
    groupName: firstText(group.groupName),
    groupType: firstText(group.groupType),
    note: firstText(record.note),
    typeCode: firstText(record.typeCode),
    allotSeat: firstText(record.allotSeat, record.allotseat),
    raw: item
  }
}

function normalizePaymentCard(item: unknown): PaymentCard {
  const record = asRecord(item)

  return {
    cardNo: firstText(record.cardNo, record.card_no, record.no),
    cardName: firstText(record.cardName, record.name),
    cardTypeName: firstText(record.cardTypeName, record.typeName),
    balance: centsToYuan(record.balance),
    available: Boolean(record.available),
    statusDesc: firstText(record.statusDesc, record.status),
    raw: item
  }
}

function normalizeCoupon(item: unknown): CouponItem {
  const record = asRecord(item)

  return {
    code: firstText(record.code),
    name: firstText(record.name),
    couponNo: firstText(record.couponNo),
    typeCode: firstText(record.typeCode),
    able: Boolean(record.able),
    amount: centsToYuan(record.amount ?? record.price),
    validity: firstText(record.validityDateShowMsg, record.validity),
    detailTypeName: firstText(record.detailtypename, record.detailTypeName, record.couponTypeName),
    raw: item
  }
}

function normalizeOrderStatus(value: unknown): OrderStatusResult {
  const record = asRecord(value)
  const data = asRecord(record.data)
  const rawStatus = asRecord(data.orderInf).showOrderStatus ? data.orderInf : data

  return {
    bizCode: Number(record.code ?? data.bizCode),
    bizMsg: firstText(record.msg, data.bizMsg),
    payStatus: rawStatus.payStatus,
    showOrderStatus: rawStatus.showOrderStatus,
    showOrderStatusStr: firstText(rawStatus.showOrderStatusStr),
    raw: value
  }
}

function getOrderStatus(payStatus: unknown): OrderRecord['status'] {
  if (Number(payStatus) === 3) {
    return 'completed'
  }

  if (Number(payStatus) === 1) {
    return 'pending'
  }

  if (Number(payStatus) === 5) {
    return 'cancelled'
  }

  return 'unknown'
}

function normalizeOrderRecord(item: unknown, phone: string): OrderRecord {
  const record = asRecord(item)
  const ticketInfo = asRecord(asList(record.subTicketOrderInfo)[0])
  const cinemaInfo = asRecord(ticketInfo.orderInf)
  const movie = asRecord(asList(asRecord(cinemaInfo.movies).movie)[0])
  const status = getOrderStatus(record.payStatus)

  return {
    orderId: firstText(record.orderId),
    orderNo: firstText(record.orderId),
    phone,
    movieName: firstText(movie.name, record.movieName),
    cinema: firstText(cinemaInfo.cinameName, cinemaInfo.cinemaName, record.cinemaName),
    showtime: firstText(movie.showTime, record.showTime),
    amount: centsToYuan(record.realPay ?? record.salesAmount),
    status,
    statusText: firstText(record.showOrderStatusStr, status),
    createdAt: firstText(record.createTime),
    raw: item
  }
}
```

- [ ] **Step 5: 增加支付前置和订单查询接口**

在 `seatApi.ts` 现有导出函数后加入：

```ts
export async function fetchPaymentActivity(
  seats: TicketOrderSeatRef[],
  orderId: string,
  dId: string,
  ck: string,
  userIdentifier: string
): Promise<PaymentActivityResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = buildQueryPath(PAYMENT_ACTIVITY_LIST_PATH, {
    partition: buildSeatPartition(seats),
    orderId,
    did: dId
  })
  const response = await wandaGet<unknown>(WANDA_HOSTS.MKT_ACTIVITY, path, {}, ck, userIdentifier)

  if (response.code !== 0 || !response.data) {
    return { availableActivities: [], unavailableActivities: [] }
  }

  const decrypted = decryptActivityPayload(response.data)
  const availableActivities: PaymentActivityItem[] = []
  const unavailableActivities: PaymentActivityItem[] = []

  for (const group of asList(decrypted.res)) {
    const groupRecord = asRecord(group)

    for (const item of asList(groupRecord.groupItems)) {
      const activity = normalizePaymentActivity(item, groupRecord)

      if (activity.able) {
        availableActivities.push(activity)
      } else {
        unavailableActivities.push(activity)
      }
    }
  }

  return { availableActivities, unavailableActivities }
}

export async function fetchPayCards(orderId: string, ck: string, userIdentifier: string): Promise<PaymentCard[]> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<{ bizCode?: number; bizMsg?: string; cards?: unknown[] }>(
    WANDA_HOSTS.CARD,
    WANDA_API_PATHS.CARD_PAY_LIST,
    { orderId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 || response.data?.bizCode !== 0) {
    return []
  }

  return asList(response.data.cards).map(normalizePaymentCard).filter((card) => card.available)
}

export async function fetchCoupons(
  seats: TicketOrderSeatRef[],
  cinemaId: string,
  dId: string,
  ck: string,
  userIdentifier: string
): Promise<CouponItem[]> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = buildQueryPath(PAYMENT_COUPON_LIST_PATH, {
    partition: buildSeatPartition(seats),
    cinemaId,
    latitude: '',
    did: dId,
    able: true,
    longitude: '',
    coordinateType: 2
  })
  const response = await wandaGet<unknown>(WANDA_HOSTS.MKT_ACTIVITY, path, {}, ck, userIdentifier)

  if (response.code !== 0 || !response.data) {
    return []
  }

  const decrypted = decryptActivityPayload(response.data)
  return asList(asRecord(decrypted.res).coupons).map(normalizeCoupon).filter((coupon) => coupon.able)
}

export async function queryOrderStatus(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<OrderStatusResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_STATUS,
    { orderId },
    ck,
    userIdentifier
  )

  return normalizeOrderStatus(response)
}

export async function queryOrderList(
  pageIndex: number,
  pageSize: number,
  phone: string,
  ck: string,
  userIdentifier: string
): Promise<OrderListResult> {
  assertNotBlank(phone, '手机号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<{ listOrderInf?: unknown[]; totalCount?: number }>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_LIST,
    { busiType: 3, pageIndex, pageSize, timeLeagth: 0 },
    ck,
    userIdentifier
  )
  const records = asList(response.data?.listOrderInf).map((item) => normalizeOrderRecord(item, phone))

  return {
    records,
    total: toNumber(response.data?.totalCount, records.length),
    raw: response
  }
}

export async function queryOrderByUserId(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<OrderPayInfoResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_BY_USER_ID,
    { orderId, timeLeagth: 0 },
    ck,
    userIdentifier
  )
  const data = asRecord(response.data)
  const orderInf = asRecord(asList(data.orderInf)[0])
  const ticketInfo = asRecord(asList(orderInf.subTicketOrderInfo)[0])

  return {
    orderId,
    ticketCodes: asList(ticketInfo.electronicCode).map((item) => firstText(item)).filter(Boolean),
    qrCodes: asList(ticketInfo.electronicQR).map((item) => firstText(item)).filter(Boolean),
    raw: response
  }
}

export async function queryPayInfoUpgrade(
  orderId: string,
  requestInfo: string,
  ck: string,
  userIdentifier: string
): Promise<OrderPayInfoResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_PAY_INFO,
    { orderId, requestInfo },
    ck,
    userIdentifier
  )
  const data = asRecord(response.data)
  const orderInf = asRecord(asList(data.orderInf)[0])
  const ticketInfo = asRecord(asList(orderInf.subTicketOrderInfo)[0])

  return {
    orderId,
    ticketCodes: asList(ticketInfo.electronicCode).map((item) => firstText(item)).filter(Boolean),
    qrCodes: asList(ticketInfo.electronicQR).map((item) => firstText(item)).filter(Boolean),
    raw: response
  }
}
```

- [ ] **Step 6: 运行检查**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
npm run typecheck
```

Expected: `check:phase4` 仍然 FAIL，因为 store 和页面还没接；`typecheck` PASS。

- [ ] **Step 7: 提交接口层**

```bash
git add wanda-ticket-1.0.0/src/shared/wandaTicketTypes.ts wanda-ticket-1.0.0/src/shared/wandaCore.ts wanda-ticket-1.0.0/src/renderer/services/seatApi.ts
git commit -m "接入第四阶段支付前置接口"
```

---

### Task 3: 扩展购票状态和订单上下文

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/ticket.ts`
- Test: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`

- [ ] **Step 1: 运行检查确认 store 缺口**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
```

Expected: FAIL，提示 `ticket.ts` 缺少 `currentOrder`、`refreshPaymentPrerequisites` 等。

- [ ] **Step 2: 增加导入和状态字段**

修改 `src/renderer/stores/ticket.ts` 的接口导入，加入：

```ts
  CouponItem,
  OrderPayInfoResult,
  OrderStatusResult,
  PaymentActivityItem,
  PaymentCard,
  PaymentActivityResult,
  TicketOrderContext,
  TicketOrderSeatRef,
```

把 `seatApi` 导入改成：

```ts
import {
  cancelTicketOrder,
  createTicketOrder,
  fetchCoupons,
  fetchPayCards,
  fetchPaymentActivity,
  fetchRealTimeSeat,
  queryOrderStatus,
  queryPayInfoUpgrade
} from '@renderer/services/seatApi'
```

在 state 中 `currentOrderId` 附近加入：

```ts
    currentOrder: null as TicketOrderContext | null,
    currentOrderPayInfo: null as OrderPayInfoResult | null,
    orderStatus: null as OrderStatusResult | null,
    paymentActivities: [] as PaymentActivityItem[],
    unavailablePaymentActivities: [] as PaymentActivityItem[],
    paymentCards: [] as PaymentCard[],
    coupons: [] as CouponItem[],
    loadingPaymentData: false,
    checkingPayment: false,
    paymentDataMessage: '',
```

- [ ] **Step 3: 增加当前订单上下文辅助方法**

在 actions 中 `clearSeatSelection()` 前加入：

```ts
    buildCurrentOrderContext(orderId: string, accountId: string, phone: string): TicketOrderContext {
      const cityName = this.cities.find((item) => item.value === this.query.city)?.label ?? ''
      const cinemaName = this.cinemas.find((item) => item.value === this.query.cinema)?.label ?? ''
      const movieName = this.movies.find((item) => item.value === this.query.movie)?.label ?? ''
      const showtimeLabel = this.showtimes.find((item) => item.value === this.query.showtime)?.label ?? ''
      const seats: TicketOrderSeatRef[] = this.selectedSeatNodes.map((seat) => ({
        areaId: seat.areaId,
        seatId: seat.seatId,
        rowName: seat.rowLabel,
        columnName: seat.columnLabel,
        areaName: seat.zone
      }))

      return {
        orderId,
        accountId,
        phone,
        cityName,
        cinemaId: this.query.cinema,
        cinemaName,
        movieName,
        showtimeId: this.currentShowtime?.dId ?? '',
        showtimeLabel,
        amountCent: Math.round(this.selectedSeatTotalPrice * 100),
        seats
      }
    },
    clearCurrentOrderPaymentContext() {
      this.currentOrder = null
      this.currentOrderPayInfo = null
      this.orderStatus = null
      this.paymentActivities = []
      this.unavailablePaymentActivities = []
      this.paymentCards = []
      this.coupons = []
      this.paymentActivity = ''
      this.selectedPaymentCards = []
      this.selectedCoupons = []
      this.paymentDataMessage = ''
      this.loadingPaymentData = false
      this.checkingPayment = false
    },
```

- [ ] **Step 4: 增加支付前置刷新和检查动作**

在 `cancelCurrentOrder()` 前加入：

```ts
    async refreshPaymentPrerequisites() {
      const account = useAccountsStore().currentAccount

      if (!account?.ck || !account.userIdentifier || !this.currentOrder) {
        this.paymentDataMessage = '请先选择账号并创建订单'
        return
      }

      this.loadingPaymentData = true
      this.paymentDataMessage = ''

      try {
        const [activityResult, cardResult, couponResult] = await Promise.allSettled([
          fetchPaymentActivity(
            this.currentOrder.seats,
            this.currentOrder.orderId,
            this.currentOrder.showtimeId,
            account.ck,
            account.userIdentifier
          ),
          fetchPayCards(this.currentOrder.orderId, account.ck, account.userIdentifier),
          fetchCoupons(
            this.currentOrder.seats,
            this.currentOrder.cinemaId,
            this.currentOrder.showtimeId,
            account.ck,
            account.userIdentifier
          )
        ])

        if (activityResult.status === 'fulfilled') {
          const activity: PaymentActivityResult = activityResult.value
          this.paymentActivities = activity.availableActivities
          this.unavailablePaymentActivities = activity.unavailableActivities
        } else {
          this.paymentActivities = []
          this.unavailablePaymentActivities = []
          useLogsStore().addLog('支付活动', account.phone, `支付活动加载失败：${activityResult.reason}`)
        }

        if (cardResult.status === 'fulfilled') {
          this.paymentCards = cardResult.value
        } else {
          this.paymentCards = []
          useLogsStore().addLog('支付卡', account.phone, `支付卡加载失败：${cardResult.reason}`)
        }

        if (couponResult.status === 'fulfilled') {
          this.coupons = couponResult.value
        } else {
          this.coupons = []
          useLogsStore().addLog('兑换券', account.phone, `兑换券加载失败：${couponResult.reason}`)
        }

        this.paymentDataMessage = `支付前置数据已刷新：活动 ${this.paymentActivities.length} 个，支付卡 ${this.paymentCards.length} 张，兑换券 ${this.coupons.length} 张`
      } finally {
        this.loadingPaymentData = false
      }
    },
    async checkCurrentOrderBeforePayment() {
      const account = useAccountsStore().currentAccount

      if (this.checkingPayment) {
        this.paymentDataMessage = '订单状态查询中，请勿重复提交'
        return
      }

      if (!account?.ck || !account.userIdentifier || !this.currentOrder) {
        this.paymentDataMessage = '请先创建订单后再提交支付'
        return
      }

      this.checkingPayment = true

      try {
        this.orderStatus = await queryOrderStatus(this.currentOrder.orderId, account.ck, account.userIdentifier)
        this.currentOrderPayInfo = await queryPayInfoUpgrade(
          this.currentOrder.orderId,
          '',
          account.ck,
          account.userIdentifier
        )
        this.paymentDataMessage = this.orderStatus.showOrderStatusStr || this.orderStatus.bizMsg || '订单状态已刷新，本阶段不发起真实支付'
        useLogsStore().addLog('订单状态', account.phone, `订单 ${this.currentOrder.orderId} 状态已刷新`)
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '订单状态查询失败'
        this.paymentDataMessage = message
        useLogsStore().addLog('订单状态', account.phone, `订单状态查询失败：${message}`)
      } finally {
        this.checkingPayment = false
      }
    },
```

- [ ] **Step 5: 接入订单创建、取消和账号切换**

在 `handleAccountChanged()` 开头清理当前订单：

```ts
      this.clearCurrentOrderPaymentContext()
      this.currentOrderId = ''
      this.currentOrderAccountId = ''
```

在 `createCurrentOrder()` 成功分支中设置当前订单，并刷新支付前置数据：

```ts
        this.currentOrderId = result.orderId
        this.currentOrderAccountId = account.id
        this.currentOrder = this.buildCurrentOrderContext(result.orderId, account.id, account.phone)
        this.currentOrderMessage = result.bizMsg || '订单创建成功'
        useLogsStore().addLog('订单', account.phone, `订单创建成功：${result.orderId}`)
        await this.refreshPaymentPrerequisites()
```

在 `cancelCurrentOrder()` 取消成功后加入：

```ts
        this.clearCurrentOrderPaymentContext()
```

保留当前 `currentOrderId = ''` 和 `currentOrderAccountId = ''` 清理逻辑。

- [ ] **Step 6: 运行检查**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
npm run typecheck
```

Expected: `check:phase4` 仍然 FAIL，因为页面和订单 store 还没接；`typecheck` PASS。

- [ ] **Step 7: 提交购票状态**

```bash
git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
git commit -m "补齐购票支付前置状态"
```

---

### Task 4: 接入购票页右侧支付前置数据

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/views/TicketView.vue`
- Test: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`

- [ ] **Step 1: 运行检查确认页面缺口**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
```

Expected: FAIL，提示 `TicketView.vue` 缺少真实支付前置绑定。

- [ ] **Step 2: 改造全局订单信息面板**

把当前 `currentOrderId` 的摘要区域替换为：

```vue
        <div v-if="ticketStore.currentOrder" class="order-summary">
          <p>订单号：{{ ticketStore.currentOrder.orderId }}</p>
          <p>{{ ticketStore.currentOrder.movieName }} / {{ ticketStore.currentOrder.cinemaName }}</p>
          <p>{{ ticketStore.currentOrder.showtimeLabel }}</p>
          <p>金额：¥{{ (ticketStore.currentOrder.amountCent / 100).toFixed(2) }}</p>
          <p v-if="ticketStore.paymentDataMessage">{{ ticketStore.paymentDataMessage }}</p>
          <el-button
            size="small"
            type="warning"
            :loading="ticketStore.orderCancelling"
            :disabled="ticketStore.orderCancelling"
            @click="ticketStore.cancelCurrentOrder"
          >
            取消订单
          </el-button>
        </div>
```

- [ ] **Step 3: 改造支付活动、支付卡、兑换券面板**

支付活动面板使用：

```vue
        <div class="side-line">
          <span>活动价</span>
          <el-select
            v-model="ticketStore.paymentActivity"
            size="small"
            placeholder="无活动"
            :loading="ticketStore.loadingPaymentData"
          >
            <el-option label="无活动" value="" />
            <el-option
              v-for="activity in ticketStore.paymentActivities"
              :key="activity.code || activity.name"
              :label="activity.name || activity.note"
              :value="activity.code || activity.name"
            />
          </el-select>
        </div>
```

支付卡面板空状态替换为：

```vue
        <div v-if="ticketStore.paymentCards.length" class="mini-list">
          <label v-for="card in ticketStore.paymentCards" :key="card.cardNo" class="mini-list-item">
            <el-checkbox v-model="ticketStore.selectedPaymentCards" :label="card.cardNo" />
            <span>{{ card.cardName || card.cardTypeName }}</span>
            <em>¥{{ card.balance.toFixed(2) }}</em>
          </label>
        </div>
        <div v-else class="side-empty">
          {{ ticketStore.loadingPaymentData ? '支付卡加载中' : '暂无可用支付卡' }}
        </div>
```

兑换券面板空状态替换为：

```vue
        <div v-if="ticketStore.coupons.length" class="mini-list">
          <label v-for="coupon in ticketStore.coupons" :key="coupon.code || coupon.couponNo" class="mini-list-item">
            <el-checkbox v-model="ticketStore.selectedCoupons" :label="coupon.code || coupon.couponNo" />
            <span>{{ coupon.name }}</span>
            <em>{{ coupon.validity }}</em>
          </label>
        </div>
        <div v-else class="side-empty">
          {{ ticketStore.loadingPaymentData ? '兑换券加载中' : '暂无可用兑换券' }}
        </div>
```

- [ ] **Step 4: 调整底部动作含义**

把“确认选座”按钮改为负责创建订单：

```vue
      <el-popconfirm
        title="确认创建电影票订单？本阶段不会发起支付。"
        confirm-button-text="确认"
        cancel-button-text="取消"
        @confirm="ticketStore.createCurrentOrder"
      >
        <template #reference>
          <el-button
            type="success"
            :loading="ticketStore.orderCreating"
            :disabled="ticketStore.selectedSeatCount === 0 || ticketStore.orderCreating || Boolean(ticketStore.currentOrder)"
          >
            确认选座
          </el-button>
        </template>
      </el-popconfirm>
      <el-button
        type="primary"
        :loading="ticketStore.checkingPayment"
        :disabled="!ticketStore.currentOrder || ticketStore.checkingPayment"
        @click="ticketStore.checkCurrentOrderBeforePayment"
      >
        提交支付
      </el-button>
```

删除原来包住“提交支付”的 `el-popconfirm`，保证本阶段提交支付不创建订单、不发起支付。

- [ ] **Step 5: 增加紧凑列表样式**

在 `<style scoped>` 中加入：

```css
.mini-list {
  max-height: 126px;
  overflow: auto;
  padding: 8px 12px 12px;
}

.mini-list-item {
  min-height: 30px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--app-text);
  font-size: 12px;
}

.mini-list-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-list-item em {
  color: var(--app-muted);
  font-style: normal;
}
```

- [ ] **Step 6: 运行检查**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
npm run typecheck
```

Expected: `check:phase4` 仍然 FAIL，因为历史订单 store/view 还没接；`typecheck` PASS。

- [ ] **Step 7: 提交购票页**

```bash
git add wanda-ticket-1.0.0/src/renderer/views/TicketView.vue
git commit -m "展示购票支付前置数据"
```

---

### Task 5: 接入历史订单真实数据

**Files:**
- Modify: `wanda-ticket-1.0.0/src/renderer/stores/orders.ts`
- Modify: `wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue`
- Test: `wanda-ticket-1.0.0/tools/check-phase4-contract.mjs`

- [ ] **Step 1: 运行检查确认订单页缺口**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
```

Expected: FAIL，提示 `orders.ts` 和 `OrderHistoryView.vue` 缺少真实数据绑定。

- [ ] **Step 2: 改造 orders store**

把 `src/renderer/stores/orders.ts` 改为：

```ts
import { defineStore } from 'pinia'

import { queryOrderByUserId, queryOrderList } from '@renderer/services/seatApi'
import type { OrderPayInfoResult, OrderRecord } from '@shared/wandaTicketTypes'
import { useAccountsStore } from './accounts'
import { useLogsStore } from './logs'

export type OrderDateRange = [Date, Date] | []

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function toDateText(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    filters: {
      keyword: '',
      status: '',
      dateRange: [] as OrderDateRange
    },
    orders: [] as OrderRecord[],
    total: 0,
    pageIndex: 1,
    pageSize: 20,
    loading: false,
    detailLoading: false,
    message: '',
    currentPayInfo: null as OrderPayInfoResult | null
  }),
  getters: {
    filteredOrders(state) {
      const keyword = state.filters.keyword.trim().toLowerCase()
      let list = state.orders

      if (keyword) {
        list = list.filter(
          (order) =>
            order.phone.toLowerCase().includes(keyword) ||
            order.orderNo.toLowerCase().includes(keyword) ||
            order.movieName.toLowerCase().includes(keyword)
        )
      }

      if (state.filters.status) {
        list = list.filter((order) => order.status === state.filters.status)
      }

      if (state.filters.dateRange.length === 2) {
        const [start, end] = state.filters.dateRange
        const startText = toDateText(start)
        const endText = toDateText(end)
        list = list.filter((order) => {
          const createdDate = order.createdAt.slice(0, 10)
          return createdDate >= startText && createdDate <= endText
        })
      }

      return list
    },
    summary(): { today: number; pending: number; completed: number; totalAmount: number } {
      const list = this.filteredOrders

      return {
        today: list.length,
        pending: list.filter((order) => order.status === 'pending').length,
        completed: list.filter((order) => order.status === 'completed').length,
        totalAmount: list
          .filter((order) => order.status === 'completed')
          .reduce((sum, order) => sum + order.amount, 0)
      }
    },
    totalAmountText(): string {
      return `¥${this.summary.totalAmount.toFixed(2)}`
    }
  },
  actions: {
    resetFilters() {
      this.filters.keyword = ''
      this.filters.status = ''
      this.filters.dateRange = []
    },
    async loadOrders() {
      const account = useAccountsStore().currentAccount

      if (!account?.ck || !account.userIdentifier || !account.phone) {
        this.orders = []
        this.total = 0
        this.message = '请先选择已登录的万达账号'
        return
      }

      this.loading = true
      this.message = ''

      try {
        const result = await queryOrderList(
          this.pageIndex,
          this.pageSize,
          account.phone,
          account.ck,
          account.userIdentifier
        )
        this.orders = result.records
        this.total = result.total
        useLogsStore().addLog('历史订单', account.phone, `历史订单加载成功：${result.records.length} 条`)
      } catch (error) {
        const message = getErrorMessage(error, '历史订单加载失败')
        this.orders = []
        this.total = 0
        this.message = message
        useLogsStore().addLog('历史订单', account.phone, `历史订单加载失败：${message}`)
      } finally {
        this.loading = false
      }
    },
    async queryOrderPayInfo(order: OrderRecord) {
      const account = useAccountsStore().currentAccount

      if (!account?.ck || !account.userIdentifier) {
        this.message = '请先选择已登录的万达账号'
        return
      }

      this.detailLoading = true

      try {
        this.currentPayInfo = await queryOrderByUserId(order.orderId, account.ck, account.userIdentifier)
        this.message = `订单 ${order.orderNo} 支付信息已刷新`
        useLogsStore().addLog('历史订单', account.phone, `查询支付信息：${order.orderNo}`)
      } catch (error) {
        const message = getErrorMessage(error, '支付信息查询失败')
        this.message = message
        useLogsStore().addLog('历史订单', account.phone, `支付信息查询失败：${message}`)
      } finally {
        this.detailLoading = false
      }
    },
    exportCurrentOrders(): string {
      const header = ['手机号', '订单号', '影片', '影院', '场次', '金额', '状态', '创建时间']
      const rows = this.filteredOrders.map((order) => [
        order.phone,
        order.orderNo,
        order.movieName,
        order.cinema,
        order.showtime,
        order.amount.toFixed(2),
        order.statusText,
        order.createdAt
      ])

      return [header, ...rows]
        .map((row) => row.map((item) => `"${String(item).replaceAll('"', '""')}"`).join(','))
        .join('\n')
    }
  }
})
```

- [ ] **Step 3: 改造历史订单页面脚本**

在 `OrderHistoryView.vue` 的 `<script setup>` 改为：

```ts
import { onMounted, watch } from 'vue'
import { Download, Refresh, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import { useAccountsStore } from '@renderer/stores/accounts'
import { useOrdersStore } from '@renderer/stores/orders'

const accountsStore = useAccountsStore()
const ordersStore = useOrdersStore()

function handleSearch(): void {
  ordersStore.pageIndex = 1
  void ordersStore.loadOrders()
}

function handleExport(): void {
  const csv = ordersStore.exportCurrentOrders()
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `万达历史订单-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('订单已导出')
}

onMounted(() => {
  void ordersStore.loadOrders()
})

watch(
  () => accountsStore.currentAccountId,
  () => {
    ordersStore.pageIndex = 1
    void ordersStore.loadOrders()
  }
)
```

- [ ] **Step 4: 改造历史订单页面模板**

把按钮绑定改为：

```vue
      <el-button type="primary" :icon="Search" :loading="ordersStore.loading" @click="handleSearch">搜索</el-button>
      <el-button :icon="Refresh" :loading="ordersStore.loading" @click="ordersStore.loadOrders">刷新</el-button>
      <span class="toolbar-spacer" />
      <el-button type="success" :icon="Download" :disabled="ordersStore.filteredOrders.length === 0" @click="handleExport">
        导出
      </el-button>
```

把表格改为：

```vue
      <el-table
        v-loading="ordersStore.loading || ordersStore.detailLoading"
        :data="ordersStore.filteredOrders"
        height="100%"
        :empty-text="ordersStore.message || '暂无数据'"
      >
        <el-table-column prop="phone" label="手机号" min-width="120" />
        <el-table-column prop="orderNo" label="订单号" min-width="150" />
        <el-table-column prop="movieName" label="影片" min-width="150" />
        <el-table-column prop="cinema" label="影院" min-width="180" />
        <el-table-column prop="showtime" label="场次" min-width="160" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="statusText" label="状态" width="100" />
        <el-table-column prop="createdAt" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="ordersStore.queryOrderPayInfo(row)">
              支付信息
            </el-button>
          </template>
        </el-table-column>
      </el-table>
```

在表格 section 后加入分页：

```vue
    <footer class="table-pagination">
      <span>共 {{ ordersStore.total }} 条</span>
      <el-pagination
        v-model:current-page="ordersStore.pageIndex"
        v-model:page-size="ordersStore.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="ordersStore.total"
        layout="sizes, prev, pager, next, jumper"
        background
        @size-change="ordersStore.loadOrders"
        @current-change="ordersStore.loadOrders"
      />
    </footer>
```

- [ ] **Step 5: 调整历史订单页面布局**

把 `.table-page` 的 grid 行改为：

```css
  grid-template-rows: 50px 104px minmax(0, 1fr) 44px;
```

加入分页样式：

```css
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  color: var(--app-muted);
}
```

- [ ] **Step 6: 运行检查**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:phase4
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交历史订单**

```bash
git add wanda-ticket-1.0.0/src/renderer/stores/orders.ts wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue
git commit -m "接入历史订单真实查询"
```

---

### Task 6: 回归验证和第四阶段收口

**Files:**
- Verify only unless checks expose issues.

- [ ] **Step 1: 运行全部契约检查**

Run:

```bash
cd wanda-ticket-1.0.0
npm run check:renderer
npm run check:phase2
npm run check:phase3
npm run check:phase4
```

Expected: all PASS。

- [ ] **Step 2: 运行类型检查和构建**

Run:

```bash
cd wanda-ticket-1.0.0
npm run typecheck
npm run build
```

Expected: PASS。允许已有 Rollup 对 `@vueuse/core` 注释的 warning；不允许 TypeScript error 或构建失败。

- [ ] **Step 3: 检查 diff 空白和敏感信息**

Run:

```bash
git diff --check
rg "ORDER_PREPAY|ORDER_MERGE_PAYMENT|prepay|mergePayment" wanda-ticket-1.0.0/src/renderer/stores/ticket.ts wanda-ticket-1.0.0/src/renderer/views/TicketView.vue
rg "test001|2027/6/10|608.23|mock" wanda-ticket-1.0.0/src/renderer
```

Expected:
- `git diff --check` 无输出。
- 第一条 `rg` 不命中购票页真实支付调用。
- 第二条 `rg` 不命中旧截图假数据和 mock 数据。

- [ ] **Step 4: 如果发现问题，按最小范围修复**

修复只允许落在第四阶段涉及文件中：

```text
wanda-ticket-1.0.0/src/shared/wandaTicketTypes.ts
wanda-ticket-1.0.0/src/shared/wandaCore.ts
wanda-ticket-1.0.0/src/renderer/services/seatApi.ts
wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
wanda-ticket-1.0.0/src/renderer/views/TicketView.vue
wanda-ticket-1.0.0/src/renderer/stores/orders.ts
wanda-ticket-1.0.0/src/renderer/views/OrderHistoryView.vue
wanda-ticket-1.0.0/tools/check-phase4-contract.mjs
wanda-ticket-1.0.0/package.json
```

修复后重新运行 Step 1 到 Step 3。

- [ ] **Step 5: 请求代码审查**

使用 `superpowers:requesting-code-review`，要求 reviewer 重点检查：

```text
1. 是否误触真实支付接口或支付宝逻辑。
2. 支付活动/支付卡/兑换券接口参数是否贴近旧包。
3. 账号切换、取消订单、接口失败时是否清空上下文。
4. 历史订单是否使用真实接口、没有 mock 数据。
5. 第四阶段检查脚本是否覆盖本阶段边界。
```

- [ ] **Step 6: 处理审查反馈并最终提交**

如果审查提出有效问题，使用 `superpowers:receiving-code-review` 后修复。最终确认后提交：

```bash
git add wanda-ticket-1.0.0
git commit -m "完成第四阶段支付前置和订单查询"
```

如果所有任务已经分别提交且最后没有未提交变更，则不创建空提交，只在最终回复中列出最后一个有效提交。
