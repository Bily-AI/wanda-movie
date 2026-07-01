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
const design = read('docs/superpowers/specs/2026-06-21-stored-card-real-actions-design.md')
const wandaCore = read('src/shared/wandaCore.ts')
const featureApi = read('src/renderer/services/featureApi.ts')
const storedCardView = read('src/renderer/views/StoredValueCardView.vue')

if (packageJson.scripts?.['check:stored-card'] !== 'node tools/check-stored-card-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:stored-card 脚本')
}

for (const label of [
  '储值卡真实操作链路设计',
  '/card/user_card/list.api',
  '/card/pay/list.api',
  '/card/transfer.version',
  '/card/recharge.version',
  '/order/create.api',
  '/order/prepay.api'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-21-stored-card-real-actions-design.md', design, label)
}

for (const label of ['CARD_TRANSFER', 'CARD_RECHARGE', 'ORDER_CREATE', 'ORDER_PREPAY']) {
  assertIncludes('src/shared/wandaCore.ts', wandaCore, label)
}

for (const label of [
  'STORED_CARD_DENOMINATIONS',
  'StoredCardBalanceInfo',
  'StoredCardListResult',
  'StoredCardPaymentResult',
  'fetchStoredCardsWithBalance',
  'fetchOrderPayCards',
  'transferStoredCard',
  'createStoredCardOrder',
  'prepayStoredCardOrder',
  'rechargeStoredCard',
  'createStoredCardPurchasePayment',
  'createStoredCardRechargePayment',
  'WANDA_API_PATHS.CARD_TRANSFER',
  'WANDA_API_PATHS.CARD_RECHARGE',
  'WANDA_API_PATHS.ORDER_CREATE',
  'WANDA_API_PATHS.ORDER_PREPAY'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

for (const label of [
  'presentBalance',
  'available',
  'statusDesc',
  'remainingCount',
  'categoryName',
  'discountRate',
  'effectDate',
  'coverName',
  'unavailableReason',
  'ownerPhone'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /transferStoredCard\([\s\S]*?verify_code[\s\S]*?verify_context_id[\s\S]*?card_no[\s\S]*?target_user_mobile[\s\S]*?order_id/,
  '储值卡赠送必须沿用旧包 transfer.version 参数'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /createStoredCardOrder\([\s\S]*?cinemaId[\s\S]*?coverCode[\s\S]*?salePrice[\s\S]*?activityCode[\s\S]*?isGift[\s\S]*?source[\s\S]*?json/,
  '储值卡购买建单必须沿用旧包 order/create.api 参数'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /rechargeStoredCard\([\s\S]*?amount[\s\S]*?card_no[\s\S]*?return_url[\s\S]*?pay_type[\s\S]*?activityCode/,
  '储值卡充值必须沿用旧包 recharge.version 参数'
)

for (const label of [
  'cardDisplayMode',
  'detailDialogVisible',
  'purchaseDialogVisible',
  'rechargeDialogVisible',
  'transferDialogVisible',
  'paymentResultDialogVisible',
  'loadAllAccountsCards',
  'showCardDetail',
  'openPurchaseDialog',
  'openRechargeDialog',
  'openTransferDialog',
  'getCardActionAccount',
  'handleConfirmPurchase',
  'handleConfirmRecharge',
  'handleConfirmTransfer',
  'maskCardNo',
  'maskPhone',
  'safeCardNo',
  'safeMobile',
  'formatMoney',
  "function getStoredCardStatusTagType(row: StoredCardRow): 'success' | 'danger'",
  "return row.available ? 'success' : 'danger'",
  ':type="getStoredCardStatusTagType(row)"',
  '@click="showCardDetail(row)"',
  '@click="openRechargeDialog(row)"',
  '@click="openTransferDialog(row)"'
]) {
  assertIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, label)
}

assertMatches(
  'src/renderer/views/StoredValueCardView.vue',
  storedCardView,
  /getCardActionAccount\([\s\S]*?accountsStore\.accounts\.find[\s\S]*?ownerPhone[\s\S]*?account\.ck/,
  '储值卡充值/赠送必须按卡所属账号选择 CK'
)

assertMatches(
  'src/renderer/views/StoredValueCardView.vue',
  storedCardView,
  /handleConfirmRecharge\([\s\S]*?const card = selectedCard\.value[\s\S]*?getCardActionAccount\(card\)[\s\S]*?createStoredCardRechargePayment/,
  '储值卡充值必须使用卡所属账号调用接口'
)

assertMatches(
  'src/renderer/views/StoredValueCardView.vue',
  storedCardView,
  /handleConfirmTransfer\([\s\S]*?const card = selectedCard\.value[\s\S]*?getCardActionAccount\(card\)[\s\S]*?transferStoredCard/,
  '储值卡赠送必须使用卡所属账号调用接口'
)

for (const label of [
  'handlePaymentFeature',
  '当前版本先保留入口',
  '暂不发起支付',
  '储值卡详情已保留在原始接口数据中',
  "row.effectDate || '长期有效'",
  'label="有效期"'
]) {
  assertNotIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, label)
}

console.log('储值卡真实操作契约检查通过')
