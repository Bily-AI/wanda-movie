import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(file, source, text) {
  assert.ok(source.includes(text), `${file} should include ${text}`)
}

function assertNotIncludes(file, source, text) {
  assert.ok(!source.includes(text), `${file} should not include ${text}`)
}

const packageJson = JSON.parse(read('package.json'))
const logView = read('src/renderer/views/LogView.vue')

assert.equal(packageJson.scripts?.['check:log-layout'], 'node tools/check-log-layout-contract.mjs')

for (const text of [
  'log-summary-grid',
  'log-summary-card',
  'log-filter-panel',
  'log-table-panel',
  'log-table-wrapper',
  'logTypeOptions',
  'todayLogCount',
  'grid-template-rows: 100px auto minmax(0, 1fr);',
  'grid-template-columns: repeat(4, minmax(0, 1fr));',
  '搜索账号或详情'
]) {
  assertIncludes('src/renderer/views/LogView.vue', logView, text)
}

for (const text of [
  'style="width: 150px"',
  'style="width: 220px"',
  'border\n      empty-text="暂无日志记录"',
  '.page-container {'
]) {
  assertNotIncludes('src/renderer/views/LogView.vue', logView, text)
}

console.log('日志页面布局契约检查通过')
