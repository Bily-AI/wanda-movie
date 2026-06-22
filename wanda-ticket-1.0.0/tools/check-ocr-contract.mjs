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
const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const env = read('src/renderer/env.d.ts')
const mainIndex = read('src/main/index.ts')
const localData = read('src/shared/localData.ts')
const settingsStore = read('src/renderer/stores/settings.ts')
const settingsView = read('src/renderer/views/SettingsView.vue')
const ticketView = read('src/renderer/views/TicketView.vue')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ocrParser = read('src/shared/ocrParser.ts')

if (packageJson.scripts?.['check:ocr'] !== 'node --experimental-strip-types tools/check-ocr-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:ocr 脚本')
}

for (const label of [
  'CLIPBOARD_READ_TEXT',
  'CLIPBOARD_READ_IMAGE',
  'OCR_RECOGNIZE',
  'read-clipboard-text',
  'read-clipboard-image',
  'ocr-recognize',
  'BaiduOcrRequest',
  'BaiduOcrResult',
  'ClipboardImageResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, label)
}

for (const label of ['readClipboardText', 'readClipboardImage', 'ocrRecognize']) {
  assertIncludes('src/preload/index.ts', preload, label)
  assertIncludes('src/renderer/env.d.ts', env, label)
}

for (const label of ['registerBaiduOcrHandlers', './baiduOcr']) {
  assertIncludes('src/main/index.ts', mainIndex, label)
}

const baiduOcr = read('src/main/baiduOcr.ts')

for (const label of [
  'https://aip.baidubce.com/oauth/2.0/token',
  'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic',
  'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate',
  'clipboard.readText',
  'clipboard.readImage',
  'image.toDataURL',
  'BAIDU_OCR_API_KEY',
  'BAIDU_OCR_SECRET_KEY',
  "readLocalDataFile('settings')",
  'settings.baiduOcr.apiKey',
  'settings.baiduOcr.secretKey',
  'validateBaiduOcrRequest',
  'MAX_OCR_IMAGE_BASE64_LENGTH',
  'accessTokenCache'
]) {
  assertIncludes('src/main/baiduOcr.ts', baiduOcr, label)
}

assertNotIncludes('src/main/baiduOcr.ts', baiduOcr, 'VITE_BAIDU_OCR')

assertMatches(
  'src/main/baiduOcr.ts',
  baiduOcr,
  /ipcMain\.handle\(IPC_CHANNELS\.OCR_RECOGNIZE[\s\S]*?recognizeBaiduOcr/,
  'OCR IPC 必须调用百度 OCR 服务'
)
assertMatches('src/main/baiduOcr.ts', baiduOcr, /requestBaiduOcr\(imageBase64:\s*string,\s*accurate\s*=\s*true\)/, 'OCR 默认必须走旧版 accurate 端点')
assertMatches('src/main/baiduOcr.ts', baiduOcr, /typeof request\.accurate !== 'boolean'/, 'OCR IPC 必须校验 accurate 类型')
assertIncludes('src/main/baiduOcr.ts', baiduOcr, "data:image\\/(?:png|jpe?g|webp);base64,")

for (const label of [
  'baiduOcr',
  'apiKey: string',
  'secretKey: string'
]) {
  assertIncludes('src/shared/localData.ts', localData, label)
}

for (const label of [
  'baiduOcr: structuredClone(DEFAULT_LOCAL_DATA.settings.baiduOcr)',
  'baiduOcrConfigured',
  'this.baiduOcr = settingsResult.data.baiduOcr',
  'baiduOcr: this.baiduOcr'
]) {
  assertIncludes('src/renderer/stores/settings.ts', settingsStore, label)
}

for (const label of [
  '百度 OCR 设置',
  'settingsStore.baiduOcr.apiKey',
  'settingsStore.baiduOcr.secretKey',
  'settingsStore.baiduOcrConfigured'
]) {
  assertIncludes('src/renderer/views/SettingsView.vue', settingsView, label)
}

for (const label of [
  'parseOcrTicketText',
  'ParsedOcrSeat',
  'ParsedOcrTicket'
]) {
  assertIncludes('src/shared/ocrParser.ts', ocrParser, label)
}

for (const label of [
  'parseOcrTicketText',
  'applyOcrTicketText',
  'applyParsedOcrTicket',
  'findUniqueOptionByText',
  'findUniqueCinemaByText'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

assertNotIncludes(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  'this.cinemaRecords.find((item) => fuzzyIncludes(item.name, parsed.cinemaName))'
)

for (const label of [
  'window.wandaApp?.readClipboardImage',
  'window.wandaApp?.ocrRecognize',
  'window.wandaApp?.readClipboardText',
  'ticketStore.applyOcrTicketText'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

const { parseOcrTicketText } = await import('../src/shared/ocrParser.ts')

const parsed = parseOcrTicketText(`
  万达影城（安阳文峰万达广场IMAX店）
  影片：给阿姨的情书
  日期 2026-06-18
  时间 14:35
  6排8座 6排9座
  合计 ￥76.00
`)

if (parsed.cinemaName !== '万达影城（安阳文峰万达广场IMAX店）') {
  throw new Error('OCR 解析未提取影院名称')
}

if (parsed.movieName !== '给阿姨的情书') {
  throw new Error('OCR 解析未提取影片名称')
}

if (parsed.date !== '2026-06-18') {
  throw new Error('OCR 解析未规范化日期')
}

if (parsed.time !== '14:35') {
  throw new Error('OCR 解析未提取场次时间')
}

if (parsed.seats.length !== 2 || parsed.seats[0].rowName !== '6' || parsed.seats[1].columnName !== '9') {
  throw new Error('OCR 解析未提取多座位')
}

console.log('OCR 契约检查通过')
