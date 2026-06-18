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

const packageJson = read('package.json')
const ipc = read('src/shared/ipc.ts')
const core = read('src/shared/wandaCore.ts')

assertIncludes('package.json', packageJson, '"check:phase3"')
assertIncludes('src/shared/ipc.ts', ipc, 'Record<string, unknown> | string')
assertIncludes('src/shared/wandaCore.ts', core, 'ORDER_CREATE_TICKET')
assertIncludes('src/shared/wandaCore.ts', core, '/order/create_order.api')
assertIncludes('src/shared/wandaCore.ts', core, "typeof request.body !== 'string'")

console.log('第三阶段请求边界契约检查通过')
