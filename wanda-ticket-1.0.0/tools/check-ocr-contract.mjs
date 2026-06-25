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
assertMatches(
  'src/main/baiduOcr.ts',
  baiduOcr,
  /requestBaiduOcr\(imageBase64:\s*string,\s*accurate\s*=\s*true\)/,
  'OCR 默认必须走旧版 accurate 端点'
)
assertMatches('src/main/baiduOcr.ts', baiduOcr, /typeof request\.accurate !== 'boolean'/, 'OCR IPC 必须校验 accurate 类型')
assertIncludes('src/main/baiduOcr.ts', baiduOcr, 'data:image\\/(?:png|jpe?g|webp);base64,')

for (const label of ['baiduOcr', 'apiKey: string', 'secretKey: string']) {
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

for (const label of ['百度 OCR 设置', 'settingsStore.baiduOcr.apiKey', 'settingsStore.baiduOcr.secretKey', 'settingsStore.baiduOcrConfigured']) {
  assertIncludes('src/renderer/views/SettingsView.vue', settingsView, label)
}

for (const label of ['parseOcrTicketText', 'ParsedOcrSeat', 'ParsedOcrTicket']) {
  assertIncludes('src/shared/ocrParser.ts', ocrParser, label)
}

for (const label of ['parseOcrTicketText', 'applyOcrTicketText', 'applyParsedOcrTicket', 'findUniqueOptionByText', 'findUniqueCinemaByText']) {
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

const { isLikelyToolUiOcrText, parseOcrTicketText } = await import('../src/shared/ocrParser.ts')

const parsed = parseOcrTicketText(`
  万达影城（安阳文峰万达广场IMAX店）
  影片：给阿姨的情书
  日期 2026-06-18
  时间 14:35
  6排6座 6排9座
  合计 ￥56.00
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

const seatSelectionParsed = parseOcrTicketText(`
  11:32
  万达影城（锦华万达广场IMAX店）
  优惠
  优选  切换场次
  后天6月27日09:00-11:21国语2D
  8排14座  ￥74.8确认选座
`)

if (seatSelectionParsed.movieName === '11:32') {
  throw new Error('选座截图 OCR 不应把状态栏时间识别成影片名')
}

if (seatSelectionParsed.movieName === '优惠' || seatSelectionParsed.movieName === '优选') {
  throw new Error('选座截图 OCR 不应把座位区标签识别成影片名')
}

if (seatSelectionParsed.date !== `${new Date().getFullYear()}-06-27`) {
  throw new Error('选座截图 OCR 未提取相对日期')
}

if (seatSelectionParsed.time !== '09:00') {
  throw new Error('选座截图 OCR 未提取场次时间')
}

if (
  seatSelectionParsed.seats.length !== 1 ||
  seatSelectionParsed.seats[0].rowName !== '8' ||
  seatSelectionParsed.seats[0].columnName !== '14'
) {
  throw new Error('选座截图 OCR 未提取排座信息')
}

const mobileSeatSelectionParsed = parseOcrTicketText(`
  15:09
  万达影城（红牌楼广场店）
  已售 特惠区 ¥35 普通区 ¥35.9 优选区 ¥35.9
  1.3米(不含)以下儿童观看电影免票无座 1个通知
  玩具总动员5 切换场次
  后天 6月27日 15:00-16:42 国语2D
  1排1座
  ¥35 确认选座
`)

if (mobileSeatSelectionParsed.movieName !== '玩具总动员5') {
  throw new Error('手机选座截图 OCR 不应把电影名乱匹配成其他文本')
}

if (mobileSeatSelectionParsed.date !== `${new Date().getFullYear()}-06-27`) {
  throw new Error('手机选座截图 OCR 未提取后天对应日期')
}

if (mobileSeatSelectionParsed.time !== '15:00') {
  throw new Error('手机选座截图 OCR 未提取场次开始时间')
}

if (!mobileSeatSelectionParsed.language.includes('国语2D') && !mobileSeatSelectionParsed.language.includes('2D')) {
  throw new Error('手机选座截图 OCR 未识别到场次版本')
}

if (
  mobileSeatSelectionParsed.seats.length !== 1 ||
  mobileSeatSelectionParsed.seats[0].rowName !== '1' ||
  mobileSeatSelectionParsed.seats[0].columnName !== '1'
) {
  throw new Error('手机选座截图 OCR 未提取 1排1座')
}

const oldProjectSeatScreenshotText = `
  万达快速出票 v2.9.7
  购票查询
  全局订单信息
  万达影城（锦华万达广场IMAX店）
  成都
  抓特务
  2026-06-25
  15:15 - 7号厅-激光厅（2D/中文）
  选座信息
  8排14座
`

if (isLikelyToolUiOcrText(oldProjectSeatScreenshotText)) {
  throw new Error('旧项目票面或选座截图不应被误判成当前工具界面截图')
}

console.log('OCR 契约检查通过')
