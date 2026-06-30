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
const activityView = read('src/renderer/views/ActivityView.vue')

assert.equal(packageJson.scripts?.['check:activity-layout'], 'node tools/check-activity-layout-contract.mjs')

for (const text of [
  'activity-summary-grid',
  'activity-summary-card',
  'activity-toolbar-main',
  'activity-toolbar-extra',
  'activity-workspace',
  'payableGiftOrderCount',
  'selectedCinemaName',
  'grid-template-rows: 100px auto minmax(0, 1fr);',
  'grid-template-columns: repeat(4, minmax(0, 1fr));',
  'grid-template-columns: minmax(0, 1fr) minmax(360px, 0.36fr);'
]) {
  assertIncludes('src/renderer/views/ActivityView.vue', activityView, text)
}

for (const text of [
  'min-width: 980px;',
  'display: flex;\n  flex-direction: column;\n  gap: 16px;',
  'max-height: 720px;'
]) {
  assertNotIncludes('src/renderer/views/ActivityView.vue', activityView, text)
}

console.log('活动页面布局契约检查通过')
