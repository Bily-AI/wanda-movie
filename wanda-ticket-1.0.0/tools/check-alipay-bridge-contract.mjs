import { readFileSync } from 'node:fs'

function read(file) {
  return readFileSync(file, 'utf8')
}

function assertIncludes(file, content, marker) {
  if (!content.includes(marker)) {
    throw new Error(`${file} 缺少标记：${marker}`)
  }
}

function assertNotIncludes(file, content, marker) {
  if (content.includes(marker)) {
    throw new Error(`${file} 不应包含标记：${marker}`)
  }
}

const design = read('docs/superpowers/specs/2026-06-22-alipay-bridge-design.md')
const ipc = read('src/shared/ipc.ts')
const mainIndex = read('src/main/index.ts')
const alipay = read('src/main/alipay.ts')
const preload = read('src/preload/index.ts')
const wandaCore = read('src/shared/wandaCore.ts')
const packageJson = read('package.json')

for (const marker of [
  'alipay-clear-session',
  'alipay-sync-device',
  'alipay-convert',
  'appPayParam',
  'mcgw.alipay.com/gateway.do',
  'persist:alipay',
  '不把支付宝请求放进 `wanda-http`'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-22-alipay-bridge-design.md', design, marker)
}

for (const marker of [
  'ALIPAY_CLEAR_SESSION',
  'ALIPAY_SYNC_DEVICE',
  'ALIPAY_CONVERT',
  'AlipayConvertRequest',
  'AlipayConvertResult',
  'AlipayDeviceFingerprint'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, marker)
}

for (const marker of ['registerAlipayHandlers', './alipay']) {
  assertIncludes('src/main/index.ts', mainIndex, marker)
}

for (const marker of [
  'http://mcgw.alipay.com/gateway.do',
  '23h4fhdilenbs741kogue1tl',
  '-----BEGIN PUBLIC KEY-----',
  '2021002145675770',
  'z1x2c3v4v5v6v78v9',
  '8efcf8b134',
  'createCipheriv',
  'publicEncrypt',
  'RSA_PKCS1_PADDING',
  'persist:alipay',
  'session.fromPartition',
  'clearStorageData',
  'buildAlipayUserAgent',
  'executeJavaScript',
  'registerAlipayHandlers'
]) {
  assertIncludes('src/main/alipay.ts', alipay, marker)
}

for (const marker of ['alipayConvert', 'alipaySyncDevice', 'alipayClearSession']) {
  assertIncludes('src/preload/index.ts', preload, marker)
}

for (const marker of ['check:alipay-bridge', 'check-alipay-bridge-contract.mjs']) {
  assertIncludes('package.json', packageJson, marker)
}

assertNotIncludes('src/shared/wandaCore.ts', wandaCore, 'mcgw.alipay.com')
assertNotIncludes('src/main/wandaHttp.ts', read('src/main/wandaHttp.ts'), 'ALIPAY_GATEWAY_URL')

console.log('支付宝桥接契约检查通过')
