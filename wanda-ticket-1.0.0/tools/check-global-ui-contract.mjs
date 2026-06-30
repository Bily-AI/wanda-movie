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

function assertNotIncludes(file, source, text) {
  assert.ok(!source.includes(text), `${file} should not include ${text}`)
}

const packageJson = JSON.parse(read('package.json'))
const baseCss = read('src/renderer/styles/base.css')
const accountSidebar = read('src/renderer/components/AccountSidebar.vue')
const exchangeCouponView = read('src/renderer/views/ExchangeCouponView.vue')
const orderHistoryView = read('src/renderer/views/OrderHistoryView.vue')
const memberView = read('src/renderer/views/MemberView.vue')

assert.equal(packageJson.scripts?.['check:global-ui'], 'node tools/check-global-ui-contract.mjs')

for (const marker of [
  '--shadow-panel:',
  '--shadow-panel-strong:',
  '--summary-blue-bg:',
  '--summary-green-bg:',
  '--summary-amber-bg:',
  '--summary-red-bg:',
  '--table-header-bg:',
  '--panel-soft-bg:',
  '.el-dialog {',
  '.el-message-box {',
  '.el-card {',
  '.el-table {',
  '.el-empty {',
  '.side-panel-header {',
  'html.dark [class*=',
  '.mini-list-item:hover'
]) {
  assertIncludes('src/renderer/styles/base.css', baseCss, marker)
}

for (const [file, source] of [
  ['src/renderer/views/ExchangeCouponView.vue', exchangeCouponView],
  ['src/renderer/views/OrderHistoryView.vue', orderHistoryView],
  ['src/renderer/views/MemberView.vue', memberView]
]) {
  for (const marker of ['var(--summary-blue-border)', 'var(--summary-amber-bg)', 'var(--shadow-panel)']) {
    assertIncludes(file, source, marker)
  }
}

for (const text of [
  'class="dialog-full-select"',
  ':global(.legacy-account-import-dialog .el-dialog__body)',
  '.dialog-full-select'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}

for (const text of [
  'class="coupon-filter-search"',
  'class="coupon-filter-name"',
  'class="coupon-filter-category"',
  'class="coupon-gift-tag"',
  'gift-form--spaced',
  'class="cat-name-input"',
  'class="cat-coupon-select"'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeCouponView, text)
}

for (const text of [
  'class="history-search-input"',
  'class="history-status-select"',
  'class="history-date-range"',
  'box-shadow: var(--shadow-panel-strong);',
  '.wanda-official-content'
]) {
  assertIncludes('src/renderer/views/OrderHistoryView.vue', orderHistoryView, text)
}

for (const text of [
  'class="next-grade-name"',
  'class="retry-button"',
  'class="receive-all-button"',
  'class="verify-status-tag"',
  '.signin-section'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, text)
}

for (const [file, source] of [
  ['src/renderer/components/AccountSidebar.vue', accountSidebar],
  ['src/renderer/views/ExchangeCouponView.vue', exchangeCouponView],
  ['src/renderer/views/OrderHistoryView.vue', orderHistoryView],
  ['src/renderer/views/MemberView.vue', memberView]
]) {
  for (const text of [
    'style="width:',
    'style="margin:',
    'style="margin-top:',
    'style="margin-left:',
    'box-shadow: 0 2px 10px',
    'background: #fffaf2',
    'background: #fff8f8',
    'border-color: #bfdbfe',
    '�',
    '锟'
  ]) {
    assertNotIncludes(file, source, text)
  }
}

console.log('Global UI contract passed')
