import { readFileSync } from 'node:fs'

function read(file) {
  return readFileSync(file, 'utf8')
}

function assertIncludes(file, content, marker) {
  if (!content.includes(marker)) {
    throw new Error(`${file} 缺少标记：${marker}`)
  }
}

const service = read('src/renderer/services/alipayBridge.ts')
const preload = read('src/preload/index.ts')
const rendererEnv = read('src/renderer/env.d.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const storedCardView = read('src/renderer/views/StoredValueCardView.vue')
const activityView = read('src/renderer/views/ActivityView.vue')
const settingsView = read('src/renderer/views/SettingsView.vue')
const packageJson = read('package.json')

for (const marker of [
  'extractAppPayParam',
  'openAlipayPayment',
  'buildAlipayDeviceFingerprint',
  'window.wandaApp',
  'alipayConvert',
  'appPayParam'
]) {
  assertIncludes('src/renderer/services/alipayBridge.ts', service, marker)
}

for (const marker of ['alipayConvert', 'AlipayConvertRequest']) {
  assertIncludes('src/preload/index.ts', preload, marker)
}

for (const marker of ['alipayConvert', 'AlipayConvertRequest', 'AlipayConvertResult']) {
  assertIncludes('src/renderer/env.d.ts', rendererEnv, marker)
}

for (const [file, content] of [
  ['src/renderer/views/TicketView.vue', ticketView],
  ['src/renderer/views/StoredValueCardView.vue', storedCardView],
  ['src/renderer/views/ActivityView.vue', activityView]
]) {
  for (const marker of ['openAlipayPayment', '打开支付宝支付', 'settingsStore.autoPayment', 'settingsStore.requestParams']) {
    assertIncludes(file, content, marker)
  }
}

for (const marker of [
  'handleRefreshAlipayDevice',
  'buildAlipayDeviceFingerprint',
  'wandaApp.alipaySyncDevice',
  'wandaApp.alipayClearSession',
  'refreshingAlipayDevice'
]) {
  assertIncludes('src/renderer/views/SettingsView.vue', settingsView, marker)
}

for (const marker of ['check:alipay-ui', 'check-alipay-ui-contract.mjs']) {
  assertIncludes('package.json', packageJson, marker)
}

console.log('支付宝支付入口契约检查通过')
