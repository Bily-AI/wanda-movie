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

const packageJson = JSON.parse(read('package.json'))
const design = read('docs/superpowers/specs/2026-06-24-member-module-old-system-parity-design.md')
const plan = read('docs/superpowers/plans/2026-06-24-member-module-old-system-parity-plan.md')
const featureApi = read('src/renderer/services/featureApi.ts')
const memberView = read('src/renderer/views/MemberView.vue')

assert.equal(packageJson.scripts?.['check:member-module'], 'node tools/check-member-module-contract.mjs')

for (const text of [
  '会员模块旧系统一致性复刻设计',
  'W+ 卡号 / 密码激活兑换',
  '领取所有账号',
  'W+ 权益活动分组',
  '去使用 / 跳转',
  '不做“更现代”的重设计'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-24-member-module-old-system-parity-design.md', design, text)
}

for (const text of ['阶段 1：服务层补齐', '阶段 2：会员页面结构复刻', '阶段 3：交互与真实流程恢复']) {
  assertIncludes('docs/superpowers/plans/2026-06-24-member-module-old-system-parity-plan.md', plan, text)
}

for (const text of [
  'MemberWPlusProfile',
  'MemberWPlusRightGroup',
  'MemberWPlusRight',
  'MemberWPlusExchangeResult',
  'fetchWPlusProfile',
  'fetchWPlusRightGroups',
  'receiveWPlusRight',
  'activateWPlus',
  "/right/plus/order/receive",
  "/right/plus/order/sale/get_exchange_info_2023",
  'rightGroupList',
  'receiveStatus',
  'verifyStatus',
  'orderCode',
  'rightType',
  'canOpen'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, text)
}

for (const text of [
  'activeTab',
  'wplus',
  'exchangeCode',
  'exchangePassword',
  'handleActivateWPlus',
  'handleReceiveAllAccountsWPlusRights',
  'fetchWPlusProfile(account.ck, userIdentifier)',
  "accountsStore.accounts.filter((account) => account.ck)",
  'skippedAccountCount',
  'isNonWPlusMessage',
  'handleReceiveAllWPlusRights',
  'wplusRightGroups',
  'wplusProfile'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, text)
}

assert.ok(
  !/handleReceiveAllAccountsWPlusRights\(\)[\s\S]*?accountsStore\.accounts\.filter\(\(account\) => account\.ck && account\.isPayMember\)/.test(memberView),
  'all-account W+ receive should not filter by cached isPayMember'
)

console.log('会员模块旧系统复刻契约检查通过')
