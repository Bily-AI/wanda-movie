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

const app = read('src/renderer/App.vue')
const ticketViewFull = read('src/renderer/views/TicketView.vue')
const ticketView = ticketViewFull.replace(/<!--[\s\S]*?-->/g, '')
const accountSidebar = read('src/renderer/components/AccountSidebar.vue')
const accountsStore = read('src/renderer/stores/accounts.ts')
const localData = read('src/shared/localData.ts')
const featureApi = read('src/renderer/services/featureApi.ts')
const storedCardView = read('src/renderer/views/StoredValueCardView.vue')
const couponView = read('src/renderer/views/ExchangeCouponView.vue')
const memberView = read('src/renderer/views/MemberView.vue')

assertIncludes('src/renderer/App.vue', app, "import AccountSidebar from './components/AccountSidebar.vue'")
assertIncludes('src/renderer/App.vue', app, '<AccountSidebar />')
assertIncludes('src/renderer/App.vue', app, 'class="workspace-layout"')
assertIncludes('src/renderer/App.vue', app, 'class="workspace-content"')

assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'useAccountsStore')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'handleImportAccounts')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'accountsStore.loginWandaAccount')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, "activeAccountTab.value = 'current'")
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, "ElMessage.success('切换账号成功')")

for (const text of [
  'accountAgeDays',
  'pointsBalance',
  'wplusExpireAt',
  'storedCardCount',
  'couponCount',
  'memberGradeName',
  'growthValue'
]) {
  assertIncludes('src/shared/localData.ts', localData, text)
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, text)
}

for (const text of [
  'formatAccountAgeDays',
  'formatAccountNumber',
  'formatWPlusExpire',
  'extractDateOnly',
  'handleRefreshAccountSummaries',
  'refreshingAccountSummaries',
  'checkLoginStatus',
  'fetchStoredCardsWithBalance',
  'fetchMemberCoupons',
  'fetchMemberGradeEquityList',
  'fetchWPlusProfile',
  '入库',
  '积分',
  'W+到期',
  '储值卡',
  '可用券',
  '等级',
  '成长值'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}

assertIncludes(
  'src/renderer/components/AccountSidebar.vue',
  accountSidebar,
  'checkLoginStatus(account.ck, userIdentifier)'
)
assertIncludes(
  'src/renderer/components/AccountSidebar.vue',
  accountSidebar,
  "'pointsBalance' | 'storedCardCount' | 'couponCount' | 'memberGradeName' | 'growthValue' | 'isPayMember' | 'wplusExpireAt'"
)
assertIncludes(
  'src/renderer/components/AccountSidebar.vue',
  accountSidebar,
  "summary.pointsBalance = pointsBalance"
)
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'userInfo?.payMemberStr')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'function formatWPlusExpire(row: WandaAccount): string')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'return extractDateOnly(text) || \'-\'')
assertIncludes(
  'src/renderer/components/AccountSidebar.vue',
  accountSidebar,
  "text.match(/(\\d{4})[-./年](\\d{1,2})[-./月](\\d{1,2})/)"
)
assertIncludes('src/renderer/services/featureApi.ts', featureApi, 'data.plusEndDate')
assertIncludes('src/renderer/services/featureApi.ts', featureApi, 'data.payMemberStr')

assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'updateAccountProfileSummary')
assertIncludes('src/renderer/views/StoredValueCardView.vue', storedCardView, 'updateAccountProfileSummary(account.id')
assertIncludes('src/renderer/views/ExchangeCouponView.vue', couponView, 'updateAccountProfileSummary(account.id')
assertIncludes('src/renderer/views/MemberView.vue', memberView, 'updateAccountProfileSummary(account.id')

assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, '<aside class="account-column">')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, 'handleAccountSelectionChange')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, 'handleImportAccounts')

// 账号导入分隔符改为 ----（不兼容三杠）
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, ".split('----')")
assertNotIncludes('src/renderer/stores/accounts.ts', accountsStore, ".split('---')")
for (const text of ['formatAccountExportLine', 'exportAccountsToText', 'async deleteAccounts(']) {
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, text)
}
for (const text of ['手机号----ck', '导出账号', 'handleExportAccounts', 'handleCopyExportText', 'exportDialogVisible']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
for (const text of [
  '批量删除',
  '批量导出',
  'handleBatchDeleteAccounts',
  'handleBatchExportAccounts',
  'deleteAccounts(accountsStore.selectedAccountIds'
]) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}

for (const text of ['handleToggleSelectAll', ':indeterminate="someAccountsChecked"']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
for (const text of ['refreshingSelectedSummaries', 'handleRefreshSelectedSummaries', '批量刷新']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}

for (const text of ['lastLoginAt', 'loginInvalid']) {
  assertIncludes('src/shared/localData.ts', localData, text)
}
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'async setAccountLoginState(')
for (const text of ['function accountStatusInfo(', "'account-state--warn'", '天后到期']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}

console.log('全局账号侧栏契约检查通过')
