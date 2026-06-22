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
const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const env = read('src/renderer/env.d.ts')
const localData = read('src/shared/localData.ts')
const settingsStore = read('src/renderer/stores/settings.ts')
const settingsView = read('src/renderer/views/SettingsView.vue')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const baiduOcr = read('src/main/baiduOcr.ts')

if (packageJson.scripts?.['check:ai-ocr'] !== 'node tools/check-ai-ocr-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:ai-ocr 脚本')
}

for (const label of [
  'AI_OCR_PARSE',
  'ai-parse-ocr',
  'AiOcrParseRequest',
  'AiOcrParsedTicket',
  'AiOcrParseResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, label)
}

for (const label of ['aiParseOcr', 'AiOcrParseRequest', 'AiOcrParseResult']) {
  assertIncludes('src/preload/index.ts', preload, label)
  assertIncludes('src/renderer/env.d.ts', env, label)
}

for (const label of [
  'aiOcr',
  'enabled: boolean',
  'baseUrl: string',
  'model: string',
  'apiKey: string',
  "baseUrl: 'https://api.deepseek.com/chat/completions'",
  "model: 'deepseek-chat'"
]) {
  assertIncludes('src/shared/localData.ts', localData, label)
}

for (const label of [
  'aiOcr: structuredClone(DEFAULT_LOCAL_DATA.settings.aiOcr)',
  'aiOcrConfigured',
  'this.aiOcr = settingsResult.data.aiOcr',
  'aiOcr: this.aiOcr'
]) {
  assertIncludes('src/renderer/stores/settings.ts', settingsStore, label)
}

for (const label of [
  'AI OCR 解析设置',
  'settingsStore.aiOcr.enabled',
  'settingsStore.aiOcr.baseUrl',
  'settingsStore.aiOcr.model',
  'settingsStore.aiOcr.apiKey',
  'settingsStore.aiOcrConfigured'
]) {
  assertIncludes('src/renderer/views/SettingsView.vue', settingsView, label)
}

for (const label of [
  'https://api.deepseek.com/chat/completions',
  'settings.aiOcr.enabled',
  'settings.aiOcr.apiKey',
  'settings.aiOcr.baseUrl',
  'settings.aiOcr.model',
  'AI_OCR_API_KEY',
  'DEEPSEEK_API_KEY',
  'Authorization',
  'Bearer',
  'normalizeAiOcrTicket',
  'extractJsonObject',
  'parseAiOcrTicketText'
]) {
  assertIncludes('src/main/baiduOcr.ts', baiduOcr, label)
}

assertMatches(
  'src/main/baiduOcr.ts',
  baiduOcr,
  /ipcMain\.handle\(IPC_CHANNELS\.AI_OCR_PARSE[\s\S]*?parseAiOcrTicketText/,
  'AI OCR IPC 必须调用 AI 解析服务'
)

for (const label of [
  'needsAiOcrFallback',
  'mergeAiOcrParsedTicket',
  'window.wandaApp?.aiParseOcr',
  'applyOcrTicketText'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of ['ticketStore.applyOcrTicketText']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

console.log('AI OCR 兜底契约检查通过')
