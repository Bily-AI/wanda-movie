import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function assertIncludes(file, source, text) {
  assert.ok(source.includes(text), `${file} should include ${text}`)
}

const packageJson = JSON.parse(read('package.json'))
const orderHistoryView = read('src/renderer/views/OrderHistoryView.vue')

assert.equal(
  packageJson.scripts['check:history-order-layout'],
  'node tools/check-history-order-layout-contract.mjs',
  'package.json should expose check:history-order-layout'
)

for (const marker of [
  'class="history-order-page"',
  'class="history-summary-grid"',
  'history-summary-card',
  'class="history-filter-panel panel"',
  'class="history-table-panel panel"',
  'class="history-table-header"',
  'class="history-table-title"',
  'label="影片"',
  'label="影院"',
  'label="场次"',
  'class="order-action-group"',
  'getOrderStatusTagType(row)'
]) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', orderHistoryView, marker)
}

for (const marker of [
  '.history-order-page {\n  min-width: 0;\n  height: 100%;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: 86px auto minmax(0, 1fr);',
  '.history-summary-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));',
  '.history-filter-panel {\n  min-width: 0;\n  display: flex;',
  '.history-table-panel {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;',
  '.history-table-header {\n  min-height: 48px;',
  '.order-table-wrapper {\n  flex: 1;\n  min-height: 0;',
  '.order-pagination {\n  min-height: 54px;'
]) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', orderHistoryView, marker)
}

console.log('History order layout contract passed')
