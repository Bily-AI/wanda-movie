import { readFileSync } from 'node:fs'

function read(file) {
  return readFileSync(file, 'utf8')
}

function assertIncludes(file, content, marker) {
  if (!content.includes(marker)) {
    throw new Error(`${file} 缺少标记：${marker}`)
  }
}

const ipc = read('src/shared/ipc.ts')
const mainIndex = read('src/main/index.ts')
const preload = read('src/preload/index.ts')
const wandaCore = read('src/shared/wandaCore.ts')
const router = read('src/renderer/router/index.ts')
const app = read('src/renderer/App.vue')
const autoOrderView = read('src/renderer/views/AutoOrderView.vue')
const packageJson = read('package.json')

for (const marker of [
  'open-auto-order-window',
  'auto-order-process-ticket',
  'auto-order-report-result',
  'auto-order:process-ticket',
  'auto-order:process-result',
  'AutoOrderTicketRequest',
  'AutoOrderTicketResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, marker)
}

for (const marker of [
  'createAutoOrderWindow',
  "loadRenderer(window, '/auto-order')",
  'AUTO_ORDER_PROCESS_TICKET',
  'AUTO_ORDER_REPORT_RESULT'
]) {
  assertIncludes('src/main/index.ts', mainIndex, marker)
}

for (const marker of [
  'openAutoOrderWindow',
  'sendAutoOrderTicket',
  'reportAutoOrderResult',
  'onAutoOrderProcessTicket',
  'onAutoOrderProcessResult',
  "exposeInMainWorld('api'"
]) {
  assertIncludes('src/preload/index.ts', preload, marker)
}

for (const marker of [
  'AUTO_ORDER_HOSTS',
  'mhdyp.com',
  'hahapiao.cn',
  '/api/movie-server/movie/get/order/list',
  '/api/Synchro/getOrderList'
]) {
  assertIncludes('src/shared/wandaCore.ts', wandaCore, marker)
}

for (const marker of ['AutoOrderView', '/auto-order']) {
  assertIncludes('src/renderer/router/index.ts', router, marker)
}

for (const marker of [
  '自动接单',
  'onAutoOrderProcessTicket',
  'processAutoOrderTicket',
  'reportAutoOrderResult',
  'openAlipayPayment'
]) {
  assertIncludes('src/renderer/App.vue', app, marker)
}

for (const marker of [
  'MAHUA_BASE_URL',
  'HAHA_BASE_URL',
  '/bidding/order/list',
  '/get/order/confirm',
  '/Synchro/orderConfirm',
  'sendAutoOrderTicket'
]) {
  assertIncludes('src/renderer/views/AutoOrderView.vue', autoOrderView, marker)
}

for (const marker of ['check:auto-order', 'check-auto-order-contract.mjs']) {
  assertIncludes('package.json', packageJson, marker)
}

console.log('自动接单契约检查通过')
