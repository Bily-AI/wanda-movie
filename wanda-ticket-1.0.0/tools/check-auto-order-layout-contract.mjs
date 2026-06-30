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
const autoOrderView = read('src/renderer/views/AutoOrderView.vue')

assert.equal(
  packageJson.scripts['check:auto-order-layout'],
  'node tools/check-auto-order-layout-contract.mjs',
  'package.json should expose check:auto-order-layout'
)

for (const marker of [
  'class="auto-order-workbench"',
  'class="auto-status-grid"',
  'auto-status-card',
  'class="auto-config-panel panel"',
  'class="auto-control-panel panel"',
  'class="auto-board"',
  'class="auto-order-table-panel panel bidding-panel"',
  'class="auto-list-grid"',
  'class="auto-table-header"',
  'class="auto-order-primary-cell"',
  'class="auto-order-primary-title"',
  'class="auto-order-primary-meta"',
  'class="auto-control-info"',
  'enabledPlatforms.length'
]) {
  assertIncludes('src/renderer/views/AutoOrderView.vue', autoOrderView, marker)
}

for (const marker of [
  '.auto-order-workbench {\n  min-width: 0;\n  height: 100%;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: 86px auto auto minmax(0, 1fr);',
  '.auto-status-grid {\n  display: grid;\n  grid-template-columns: repeat(5, minmax(0, 1fr));',
  '.auto-config-panel {\n  min-width: 0;',
  '.auto-control-panel {\n  min-width: 0;',
  '.auto-board {\n  min-height: 0;\n  display: grid;\n  grid-template-rows: minmax(160px, 0.82fr) minmax(220px, 1fr);',
  '.auto-list-grid {\n  min-height: 0;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));',
  '.auto-order-table-panel {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;',
  '.auto-order-primary-title {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;'
]) {
  assertIncludes('src/renderer/views/AutoOrderView.vue', autoOrderView, marker)
}

console.log('Auto order layout contract passed')
