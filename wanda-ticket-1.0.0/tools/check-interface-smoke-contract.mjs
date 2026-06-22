import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const smokePath = path.join(projectRoot, 'tools', 'smoke-wanda-api.mjs')
const failures = []

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
    '/user/islogin.api',
    '/showtime/by_cinema.api',
    '/order/real_time_seat.api',
    '/order/query_order_list.api',
    '/card/user_card/list.api',
    '/coupon/member/grouplist.api',
    'pickShowtime',
    'testOrderList',
    'orderTotal',
    'testStoredCards',
    'storedCardCount',
    'testMemberCoupons',
    'couponCount',
    'seatAreaCount',
    'availableSeatCount',
    'hideSensitive'
  ]) {
    if (!smoke.includes(marker)) {
      failures.push(`tools/smoke-wanda-api.mjs 缺少标记：${marker}`)
    }
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
