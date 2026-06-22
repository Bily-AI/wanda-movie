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

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const ordersView = read('src/renderer/views/OrderHistoryView.vue')
const ordersStore = read('src/renderer/stores/orders.ts')
const seatApi = read('src/renderer/services/seatApi.ts')

if (packageJson.scripts?.['check:history-ticket-code'] !== 'node tools/check-history-ticket-code-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:history-ticket-code 脚本')
}

for (const label of [
  'queryOrderByUserId',
  'currentPayInfo',
  'ticketCodes',
  'qrCodes',
  'hasVisibleOrderPayInfo'
]) {
  assertIncludes('src/renderer/stores/orders.ts', ordersStore, label)
}

for (const label of ['electronicCode', 'electronicQR', 'extractPayInfo']) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}

for (const label of [
  'historyTicketCodePanelSelector',
  'history-ticket-code-panel',
  'history-ticket-code-dialog',
  'handleCaptureHistoryTicketCode',
  'handleCopyHistoryTicketCode',
  'window.wandaApp?.captureElement',
  'window.wandaApp?.copyElementToClipboard',
  'isImageQrCode',
  'formatQrImage',
  'canCaptureHistoryTicketCode',
  ':disabled="!canCaptureHistoryTicketCode"',
  'ordersStore.currentPayInfo?.ticketCodes',
  'ordersStore.currentPayInfo?.qrCodes'
]) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', ordersView, label)
}

assertMatches(
  'src/renderer/views/OrderHistoryView.vue',
  ordersView,
  /handleQueryPayInfo\(order[\s\S]*?ordersStore\.queryOrderPayInfo\(order\)[\s\S]*?payInfoDialogVisible\.value = true/,
  '历史订单详情必须由真实查询结果打开'
)

assertMatches(
  'src/renderer/views/OrderHistoryView.vue',
  ordersView,
  /<img v-if="isImageQrCode\(qrCode\)"[\s\S]*?:src="formatQrImage\(qrCode\)"/,
  '历史订单二维码必须支持图片渲染'
)

for (const label of ['iVBORw0KGgo', '\\/9j\\/', 'R0lGOD', 'UklGR']) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', ordersView, label)
}

console.log('历史订单取票码契约检查通过')
