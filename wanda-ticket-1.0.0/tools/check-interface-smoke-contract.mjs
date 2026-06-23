import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const smokePath = path.join(projectRoot, 'tools', 'smoke-wanda-api.mjs')
const packagePath = path.join(projectRoot, 'package.json')
const failures = []

const packageConfig = JSON.parse(readFileSync(packagePath, 'utf8'))

if (packageConfig.scripts?.['check:interface-smoke'] !== 'node tools/check-interface-smoke-contract.mjs') {
  failures.push('package.json 缺少 check:interface-smoke 契约脚本')
}

if (packageConfig.scripts?.['smoke:wanda'] !== 'node tools/smoke-wanda-api.mjs') {
  failures.push('package.json 缺少 smoke:wanda 真实接口冒烟脚本')
}

if (!existsSync(smokePath)) {
  failures.push('缺少万达接口冒烟测试工具：tools/smoke-wanda-api.mjs')
} else {
  const smoke = readFileSync(smokePath, 'utf8')

  for (const marker of [
    'localDataDir',
    "'accounts.json'",
    "'city.json'",
    'VITE_WANDA_SIGN_SALT',
    "CINEMA_VERSION = '9.1.8'",
    'ver: CINEMA_VERSION',
    'buildWandaHeaders',
    'buildCinemaHeaders',
    'buildSeatHeaders',
    'READONLY_SMOKE_PATHS',
    'DANGEROUS_SMOKE_PATHS',
    'PAYMENT_DIAGNOSTIC_PATHS',
    'assertReadonlySmokePath',
    'assertPaymentDiagnosticPath',
    'assertReadonlySmokeSuite',
    'readCliOption',
    '--city=',
    '--cinema=',
    '--payment-order=',
    '--payment-cinema=',
    '--payment-did=',
    '--payment-seats=',
    'hasPaymentDiagnosticArgs',
    'testPaymentPrerequisites',
    '/order/order_status.api',
    '/card/pay/list.api',
    '/mkt/activity/secret/list.api',
    '/mkt/activity/secret/ncoupons.api',
    'cityKeyword',
    'cinemaMatchesCity',
    '/user/islogin.api',
    '/showtime/by_cinema.api',
    '/order/real_time_seat.api',
    '/order/query_order_list.api',
    '/card/user_card/list.api',
    '/coupon/member/grouplist.api',
    '/member/grade/grade_equity_list.api',
    '/wplus/member/plusDetail.api',
    '/sign_in/calendar.api',
    '/pack_activity/activity/list.api',
    '/pack_activity/activity/detail.api',
    '/giftshop/orders',
    'pickShowtimes',
    'findSeatSmokeResult',
    'testOrderList',
    'orderTotal',
    'testStoredCards',
    'storedCardCount',
    'testMemberCoupons',
    'couponCount',
    'testMemberGradeEquity',
    'memberEquityCount',
    'testWPlusDetail',
    'wPlusRightCount',
    'isExpectedBusinessRejection',
    'wPlusMember',
    'testMemberSignInCalendar',
    'signInDayCount',
    'testActivityGifts',
    'activityGiftCount',
    'testActivityGiftDetail',
    'activityDetailReachable',
    'testGiftOrders',
    'giftOrderTotal',
    'seatAreaCount',
    'availableSeatCount',
    'seatStatusCounts',
    'formatShowtimeTime',
    'hideSensitive'
  ]) {
    if (!smoke.includes(marker)) {
      failures.push(`tools/smoke-wanda-api.mjs 缺少标记：${marker}`)
    }
  }

  for (const dangerousPath of [
    '/order/create_order.api',
    '/order/create.api',
    '/order/cancel.api',
    '/order/prepay.api',
    '/order/merge_payment.api',
    '/order/query_by_userid.api',
    '/order/query_pay_info_upgrade.api',
    '/card/transfer.version',
    '/card/recharge.version',
    '/coupon/bind.api',
    '/coupon/present/',
    '/member/grade/gain_equity.api',
    '/pack_activity/activity/create_order.api',
    '/giftshop/orders/detail',
    '/giftshop/transactions/create',
    '/giftshop/transactions/detail',
    '/mkt/activity/secret/selectcoupon.api',
    '/mkt/activity/secret/conponuse.api'
  ]) {
    if (!smoke.includes(dangerousPath)) {
      failures.push(`tools/smoke-wanda-api.mjs 缺少危险接口白名单项：${dangerousPath}`)
    }
  }

  const axiosCallCount = (smoke.match(/await axios\./g) || []).length
  const readonlyGuardCount = (smoke.match(/\n\s*assertReadonlySmokePath\(pathname\)/g) || []).length
  const paymentGuardCount = (smoke.match(/\n\s*assertPaymentDiagnosticPath\(pathname\)/g) || []).length

  if (readonlyGuardCount + paymentGuardCount < axiosCallCount) {
    failures.push(
      `tools/smoke-wanda-api.mjs 每个真实请求前必须有只读或支付诊断白名单保护：${readonlyGuardCount + paymentGuardCount}/${axiosCallCount}`
    )
  }

  if (!/label: \[[\s\S]*?formatShowtimeTime\(firstText\(showtime\.realtime/.test(smoke)) {
    failures.push('tools/smoke-wanda-api.mjs 场次冒烟输出必须格式化 realtime 时间')
  }

  if (
    !/for \(const showtime of pickShowtimes\(showtimeResult\.data\)\)[\s\S]*?await testRealTimeSeat\(runtime, showtime\)[\s\S]*?seatResult\.success/.test(
      smoke
    )
  ) {
    failures.push('tools/smoke-wanda-api.mjs 座位冒烟必须遍历多个真实场次，避免单个空场次误判接口失败')
  }
}

if (failures.length > 0) {
  console.error('万达接口冒烟工具契约检查失败：')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('万达接口冒烟工具契约检查通过')
