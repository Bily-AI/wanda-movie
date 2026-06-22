import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function assertIncludes(file, content, label) {
  if (!content.includes(label)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

function assertNotIncludes(file, content, label) {
  if (content.includes(label)) {
    throw new Error(`${file} 不应包含 ${label}`)
  }
}

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const ticketView = read('src/renderer/views/TicketView.vue')
const storedCardView = read('src/renderer/views/StoredValueCardView.vue')
const couponView = read('src/renderer/views/ExchangeCouponView.vue')
const memberView = read('src/renderer/views/MemberView.vue')
const activityView = read('src/renderer/views/ActivityView.vue')
const logView = read('src/renderer/views/LogView.vue')
const logsStore = read('src/renderer/stores/logs.ts')
const ticketStore = read('src/renderer/stores/ticket.ts')
const accountsStore = read('src/renderer/stores/accounts.ts')
const featureApi = read('src/renderer/services/featureApi.ts')

if (packageJson.scripts?.['check:flow'] !== 'node tools/check-flow-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:flow 脚本')
}

for (const [file, content] of [
  ['src/renderer/views/StoredValueCardView.vue', storedCardView],
  ['src/renderer/views/ExchangeCouponView.vue', couponView]
]) {
  assertNotIncludes(file, content, ':data="[]"')
}

for (const label of [
  'fetchStoredCards',
  'fetchMemberCoupons',
  'bindMemberCoupon',
  'fetchMemberGradeEquityList',
  'fetchWPlusDetail',
  'fetchActivityList',
  'fetchActivityDetail'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

for (const label of [
  '@click="loadCards"',
  'cardRows',
  'cardsMessage'
]) {
  assertIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, label)
}

for (const label of [
  '@click="loadCoupons"',
  '@click="handleBindCoupon"',
  'couponRows',
  'couponMessage'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', couponView, label)
}

for (const label of [
  'v-model="activeTab"',
  '@click="loadMemberData"',
  'memberMessage',
  'gradeRows',
  'wplusRows'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

for (const label of [
  '@click="loadActivities"',
  '@click="loadActivityDetail',
  'activityRows',
  'activityMessage'
]) {
  assertIncludes('src/renderer/views/ActivityView.vue', activityView, label)
}

for (const label of ['filteredRecords', 'clearRecords']) {
  assertIncludes('src/renderer/stores/logs.ts', logsStore, label)
}

for (const label of ['logsStore.filteredRecords', '@click="logsStore.clearRecords"']) {
  assertIncludes('src/renderer/views/LogView.vue', logView, label)
}

for (const label of [
  '@click="handleRefreshTicketCode"',
  'ticketStore.refreshTicketCode()',
  '@click="handleImageOcr"',
  '@click="handleTextOcr"',
  '@click="handleMoveSelectedToGroup"',
  '@click="handleImportAccounts"'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

for (const label of ['moveSelectedToGroup', 'importAccountsFromText']) {
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, label)
}

assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /toggleSeat\(seat[\s\S]*?this\.currentOrder/,
  '创建订单后不能继续改动当前选座'
)

console.log('流程按钮契约检查通过')
