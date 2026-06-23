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
const design = read('docs/superpowers/specs/2026-06-21-coupon-present-flow-design.md')
const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const main = read('src/main/index.ts')
const env = read('src/renderer/env.d.ts')
const featureApi = read('src/renderer/services/featureApi.ts')
const exchangeView = read('src/renderer/views/ExchangeCouponView.vue')

if (packageJson.scripts?.['check:coupon-present'] !== 'node tools/check-coupon-present-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:coupon-present 脚本')
}

for (const label of [
  '兑换券真实赠送链路设计',
  '/coupon/present/canCouponPresent.api',
  '/coupon/present/idverify.api',
  '/coupon/present/sms/send_security_code.api',
  '/coupon/present/sms/valid_security_code.api',
  '/coupon/present/present.api'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-21-coupon-present-flow-design.md', design, label)
}

for (const label of ['APP_GET_LOCAL_IP', 'app:get-local-ip']) {
  assertIncludes('src/shared/ipc.ts', ipc, label)
}

for (const label of ['getLocalIp', 'APP_GET_LOCAL_IP']) {
  assertIncludes('src/preload/index.ts', preload, label)
}

for (const label of ['networkInterfaces', 'getLocalIp', 'APP_GET_LOCAL_IP']) {
  assertIncludes('src/main/index.ts', main, label)
}

assertIncludes('src/renderer/env.d.ts', env, 'getLocalIp: () => Promise<string>')

for (const label of [
  'buildCouponNosParam',
  'checkCouponPresentable',
  'checkCouponPresentIdentity',
  'sendCouponPresentSecurityCode',
  'validateCouponPresentSecurityCode',
  'presentMemberCoupons',
  'WANDA_API_PATHS.COUPON_PRESENT',
  'canCouponPresent.api',
  'idverify.api',
  'sms/send_security_code.api',
  'sms/valid_security_code.api',
  'present.api',
  'targetMobile',
  'memberPhone',
  'requestId',
  'securityCode',
  'wandaPostForm'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /presentMemberCoupons\([\s\S]*?voucherNos[\s\S]*?shareMemo[\s\S]*?targetMobile[\s\S]*?requestId[\s\S]*?securityCode[\s\S]*?memberPhone[\s\S]*?wandaPostForm/,
  '兑换券赠送必须沿用旧包 present.api 表单体'
)

for (const label of [
  'presentDialogVisible',
  'couponDetailDialogVisible',
  'presentTargetMobile',
  'presentRequestId',
  'presentSecurityCode',
  'presentVerifiedSecurityCode',
  'presentAccountId',
  'presentOperationSerial',
  'bumpPresentOperation',
  'isPresentOperationCurrent',
  'handlePresentSecurityCodeInput',
  'openPresentDialog',
  'handleBatchPresent',
  'handleSendPresentCode',
  'handleValidatePresentCode',
  'handleConfirmPresent',
  'maskVoucherNo',
  'safeVoucherNumber',
  'showCouponDetail',
  '@click="openPresentDialog(row)"',
  '@click="showCouponDetail(row)"'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, label)
}

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /const securityCode = presentSecurityCode\.value\.trim\(\)[\s\S]*?presentSecurityCode\.value\.trim\(\) !== securityCode[\s\S]*?presentVerifiedSecurityCode\.value\s*=\s*securityCode/,
  '短信验证通过后必须保存已验证验证码'
)

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /presentMemberCoupons\([\s\S]*?presentVerifiedSecurityCode\.value[\s\S]*?account\.ck/,
  '提交赠送必须使用已验证验证码'
)

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /function handlePresentSecurityCodeInput\(\)[\s\S]*?presentCodeVerified\.value\s*=\s*false[\s\S]*?presentVerifiedSecurityCode\.value\s*=\s*''/,
  '验证码输入变化必须清空已验证状态'
)

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /const operationSerial = bumpPresentOperation\(\)[\s\S]*?isPresentOperationCurrent\(operationSerial, account\.id\)/,
  '异步赠送准备必须防止旧账号请求回写'
)

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /function resetPresentForm\(\)[\s\S]*?bumpPresentOperation\(\)/,
  '关闭弹窗必须让未完成的赠送异步请求失效'
)

for (const label of [
  '当前版本先保留入口',
  '后续接入旧版 present 接口',
  '绑定卡券成功：${voucherNumber}',
  "ElMessage.info(row.couponNo || row.voucherNo || '暂无券号')"
]) {
  assertNotIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, label)
}

console.log('兑换券真实赠送契约检查通过')
