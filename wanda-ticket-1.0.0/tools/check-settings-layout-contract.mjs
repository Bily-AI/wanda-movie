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
const settingsView = read('src/renderer/views/SettingsView.vue')

assert.equal(packageJson.scripts?.['check:settings-layout'], 'node tools/check-settings-layout-contract.mjs')

for (const text of [
  'settings-summary-grid',
  'settings-summary-card',
  'settings-workbench',
  'settings-column settings-column--main',
  'settings-column settings-column--side',
  'settings-card settings-card--system',
  'settings-card settings-card--network',
  'autoPaymentStatusText',
  'proxyStatusText',
  'grid-template-rows: 72px minmax(0, 1fr);',
  'grid-template-columns: repeat(4, minmax(0, 1fr));',
  'grid-template-columns: minmax(0, 1fr) minmax(360px, 480px);'
]) {
  assertIncludes('src/renderer/views/SettingsView.vue', settingsView, text)
}

for (const text of [
  'style="height',
  '.settings-header',
  '.settings-title',
  '.settings-subtitle',
  'height: 112px !important',
  'height: 146px !important',
  'height: 165px !important',
  'overflow: hidden !important'
]) {
  assertNotIncludes('src/renderer/views/SettingsView.vue', settingsView, text)
}

console.log('设置页面布局契约检查通过')
