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

function sliceRequired(file, content, startLabel, endLabel, label) {
  const start = content.indexOf(startLabel)

  if (start < 0) {
    throw new Error(`${file} 缺少 ${label}`)
  }

  const end = content.indexOf(endLabel, start + startLabel.length)

  if (end < 0) {
    throw new Error(`${file} 缺少 ${label}`)
  }

  return content.slice(start, end)
}

function assertBlockContains(file, content, startLabel, endLabel, labels, label) {
  let offset = 0

  while (offset < content.length) {
    const start = content.indexOf(startLabel, offset)

    if (start < 0) {
      break
    }

    const end = content.indexOf(endLabel, start + startLabel.length)

    if (end < 0) {
      break
    }

    const block = content.slice(start, end + endLabel.length)

    if (labels.every((item) => block.includes(item))) {
      return
    }

    offset = end + endLabel.length
  }

  throw new Error(`${file} 缺少 ${label}`)
}

const packageJson = read('package.json')
const packageConfig = JSON.parse(packageJson)
const core = read('src/shared/wandaCore.ts')
const types = read('src/shared/wandaTicketTypes.ts')
const mainWandaHttp = read('src/main/wandaHttp.ts')
const preload = read('src/preload/index.ts')
const wandaRequest = read('src/renderer/services/wandaRequest.ts')
const cinemaApi = read('src/renderer/services/cinemaApi.ts')
const seatApi = read('src/renderer/services/seatApi.ts')
const wandaAuthApi = read('src/renderer/services/wandaAuthApi.ts')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const ordersStore = read('src/renderer/stores/orders.ts')
const ordersView = read('src/renderer/views/OrderHistoryView.vue')

if (packageConfig.scripts?.['check:phase4'] !== 'node tools/check-phase4-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:phase4 脚本')
}

const wandaApiPaths = sliceRequired('src/shared/wandaCore.ts', core, 'export const WANDA_API_PATHS = {', '} as const', 'WANDA_API_PATHS')

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

for (const label of ['ORDER_QUERY_BY_USER_ID', '/order/query_by_userid.api']) {
  assertIncludes('src/shared/wandaCore.ts', wandaApiPaths, label)
}

for (const label of [
  'ORDER_PREPAY',
  '/order/prepay.api',
  'ORDER_MERGE_PAYMENT',
  '/order/merge_payment.api'
]) {
  assertIncludes('src/shared/wandaCore.ts', wandaApiPaths, label)
}

const validateWandaRequestBlock = sliceRequired(
  'src/shared/wandaCore.ts',
  core,
  'export function validateWandaRequest',
  'return null',
  'validateWandaRequest'
)

for (const label of [
  'blockedWandaPaymentKeywords',
  'includesBlockedWandaPaymentKeyword',
  'alipay'
]) {
  assertIncludes('src/shared/wandaCore.ts', core, label)
}

for (const label of [
  'includesBlockedWandaPaymentKeyword(`${parsedUrl.pathname}${parsedUrl.search}`)',
  'includesBlockedWandaPaymentKeyword(request.params)',
  'includesBlockedWandaPaymentKeyword(request.body)'
]) {
  assertIncludes('src/shared/wandaCore.ts', validateWandaRequestBlock, label)
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
  'submitTicketPayment',
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
  'submittingPayment',
  'refreshPaymentPrerequisites',
  'clearCurrentOrderPaymentContext',
  'checkCurrentOrderBeforePayment',
  'submitCurrentOrderPayment'
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
  'ticketStore.submitCurrentOrderPayment',
  '@confirm="ticketStore.createCurrentOrder"'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertBlockContains(
  'src/renderer/views/TicketView.vue',
  ticketView,
  '<el-popconfirm',
  '</el-popconfirm>',
  ['确认选座', '@confirm="ticketStore.createCurrentOrder"'],
  '确认选座按钮负责创建订单'
)
assertBlockContains(
  'src/renderer/views/TicketView.vue',
  ticketView,
  '<el-popconfirm',
  '</el-popconfirm>',
  ['提交支付', '@confirm="ticketStore.submitCurrentOrderPayment"', '真实支付接口'],
  '提交支付必须经确认弹窗触发真实支付接口'
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
  ['src/main/wandaHttp.ts', mainWandaHttp],
  ['src/preload/index.ts', preload],
  ['src/renderer/services/wandaRequest.ts', wandaRequest],
  ['src/renderer/services/cinemaApi.ts', cinemaApi],
  ['src/renderer/services/seatApi.ts', seatApi],
  ['src/renderer/services/wandaAuthApi.ts', wandaAuthApi],
  ['src/renderer/stores/ticket.ts', ticketStore],
  ['src/renderer/stores/orders.ts', ordersStore],
  ['src/renderer/views/TicketView.vue', ticketView]
]) {
  assertNotIncludes(file, content, 'ORDER_PREPAY')
  assertNotIncludes(file, content, '/order/prepay.api')
  assertNotIncludes(file, content, 'prepay')
  assertNotIncludes(file, content, 'alipay')
  assertNotIncludes(file, content, 'Alipay')
  assertNotIncludes(file, content, 'ALIPAY')
  assertNotIncludes(file, content, '支付宝')
}

console.log('第四阶段支付前置与订单查询契约检查通过')
