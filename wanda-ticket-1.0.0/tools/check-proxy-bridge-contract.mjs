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
const design = read('docs/superpowers/specs/2026-06-22-proxy-bridge-design.md')
const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const mainIndex = read('src/main/index.ts')
const proxy = read('src/main/proxy.ts')
const activityView = read('src/renderer/views/ActivityView.vue')

if (packageJson.scripts?.['check:proxy-bridge'] !== 'node tools/check-proxy-bridge-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:proxy-bridge 脚本')
}

for (const label of ['fetch-proxy', 'proxy-get-used', 'proxy-clear-cache', '不把所有万达请求强制走代理']) {
  assertIncludes('docs/superpowers/specs/2026-06-22-proxy-bridge-design.md', design, label)
}

for (const label of [
  'PROXY_FETCH',
  'PROXY_GET_USED',
  'PROXY_CLEAR_CACHE',
  'ProxyFetchResult',
  'ProxyUsedResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, label)
}

for (const label of ['fetchProxy', 'getUsedProxy', 'clearProxyCache']) {
  assertIncludes('src/preload/index.ts', preload, label)
}

assertIncludes('src/main/index.ts', mainIndex, 'registerProxyHandlers')

for (const label of [
  'readLocalDataFile',
  'proxyApiUrl',
  'parseProxyResponse',
  'proxy_ip',
  'proxy_port',
  'expireAt',
  'lastProxyAddress',
  'PROXY_FETCH',
  'PROXY_GET_USED',
  'PROXY_CLEAR_CACHE'
]) {
  assertIncludes('src/main/proxy.ts', proxy, label)
}

assertMatches(
  'src/main/proxy.ts',
  proxy,
  /cachedProxy[\s\S]*?expireAt > Date\.now\(\)/,
  '代理必须有 60 秒缓存判断'
)

assertMatches(
  'src/main/proxy.ts',
  proxy,
  /split\(':'\)[\s\S]*?readPort/,
  '代理必须支持文本 ip:port'
)

for (const label of ['saveSettings', 'loadActivities', 'handleBuyGift']) {
  assertIncludes('src/renderer/views/ActivityView.vue', activityView, label)
}

console.log('代理桥接契约检查通过')
