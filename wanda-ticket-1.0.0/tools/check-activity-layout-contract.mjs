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
  'activity-toolbar-section',
  'activity-toolbar-row',
  'activity-toolbar-title',
  'activity-toolbar-section--proxy',
  'activity-workspace',
  'payableGiftOrderCount',
  'selectedCinemaName',
  'grid-template-rows: 100px auto minmax(0, 1fr);',
  'grid-template-columns: repeat(4, minmax(0, 1fr));',
  'display: flex;\n  flex-wrap: wrap;',
  'activity-toolbar-section--location {\n  flex: 1 1 620px;',
  'activity-toolbar-section--manual {\n  flex: 0 1 350px;',
  'activity-toolbar-section--proxy {\n  flex: 1 1 425px;',
  '.panel.activity-toolbar {\n  flex-direction: row;\n  align-content: center;',
  'grid-template-columns: minmax(0, 1fr) minmax(360px, 0.36fr);'
]) {
  assertIncludes('src/renderer/views/ActivityView.vue', activityView, text)
}

for (const text of [
  'min-width: 980px;',
  'display: flex;\n  flex-direction: column;\n  gap: 16px;',
  'max-height: 720px;',
  'grid-column: 1 / -1;',
  'grid-template-columns: minmax(460px, 1.25fr) minmax(300px, 0.7fr) minmax(420px, 1fr);',
  'proxy-label',
  'activity-toolbar-main',
  'activity-toolbar-extra'
]) {
  assertNotIncludes('src/renderer/views/ActivityView.vue', activityView, text)
}

console.log('活动页面布局契约检查通过')
