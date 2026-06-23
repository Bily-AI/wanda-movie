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

const packageJson = JSON.parse(read('package.json'))
const wandaRequest = read('src/renderer/services/wandaRequest.ts')
const wandaHttp = read('src/main/wandaHttp.ts')

if (packageJson.scripts?.['check:wanda-diagnostics'] !== 'node tools/check-wanda-diagnostics-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:wanda-diagnostics 脚本')
}

for (const label of [
  'formatWandaTransportError',
  'extractWandaRequestLabel',
  'sanitizeWandaErrorMessage',
  '万达 POST 请求失败',
  '万达 GET 请求失败',
  '万达登录 POST 请求失败',
  '万达影院 GET 请求失败'
]) {
  assertIncludes('src/renderer/services/wandaRequest.ts', wandaRequest, label)
}

for (const label of ['toCloneableWandaData', 'toCloneableWandaData(response.data)']) {
  assertIncludes('src/main/wandaHttp.ts', wandaHttp, label)
}

const formatterBlock = sliceRequired(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  'function formatWandaTransportError',
  '}\n',
  'formatWandaTransportError'
)

for (const label of ['method', 'host', 'path', 'rawMessage', 'fallbackMessage', 'sanitizeWandaErrorMessage(rawMessage)']) {
  assertIncludes('src/renderer/services/wandaRequest.ts', formatterBlock, label)
}

const labelBlock = sliceRequired(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  'function extractWandaRequestLabel',
  '}\n',
  'extractWandaRequestLabel'
)

for (const label of ['url.hostname', 'url.pathname', "path.split('?')[0]"]) {
  assertIncludes('src/renderer/services/wandaRequest.ts', labelBlock, label)
}

if (labelBlock.includes('url.search')) {
  throw new Error('src/renderer/services/wandaRequest.ts 接口诊断标签不应包含 query 参数')
}

const sanitizeBlock = sliceRequired(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  'function sanitizeWandaErrorMessage',
  'function formatWandaTransportError',
  'sanitizeWandaErrorMessage'
)

for (const label of ['X-RY-TOKEN', 'mobilePhone', 'requestInfo', 'payInfo', 'tradeNo', '<已隐藏>']) {
  assertIncludes('src/renderer/services/wandaRequest.ts', sanitizeBlock, label)
}

for (const label of ['wandaLoginPost', 'wandaCinemaGet', 'wandaGet', 'wandaGetWithHeaders', 'wandaPost', 'wandaPostForm']) {
  assertMatches(
    'src/renderer/services/wandaRequest.ts',
    wandaRequest,
    new RegExp(`${label}[\\s\\S]*?formatWandaTransportError\\(`),
    `${label} 必须使用统一的万达传输错误提示`
  )
}

assertMatches(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  /function formatWandaTransportError[\s\S]*?const sanitizedMessage = sanitizeWandaErrorMessage\(rawMessage\)/,
  '传输错误提示必须对原始错误脱敏'
)

assertMatches(
  'src/renderer/services/wandaRequest.ts',
  wandaRequest,
  /return \`\$\{fallbackMessage\}：\$\{method\} \$\{requestLabel\}\$\{sanitizedMessage \? `，\$\{sanitizedMessage\}` : ''\}\`/,
  '传输错误提示必须包含方法、接口和脱敏后的原始错误'
)

console.log('万达接口诊断契约检查通过')
