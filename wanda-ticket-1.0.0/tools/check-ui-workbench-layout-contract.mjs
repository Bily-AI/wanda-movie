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

const app = read('src/renderer/App.vue')
const ticketView = read('src/renderer/views/TicketView.vue')
const accountSidebar = read('src/renderer/components/AccountSidebar.vue')
const paymentPanel = read('src/renderer/components/PaymentPanel.vue')
const payCardList = read('src/renderer/components/PayCardList.vue')
const couponList = read('src/renderer/components/CouponList.vue')
const selectedSeatList = read('src/renderer/components/SelectedSeatList.vue')

for (const marker of [
  'class="workspace-layout"',
  'grid-template-columns: 340px minmax(0, 1fr)',
  'class="workspace-content"'
]) {
  assertIncludes('src/renderer/App.vue', app, marker)
}

for (const marker of [
  'class="ticket-workbench"',
  'class="ticket-status-grid"',
  'status-tile',
  'ticket-context-column',
  'context-card',
  'context-panel',
  'class="seat-toolbar"',
  'bottom-actions'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, marker)
}

for (const marker of [
  'query-summary-strip',
  'querySnapshot',
  'findOptionLabel'
]) {
  assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, marker)
}

for (const marker of [
  '.ticket-context-column {\n  min-width: 0;\n  padding-right: 8px;\n  overflow-y: auto;\n  scrollbar-gutter: stable;\n  overscroll-behavior: contain;\n}',
  '.side-panel {\n  min-width: 0;\n  min-height: 86px;\n  overflow: hidden;\n}',
  '.order-summary {\n  max-height: 224px;\n  overflow: auto;'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, marker)
}

for (const marker of [
  '.side-panel-body {\n  min-width: 0;\n  overflow: hidden;',
  '.side-panel-header > span {\n  min-width: 0;',
  '.side-line :deep(.el-select) {\n  min-width: 0;\n}'
]) {
  assertIncludes('src/renderer/components/PaymentPanel.vue', paymentPanel, marker)
}

for (const [file, source] of [
  ['src/renderer/components/PayCardList.vue', payCardList],
  ['src/renderer/components/CouponList.vue', couponList]
]) {
  for (const marker of [
    '.side-panel-body {\n  min-width: 0;',
    '.side-panel-header > span:first-child {\n  min-width: 0;',
    '.side-panel-count {\n  min-width: 0;',
    '.mini-list {\n  min-width: 0;',
    '.mini-list-checkbox {\n  min-width: 0;\n  width: 100%;\n  display: flex;',
    '.mini-list-checkbox :deep(.el-checkbox__input) {\n  flex: 0 0 auto;\n}',
    '.mini-list-checkbox :deep(.el-checkbox__label) {\n  min-width: 0;\n  width: auto;\n  flex: 1 1 auto;'
  ]) {
    assertIncludes(file, source, marker)
  }
}

for (const marker of [
  'function formatCouponExpiryMeta(...values: unknown[]): string',
  'return `${year}年${month}月${day}日 过期`',
  'formatCouponExpiryMeta(',
  'raw.validityDateShowMsg',
  'grid-template-columns: minmax(0, 1fr) max-content;',
  'font-size: 12px;'
]) {
  assertIncludes('src/renderer/components/CouponList.vue / TicketView coupon expiry layout', `${ticketView}\n${couponList}`, marker)
}

for (const marker of [
  '.selected-seat-list {\n  min-width: 0;\n  overflow: hidden;',
  '.seat-chip-list {\n  max-height: 72px;\n  overflow: auto;',
  '.seat-summary {\n  flex-wrap: wrap;',
  '.seat-summary-main {\n  flex: 1 1 152px;',
  '.seat-summary-calc {\n  flex: 0 0 auto;',
  'class="seat-summary-times">×</span>',
  '.seat-summary-times {'
]) {
  assertIncludes('src/renderer/components/SelectedSeatList.vue', selectedSeatList, marker)
}

for (const marker of [
  'account-current-card',
  'account-list-card',
  'account-pool-card',
  'activeAccountTab',
  'account-tabs',
  'account-tab-button',
  'account-tab-panel',
  'account-tab-count',
  'account-row',
  'account-login-card',
  'hasNoAccounts',
  'loginCardExpanded',
  'login-card-actions',
  'login-toggle-button',
  'login-panel-body',
  'login-compact-row',
  'account-management-actions'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, marker)
}

for (const marker of [
  'const hasNoAccounts = computed(() => accountsStore.accounts.length === 0)',
  'v-if="!hasNoAccounts"',
  'loginCardExpanded || hasNoAccounts',
  'type="primary"'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, marker)
}

for (const marker of [
  'grid-template-rows: minmax(480px, 1fr) auto',
  'grid-template-columns: repeat(3, minmax(0, 1fr))',
  'scrollbar-width: thin'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, marker)
}

console.log('UI workbench layout contract passed')
