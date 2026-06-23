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

function assertOrdered(file, content, labels, label) {
  let cursor = -1

  for (const item of labels) {
    const next = content.indexOf(item, cursor + 1)

    if (next < 0) {
      throw new Error(`${file} 缺少 ${label}: ${item}`)
    }

    cursor = next
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
const design = read('docs/superpowers/specs/2026-06-21-submit-payment-design.md')
const core = read('src/shared/wandaCore.ts')
const types = read('src/shared/wandaTicketTypes.ts')
const seatApi = read('src/renderer/services/seatApi.ts')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const wandaRequest = read('src/renderer/services/wandaRequest.ts')

if (packageConfig.scripts?.['check:payment-submit'] !== 'node tools/check-payment-submit-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:payment-submit 脚本')
}

for (const label of ['提交支付真实链路设计', '/order/merge_payment.api', '不启用自动支付宝窗口']) {
  assertIncludes('docs/superpowers/specs/2026-06-21-submit-payment-design.md', design, label)
}

const validateWandaRequestBlock = sliceRequired(
  'src/shared/wandaCore.ts',
  core,
  'export function validateWandaRequest',
  'return null',
  'validateWandaRequest'
)

for (const label of ['ORDER_MERGE_PAYMENT', '/order/merge_payment.api']) {
  assertIncludes('src/shared/wandaCore.ts', core, label)
}

for (const label of [
  'blockedWandaPaymentPathValues',
  'isBlockedWandaPaymentUrl(parsedUrl)',
  'WANDA_API_PATHS.ORDER_MERGE_PAYMENT'
]) {
  assertNotIncludes('src/shared/wandaCore.ts', validateWandaRequestBlock, label)
}

for (const label of ['TicketPaymentSubmitRequest', 'TicketPaymentSubmitResult']) {
  assertIncludes('src/shared/wandaTicketTypes.ts', types, label)
}

const submitPaymentBlock = sliceRequired(
  'src/renderer/services/seatApi.ts',
  seatApi,
  'export async function submitTicketPayment',
  'export async function queryOrderStatus',
  'submitTicketPayment'
)

for (const label of [
  'submitTicketPayment',
  'escapeRequestInfoForSignature',
  'decryptPaymentSubmitPayload',
  'ORDER_MERGE_PAYMENT',
  'cartSnackInfo=%5b%5d',
  'cartSnackInfo=%5B%5D',
  'requestInfo=',
  'normalizedRequestInfoJson',
  'encodeURIComponent(normalizedRequestInfoJson)',
  'escapeRequestInfoForSignature(normalizedRequestInfoJson)',
  'signatureBody',
  'wandaPostForm<unknown>'
]) {
  assertIncludes('src/renderer/services/seatApi.ts', submitPaymentBlock, label)
}

for (const label of ['selectCouponsForPayment', 'fetchCouponUsePayment', 'selectcoupon.api', 'conponuse.api']) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}

for (const label of [
  'buildCouponUseHeaders',
  'wandaGetWithHeaders<unknown>',
  "headers['X-RY-USER'] = userIdentifier.trim() || DEFAULT_WANDA_USER_IDENTIFIER",
  "delete headers['MX-CID']"
]) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}

assertMatches(
  'src/renderer/services/seatApi.ts',
  seatApi,
  /escapeRequestInfoForSignature\([\s\S]*?replaceAll\('\\\\\\\\u003d', '\\\\u003d'\)[\s\S]*?escape/,
  'requestInfo 签名转义必须沿用旧包逻辑'
)

assertOrdered(
  'src/renderer/services/seatApi.ts',
  submitPaymentBlock,
  [
    'const requestInfoJson = JSON.stringify(request.requestInfo)',
    "const normalizedRequestInfoJson = requestInfoJson.replaceAll('\\\\\\\\u003d', '\\\\u003d')",
    'const encodedRequestInfo = encodeURIComponent(normalizedRequestInfoJson)'
  ],
  'requestInfo 必须先归一化再用于签名和表单'
)

assertOrdered(
  'src/renderer/services/seatApi.ts',
  submitPaymentBlock,
  [
    'const formBody = [',
    "'cartSnackInfo=%5B%5D'",
    '`cinemaId=${request.cinemaId}`',
    '`mobilePhone=${request.mobilePhone}`',
    '`orderId=${request.orderId}`',
    '`requestInfo=${encodedRequestInfo}`'
  ],
  'merge_payment form body 顺序必须对齐旧包'
)

assertOrdered(
  'src/renderer/services/seatApi.ts',
  submitPaymentBlock,
  [
    'const signatureBody = [',
    "'cartSnackInfo=%5b%5d'",
    '`cinemaId=${request.cinemaId}`',
    '`mobilePhone=${request.mobilePhone}`',
    '`orderId=${request.orderId}`',
    '`requestInfo=${escapeRequestInfoForSignature(normalizedRequestInfoJson)}`'
  ],
  'merge_payment signature body 顺序必须对齐旧包'
)

assertMatches(
  'src/renderer/services/seatApi.ts',
  seatApi,
  /queryPayInfoUpgrade\(\s*orderId:\s*string,\s*tradeNo:\s*string[\s\S]*?\{\s*orderId,\s*tradeNo\s*\}/,
  'queryPayInfoUpgrade 必须传 tradeNo'
)

const requestInfoBuilderBlock = sliceRequired(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  'buildTicketPaymentRequestInfo(',
  'async submitCurrentOrderPayment',
  'buildTicketPaymentRequestInfo'
)

for (const label of [
  'submitCurrentOrderPayment',
  'buildTicketCouponPaymentInfo',
  'buildTicketPaymentRequestInfo',
  'ticketVoucher',
  'couponPaymentList',
  'externalPayment',
  'paymentPrice',
  'verifyCode',
  'storedCardPayments',
  'cardPayment',
  'submittingPayment',
  'paymentSubmitResult',
  'submitTicketPayment',
  'queryPayInfoUpgrade',
  'tradeNo',
  '刷新取票码'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of [
  'contextId',
  'currentPrice',
  'externalPayment',
  'paySdkId: 1057',
  'paymentType: 1057',
  "returnUrl: 'wandafilm/pay/finished'",
  'orderId: String(currentOrder.orderId)',
  "verifyCode: ''"
]) {
  assertIncludes('src/renderer/stores/ticket.ts', requestInfoBuilderBlock, label)
}

assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /submitCurrentOrderPayment\(\)[\s\S]*?await this\.buildTicketCouponPaymentInfo\(currentOrder, account\.ck, account\.userIdentifier\)[\s\S]*?const requestInfo = this\.buildTicketPaymentRequestInfo\(currentOrder, couponPaymentInfo\)[\s\S]*?await submitTicketPayment\([\s\S]*?const externalPayment = asRecord\(requestInfo\.externalPayment\)[\s\S]*?const tradeNo = firstText\([\s\S]*?if \(externalPaymentPrice > 0 && tradeNo\)[\s\S]*?await queryPayInfoUpgrade\([\s\S]*?return[\s\S]*?await queryOrderStatus\([\s\S]*?await this\.refreshTicketCode\(\)/,
  '提交支付后必须按 tradeNo/外部支付金额分支处理'
)

assertIncludes(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  'const couponTypeCodes = selectedCoupons.map((coupon) => firstText(coupon.typeCode, coupon.code, coupon.couponNo))',
  '兑换券必须按旧包优先使用 typeCode'
)

assertBlockContains(
  'src/renderer/views/TicketView.vue',
  ticketView,
  '<el-popconfirm',
  '</el-popconfirm>',
  ['提交支付', '@confirm="ticketStore.submitCurrentOrderPayment"', '真实支付接口'],
  '提交支付按钮必须经确认弹窗触发真实支付接口'
)

for (const label of [
  'payInfoDialogVisible',
  'getPayInfoValue(ticketStore.currentOrderPayInfo)',
  'collectPayInfoFields',
  'handleShowPaymentInfo',
  '支付参数',
  'payment-info-dialog'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertBlockContains(
  'src/renderer/views/TicketView.vue',
  ticketView,
  '<el-button',
  '</el-button>',
  ['handleShowPaymentInfo', 'payInfoFields.length === 0', '支付参数'],
  '外部支付参数必须有手动查看入口'
)

assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, '@click="ticketStore.checkCurrentOrderBeforePayment"')

assertIncludes(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  "const ryUser = userIdentifier.trim() || getDefaultWandaUserId()",
  'X-RY-USER 必须优先使用当前账号 userIdentifier'
)

for (const [file, content] of [
  ['src/renderer/services/seatApi.ts', seatApi],
  ['src/renderer/stores/ticket.ts', ticketStore],
  ['src/renderer/views/TicketView.vue', ticketView]
]) {
  assertNotIncludes(file, content, 'alipay-convert')
  assertNotIncludes(file, content, 'open-auto-order-window')
}

for (const [file, content] of [
  ['src/renderer/services/seatApi.ts', seatApi],
  ['src/renderer/stores/ticket.ts', ticketStore]
]) {
  assertNotIncludes(file, content, 'autoPayment')
}

console.log('提交支付真实链路契约检查通过')
