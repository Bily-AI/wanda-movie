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
const memberView = read('src/renderer/views/MemberView.vue')

assert.equal(packageJson.scripts?.['check:member-layout'], 'node tools/check-member-layout-contract.mjs')

for (const text of [
  'member-summary-grid',
  'member-summary-card',
  'totalClaimableMemberRights',
  'wplusStatusText',
  'vip-subtab-list',
  'vip-subtab-meta',
  'grid-template-rows: auto auto minmax(0, 1fr);',
  'grid-template-columns: repeat(4, minmax(0, 1fr));',
  'grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));',
  '刷新当前'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, text)
}

for (const text of [
  'border-bottom: 2px solid var(--border-light);',
  '.vip-panel--rtime .vip-info-card {\n  position: sticky;',
  '.vip-exchange-card {\n  position: sticky;'
]) {
  assertNotIncludes('src/renderer/views/MemberView.vue', memberView, text)
}

console.log('会员页面布局契约检查通过')
