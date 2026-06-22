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

const packageJson = JSON.parse(read('package.json'))
const design = read('docs/superpowers/specs/2026-06-21-activity-gift-flow-design.md')
const core = read('src/shared/wandaCore.ts')
const wandaRequest = read('src/renderer/services/wandaRequest.ts')
const featureApi = read('src/renderer/services/featureApi.ts')
const activityView = read('src/renderer/views/ActivityView.vue')

if (packageJson.scripts?.['check:activity-gift'] !== 'node tools/check-activity-gift-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:activity-gift 脚本')
}

for (const label of [
  '活动礼包真实订单链路设计',
  '/pack_activity/activity/create_order.api',
  '/giftshop/orders',
  '/giftshop/orders/detail',
  '/giftshop/transactions/create',
  '/giftshop/transactions/detail',
  'payMethodId=1057',
  '支付参数',
  '不自动拉起支付宝'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-21-activity-gift-flow-design.md', design, label)
}

for (const label of [
  'PACK_ACTIVITY_CREATE_ORDER',
  'GIFT_ORDERS',
  'GIFT_ORDER_DETAIL',
  'GIFT_TRANSACTION_CREATE',
  'GIFT_TRANSACTION_DETAIL'
]) {
  assertIncludes('src/shared/wandaCore.ts', core, label)
}

for (const label of ['contentType?: string', 'options.contentType']) {
  assertIncludes('src/renderer/services/wandaRequest.ts', wandaRequest, label)
}

for (const label of [
  'ActivityGiftOrderRow',
  'ActivityGiftOrderListResult',
  'ActivityGiftPaymentResult',
  'createActivityGiftOrder',
  'fetchGiftOrderDetail',
  'createGiftTransaction',
  'fetchGiftTransactionDetail',
  'createActivityGiftPayment',
  'fetchGiftOrders',
  'normalizeGiftOrder',
  'sanitizeWandaErrorMessage',
  'unitPrice',
  'WANDA_API_PATHS.PACK_ACTIVITY_CREATE_ORDER',
  'WANDA_API_PATHS.GIFT_ORDERS',
  'WANDA_API_PATHS.GIFT_ORDER_DETAIL',
  'WANDA_API_PATHS.GIFT_TRANSACTION_CREATE',
  'WANDA_API_PATHS.GIFT_TRANSACTION_DETAIL',
  "contentType: 'application/json'",
  "encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g",
  'activityCode',
  'payId=',
  'payMethodId',
  'appPayParam'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /fetchActivityDetail\([\s\S]*?activityCode[\s\S]*?json: true/,
  '活动详情必须使用旧包 activityCode 参数'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /createActivityGiftOrder\([\s\S]*?goodsNum[\s\S]*?orderAmount[\s\S]*?wandaPostForm/,
  '活动礼包创建订单必须使用旧包 JSON body 和 POST'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /createGiftTransaction\([\s\S]*?payId[\s\S]*?payMethodId[\s\S]*?json=true[\s\S]*?wandaPostForm/,
  '礼包交易创建必须使用旧包 form body 和 POST'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /fetchGiftTransactionDetail\([\s\S]*?GIFT_TRANSACTION_DETAIL[\s\S]*?payId[\s\S]*?id[\s\S]*?json=true/,
  '礼包交易详情必须使用旧包 payId、id、json=true 查询'
)

for (const label of [
  'fetchGiftOrders',
  'createActivityGiftOrder',
  'createActivityGiftPayment',
  'giftOrders',
  'giftOrderRows',
  'giftOrderMessage',
  'giftOrderTotal',
  'paymentResultDialogVisible',
  'paymentResultText',
  'buyingPaymentOrderId',
  'loadGiftOrders',
  'handleBuyGift(row)',
  'handleCreateGiftPayment',
  'handleOrderPayment',
  'showGiftPaymentResult',
  'copyPaymentResult',
  'getGiftQuantity(row)',
  '@confirm="handleBuyGift(row)"',
  '@click="handleOrderPayment(row)"',
  '@click="loadGiftOrders"',
  '我的礼包订单',
  '支付参数'
]) {
  assertIncludes('src/renderer/views/ActivityView.vue', activityView, label)
}

for (const label of [
  '礼包购买会创建真实订单并进入支付链路，当前版本先保留入口，暂不发起购买',
  "ElMessage.info('礼包订单接口后续接入旧包 giftshop/orders')",
  'alipay-convert'
]) {
  assertNotIncludes('src/renderer/views/ActivityView.vue', activityView, label)
  assertNotIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

console.log('活动礼包真实订单与支付参数契约检查通过')
