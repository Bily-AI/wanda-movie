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

function assertNotMatches(file, content, pattern, label) {
  if (pattern.test(content)) {
    throw new Error(`${file} 不应包含 ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const env = read('src/renderer/env.d.ts')
const mainIndex = read('src/main/index.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const ticketStore = read('src/renderer/stores/ticket.ts')

if (packageJson.scripts?.['check:ticket-code'] !== 'node tools/check-ticket-code-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:ticket-code 脚本')
}

for (const label of [
  'ELEMENT_CAPTURE',
  'ELEMENT_COPY_TO_CLIPBOARD',
  'capture-element',
  'copy-element-to-clipboard',
  'ElementCaptureRequest',
  'ElementCaptureResult',
  'ElementCopyResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, label)
}

for (const label of ['captureElement', 'copyElementToClipboard', 'ElementCaptureRequest']) {
  assertIncludes('src/preload/index.ts', preload, label)
  assertIncludes('src/renderer/env.d.ts', env, label)
}

for (const label of ['registerElementCaptureHandlers', './elementCapture']) {
  assertIncludes('src/main/index.ts', mainIndex, label)
}

const elementCapture = read('src/main/elementCapture.ts')

for (const label of [
  'capturePage',
  'clipboard.writeImage',
  'executeJavaScript',
  'document.querySelector',
  'getBoundingClientRect',
  'ELEMENT_CAPTURE',
  'ELEMENT_COPY_TO_CLIPBOARD'
]) {
  assertIncludes('src/main/elementCapture.ts', elementCapture, label)
}

assertMatches(
  'src/main/elementCapture.ts',
  elementCapture,
  /ipcMain\.handle\(IPC_CHANNELS\.ELEMENT_CAPTURE[\s\S]*?captureElement/,
  'capture-element 必须调用截图函数'
)

assertMatches(
  'src/main/elementCapture.ts',
  elementCapture,
  /ipcMain\.handle\(IPC_CHANNELS\.ELEMENT_COPY_TO_CLIPBOARD[\s\S]*?copyElementToClipboard/,
  'copy-element-to-clipboard 必须调用复制函数'
)

assertMatches(
  'src/main/elementCapture.ts',
  elementCapture,
  /copyElementToClipboard[\s\S]*?captureElementImage\(event, request\)/,
  '复制截图必须只获取图片'
)

assertNotMatches(
  'src/main/elementCapture.ts',
  elementCapture,
  /const result = await captureElement\(event, request\)/,
  '复制截图复用会落盘的保存函数'
)

for (const label of [
  'ticketCodeDialogVisible',
  'ticketCodePanelSelector',
  'handleRefreshTicketCode',
  'handleCaptureTicketCode',
  'handleCopyTicketCode',
  'ticket-code-dialog',
  'ticket-code-panel',
  'ticketStore.currentOrderPayInfo?.ticketCodes',
  'ticketStore.currentOrderPayInfo?.qrCodes',
  'window.wandaApp?.captureElement',
  'window.wandaApp?.copyElementToClipboard'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

for (const label of ['refreshTicketCode', 'currentOrderPayInfo']) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /refreshTicketCode\(\)[\s\S]*?this\.currentOrderPayInfo = null[\s\S]*?queryOrderByUserId/,
  '刷新取票码前必须清空上一次取票码'
)

console.log('取票码截图复制契约检查通过')
