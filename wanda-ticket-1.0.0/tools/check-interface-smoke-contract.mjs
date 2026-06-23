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
    'assertReadonlySmokePath',
    'assertReadonlySmokeSuite',
    'readCliOption',
    '--city=',
    '--cinema=',
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
    'pickShowtime',
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
      failures.push(`tools/smoke-wanda-api.mjs 缂哄皯鍗遍櫓鎺ュ彛榛戝悕鍗曪細${dangerousPath}`)
    }
  }

  const axiosCallCount = (smoke.match(/await axios\./g) || []).length
  const readonlyGuardCount = (smoke.match(/\n\s*assertReadonlySmokePath\(pathname\)/g) || []).length

  if (readonlyGuardCount < axiosCallCount) {
    failures.push(`tools/smoke-wanda-api.mjs 姣忎釜鐪熷疄璇锋眰閮藉繀椤堕€氳繃鍙鐧藉悕鍗曟牎楠岋細${readonlyGuardCount}/${axiosCallCount}`)
  }

  if (!/label: \[[\s\S]*?formatShowtimeTime\(firstText\(showtime\.realtime/.test(smoke)) {
    failures.push('tools/smoke-wanda-api.mjs 场次冒烟输出必须格式化 realtime 时间戳')
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
