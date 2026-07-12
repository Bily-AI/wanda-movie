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
const storedCardView = read('src/renderer/views/StoredValueCardView.vue')

assert.equal(
  packageJson.scripts['check:stored-card-layout'],
  'node tools/check-stored-card-layout-contract.mjs',
  'package.json should expose check:stored-card-layout'
)

for (const marker of [
  'class="stored-card-page"',
  'class="stored-card-summary-grid"',
  'stored-summary-card',
  'class="stored-card-action-panel panel"',
  'class="stored-card-content-panel panel"',
  'class="stored-card-panel-header"',
  'label="卡名称"',
  'label="卡号"',
  'label="分类"',
  'class="stored-card-view-toggle"',
  'availableCardCount'
]) {
  assertIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, marker)
}

for (const marker of [
  '.stored-card-page {\n  min-width: 0;\n  height: 100%;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: 100px auto minmax(0, 1fr);',
  '.panel {\n  min-width: 0;',
  '.stored-card-summary-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));',
  '.stored-card-action-panel {\n  min-width: 0;',
  '.stored-card-content-panel {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;',
  '.stored-card-table-wrapper {\n  flex: 1;\n  min-height: 0;',
  '.stored-card-grid-panel {\n  flex: 1;\n  min-height: 0;'
]) {
  assertIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, marker)
}

console.log('Stored card layout contract passed')
