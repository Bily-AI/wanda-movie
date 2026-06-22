import axios from 'axios'
import crypto from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const defaultUserDataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'wanda-ticket-tool')
const userDataDir = process.env.WANDA_TOOL_USER_DATA || defaultUserDataDir
const localDataDir = path.join(userDataDir, 'local-data')
const accountPath = path.join(localDataDir, 'accounts.json')
const cityPath = path.join(localDataDir, 'city.json')
const envPath = path.join(projectRoot, '.env.local')
const defaultCinemaKeyword = '巴中'
const cinemaKeyword =
  process.argv
    .find((arg) => arg.startsWith('--cinema='))
    ?.slice('--cinema='.length)
    .trim() || defaultCinemaKeyword

const WANDA_VERSION = '9.3.2'
const WANDA_CHANNEL = '1_2'
const WANDA_SYSTEM_VERSION = '13'
const CINEMA_SYSTEM_VERSION = '10'
const CINEMA_VERSION = '9.1.8'
const WANDA_MODEL = 'M2102J2SC'
const WANDA_USER_AGENT = 'okhttp/4.12.0'
const READONLY_SMOKE_PATHS = new Set([
  '/user/islogin.api',
  '/showtime/by_cinema.api',
  '/order/real_time_seat.api',
  '/order/query_order_list.api',
  '/card/user_card/list.api',
  '/coupon/member/grouplist.api',
  '/member/grade/grade_equity_list.api',
  '/wplus/member/plusDetail.api',
  '/sign_in/calendar.api'
])
const DANGEROUS_SMOKE_PATHS = [
  '/order/create_order.api',
  '/order/create.api',
  '/order/cancel.api',
  '/order/prepay.api',
  '/order/merge_payment.api',
  '/card/transfer.version',
  '/card/recharge.version',
  '/coupon/bind.api',
  '/coupon/present/',
  '/member/grade/gain_equity.api',
  '/pack_activity/activity/create_order.api',
  '/giftshop/transactions/create',
  '/mkt/activity/secret/selectcoupon.api',
  '/mkt/activity/secret/conponuse.api'
]

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function readEnv(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return index >= 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, '']
      })
  )
}

function hideSensitive(value) {
  return String(value || '')
    .replace(/\b1[3-9]\d{9}\b/g, (phone) => `${phone.slice(0, 3)}****${phone.slice(-4)}`)
    .replace(/([A-Za-z0-9+/=_-]{12})[A-Za-z0-9+/=_-]{8,}/g, '$1<已隐藏>')
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex')
}

function formBody(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function queryString(data) {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value) {
  return isRecord(value) ? value : {}
}

function asList(value) {
  return Array.isArray(value) ? value : []
}

function firstText(...values) {
  for (const value of values) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''

    if (text) {
      return text
    }
  }

  return ''
}

function matchesPathRule(pathname, rule) {
  return rule.endsWith('/') ? pathname.startsWith(rule) : pathname === rule
}

function assertReadonlySmokePath(pathname) {
  if (DANGEROUS_SMOKE_PATHS.some((dangerousPath) => matchesPathRule(pathname, dangerousPath))) {
    throw new Error(`拒绝在真实冒烟中调用危险接口：${pathname}`)
  }

  if (!READONLY_SMOKE_PATHS.has(pathname)) {
    throw new Error(`真实冒烟接口未加入只读白名单：${pathname}`)
  }
}

function assertReadonlySmokeSuite() {
  for (const pathname of READONLY_SMOKE_PATHS) {
    assertReadonlySmokePath(pathname)
  }
}

function isExpectedBusinessRejection(message, fragments) {
  return fragments.some((fragment) => String(message || '').includes(fragment))
}

function getNestedList(record, key, childKey) {
  return asList(asRecord(record[key])[childKey])
}

function getShowtimeFilmList(raw) {
  const root = asRecord(raw)
  const movies = asRecord(root.movies)

  return [
    ...asList(root.showtimeFilmInf),
    ...asList(root.filmList),
    ...asList(root.movies),
    ...asList(movies.movie)
  ]
}

function getDateList(film) {
  return [...asList(film.showtimeFilmDateInf), ...asList(film.dateList), ...asList(film.dates)]
}

function getShowtimeList(dateRecord) {
  return [
    ...getNestedList(dateRecord, 'showtimesInf', 'showtimeList'),
    ...asList(dateRecord.showtimeList),
    ...asList(dateRecord.showtimes),
    ...asList(dateRecord.sessions),
    ...asList(dateRecord.timeList)
  ]
}

function pickShowtime(raw) {
  for (const film of getShowtimeFilmList(raw).map(asRecord)) {
    for (const dateRecord of getDateList(film).map(asRecord)) {
      for (const showtime of getShowtimeList(dateRecord).map(asRecord)) {
        const dId = firstText(showtime.showtimeId, showtime.dId, showtime.did, showtime.id)

        if (dId) {
          return {
            dId,
            filmName: firstText(film.filmName, film.name, film.movieName),
            date: firstText(dateRecord.date, dateRecord.showDate, dateRecord.showtimeDate, dateRecord.day),
            label: [
              firstText(showtime.realtime, showtime.showTime, showtime.showTimeStr, showtime.startTime),
              firstText(showtime.hallName, showtime.hall, showtime.cinemaHallName)
            ]
              .filter(Boolean)
              .join(' - ')
          }
        }
      }
    }
  }

  throw new Error('场次接口返回中没有可用于座位接口的 dId')
}

function buildWandaHeaders(pathname, body, runtime) {
  const timestamp = String(Date.now())
  const check = md5(`${runtime.signSalt}${timestamp}${pathname}${body}`)
  const mxApi = {
    systemVersion: WANDA_SYSTEM_VERSION,
    height: runtime.height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: WANDA_VERSION,
    _mi_: runtime.account.ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model: runtime.model,
    sCode: 'Wanda',
    width: runtime.width,
    ShumeiBoxId: runtime.shumeiBoxId
  }

  return {
    'MX-API': JSON.stringify(mxApi),
    'MX-CID': runtime.mxCid,
    'Accept-Charset': 'UTF-8,*',
    'Accept-Encoding': 'gzip',
    Connection: 'Keep-Alive',
    'User-Agent': WANDA_USER_AGENT,
    ShumeiBoxId: runtime.shumeiBoxId,
    'X-RY-CHANNEL': WANDA_CHANNEL,
    'X-RY-TIMESTAMP': timestamp,
    'X-RY-SYSTEM-VER': WANDA_SYSTEM_VERSION,
    'X-RY-VERSION': WANDA_VERSION,
    'X-RY-TOKEN': runtime.account.ck,
    'X-RY-USER': runtime.account.userIdentifier,
    'X-RY-CHECK': check,
    'X-RY-MODEL': runtime.model,
    'X-RY-SIGN': check,
    Host: runtime.host,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': String(new TextEncoder().encode(body).length)
  }
}

function buildCinemaHeaders(requestPath, runtime) {
  const timestamp = String(Date.now())
  const check = md5(`${runtime.signSalt}${timestamp}${requestPath}`)
  const mxApi = {
    systemVersion: CINEMA_SYSTEM_VERSION,
    height: 2200,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: CINEMA_VERSION,
    _mi_: runtime.account.ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model: runtime.model,
    sCode: 'Wanda',
    width: runtime.width,
    ShumeiBoxId: runtime.shumeiBoxId
  }

  return {
    'MX-CID': runtime.mxCid || 'codex-smoke',
    'MX-API': JSON.stringify(mxApi),
    Host: `${runtime.host}:443`,
    'Accept-Charset': 'UTF-8,*',
    ShumeiBoxId: runtime.shumeiBoxId,
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': WANDA_USER_AGENT
  }
}

function buildSeatHeaders(requestPath, runtime) {
  const timestamp = String(Date.now())
  const check = md5(`${runtime.signSalt}${timestamp}${requestPath}`)
  const mxApi = {
    systemVersion: WANDA_SYSTEM_VERSION,
    height: runtime.height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: WANDA_VERSION,
    _mi_: runtime.account.ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model: runtime.model,
    sCode: 'Wanda',
    width: runtime.width,
    ShumeiBoxId: runtime.shumeiBoxId
  }

  return {
    'MX-API': JSON.stringify(mxApi),
    'X-RY-SIGN': check,
    'X-RY-USER': runtime.account.userIdentifier,
    Host: runtime.host,
    'X-RY-CHECK': check,
    'X-RY-MODEL': runtime.model,
    'X-RY-TOKEN': runtime.account.ck,
    ShumeiBoxId: runtime.shumeiBoxId,
    'X-RY-SYSTEM-VER': WANDA_SYSTEM_VERSION,
    'X-RY-VERSION': WANDA_VERSION,
    'Accept-Charset': 'UTF-8,*',
    'X-RY-CHANNEL': WANDA_CHANNEL,
    'X-RY-TIMESTAMP': timestamp,
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': WANDA_USER_AGENT
  }
}

function buildWandaGetHeaders(requestPath, runtime) {
  const headers = buildWandaHeaders(requestPath, '', runtime)

  delete headers['Content-Type']
  delete headers['Content-Length']

  return headers
}

function pickAccount(accounts) {
  return accounts.find((account) => account.ck && account.userIdentifier)
}

function pickCinema(cityData) {
  return (
    (cityData.cinemas || []).find((cinema) => String(cinema.name || cinema.cinemaName).includes(cinemaKeyword)) ||
    (cityData.cinemas || [])[0]
  )
}

function buildRuntime(env, account) {
  const signSalt = String(env.VITE_WANDA_SIGN_SALT || '').trim()

  if (!signSalt) {
    throw new Error('缺少万达签名盐配置 VITE_WANDA_SIGN_SALT')
  }

  return {
    account,
    signSalt,
    model: String(env.VITE_WANDA_MODEL || WANDA_MODEL).trim() || WANDA_MODEL,
    shumeiBoxId: String(env.VITE_WANDA_SHUMEI_BOX_ID || 'wanda-ticket-tool').trim() || 'wanda-ticket-tool',
    mxCid: String(env.VITE_WANDA_MX_CID || '').trim(),
    width: 1080,
    height: 2206,
    host: ''
  }
}

async function testIsLogin(runtime) {
  const host = 'user-api-prd-mx.wandafilm.com'
  const pathname = '/user/islogin.api'
  assertReadonlySmokePath(pathname)
  const body = formBody({ json: true })
  const response = await axios.post(`https://${host}${pathname}`, body, {
    headers: buildWandaHeaders(pathname, body, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })

  return {
    name: '账号登录状态',
    method: 'POST',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: Boolean(response.data?.data?.success),
    message: hideSensitive(response.data?.msg || response.data?.message || '')
  }
}

async function testShowtimeByCinema(runtime, cinema) {
  const host = 'cinema-api-prd-mx.wandafilm.com'
  const pathname = '/showtime/by_cinema.api'
  assertReadonlySmokePath(pathname)
  const query = `cinemaId=${encodeURIComponent(cinema.id || cinema.cinemaId)}&showType=0&json=true`
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildCinemaHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = response.data?.data || {}

  return {
    data,
    test: {
      name: '影院场次',
      method: 'GET',
      path: pathname,
      cinemaId: cinema.id || cinema.cinemaId,
      cinemaName: cinema.name || cinema.cinemaName,
      httpStatus: response.status,
      code: response.data?.code,
      success: response.data?.success === true || response.data?.code === 0,
      message: hideSensitive(response.data?.msg || response.data?.message || ''),
      movieCount: Array.isArray(data.showtimeFilmInf) ? data.showtimeFilmInf.length : 0
    }
  }
}

async function testRealTimeSeat(runtime, showtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/order/real_time_seat.api'
  assertReadonlySmokePath(pathname)
  const query = `dId=${encodeURIComponent(showtime.dId)}`
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildSeatHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const realtimeSeats = response.data?.data?.realtimeSeats || {}
  const areas = asList(realtimeSeats.area)
  const seats = areas.flatMap((area) => asList(asRecord(area).seat))
  const availableSeatCount = seats.filter((seat) => Number(asRecord(seat).status) === 1).length

  return {
    name: '座位数据',
    method: 'GET',
    path: pathname,
    showtimeId: showtime.dId,
    showtimeLabel: showtime.label,
    httpStatus: response.status,
    code: response.data?.code,
    success: (response.data?.success === true || response.data?.code === 0) && seats.length > 0,
    message: hideSensitive(response.data?.msg || response.data?.message || ''),
    seatAreaCount: areas.length,
    seatCount: seats.length,
    availableSeatCount
  }
}

async function testOrderList(runtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/order/query_order_list.api'
  assertReadonlySmokePath(pathname)
  const body = formBody({ busiType: 3, pageIndex: 1, pageSize: 20, timeLeagth: 0 })
  const response = await axios.post(`https://${host}${pathname}`, body, {
    headers: buildWandaHeaders(pathname, body, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const records = [
    ...asList(data.listOrderInf),
    ...asList(data.orderInf),
    ...asList(data.records),
    ...asList(data.orders),
    ...asList(data.list)
  ]

  return {
    name: '历史订单',
    method: 'POST',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || ''),
    orderTotal: Number(data.totalCount ?? data.total ?? data.count ?? records.length) || 0,
    orderCount: records.length
  }
}

async function testStoredCards(runtime) {
  const host = 'card-api-prd-mx.wandafilm.com'
  const pathname = '/card/user_card/list.api'
  assertReadonlySmokePath(pathname)
  const query = queryString({ category: 1, json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const res = asRecord(data.res)
  const cards = [
    ...asList(data.cards),
    ...asList(data.cardList),
    ...asList(data.itemList),
    ...asList(data.items),
    ...asList(data.list),
    ...asList(data.commendcards),
    ...asList(res.cards),
    ...asList(res.cardList),
    ...asList(res.itemList),
    ...asList(res.items),
    ...asList(res.list),
    ...asList(res.commendcards)
  ]

  return {
    name: '储值卡列表',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || res.bizMsg || ''),
    storedCardCount: cards.length
  }
}

async function testMemberCoupons(runtime) {
  const host = 'coupon-api-prd-mx.wandafilm.com'
  const pathname = '/coupon/member/grouplist.api'
  assertReadonlySmokePath(pathname)
  const query = queryString({ couponStatus: '', expireStatus: 'N', json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const groups = [
    ...asList(data.groups),
    ...asList(data.groupList),
    ...asList(data.list),
    ...asList(data.items)
  ]
  const groupedCoupons = groups.flatMap((group) => {
    const record = asRecord(group)

    return [...asList(record.couponInfoList), ...asList(record.coupons), ...asList(record.items)]
  })
  const coupons = groupedCoupons.length > 0
    ? groupedCoupons
    : [
        ...asList(data.couponInfoList),
        ...asList(data.coupons),
        ...asList(data.items),
        ...asList(data.list)
      ]

  return {
    name: '兑换券列表',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    couponGroupCount: groups.length,
    couponCount: coupons.length
  }
}

async function testMemberGradeEquity(runtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/member/grade/grade_equity_list.api'
  assertReadonlySmokePath(pathname)
  const response = await axios.get(`https://${host}${pathname}`, {
    headers: buildWandaGetHeaders(pathname, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const groups = [
    ...asList(data.gradeList),
    ...asList(data.grades),
    ...asList(data.list),
    ...asList(data.items)
  ]
  const equities = groups.flatMap((group) => {
    const record = asRecord(group)

    return [
      ...asList(record.equityList),
      ...asList(record.rights),
      ...asList(record.items),
      ...asList(record.couponList)
    ]
  })

  return {
    name: '会员权益',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    memberGradeCount: groups.length,
    memberEquityCount: equities.length
  }
}

async function testWPlusDetail(runtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/wplus/member/plusDetail.api'
  assertReadonlySmokePath(pathname)
  const query = queryString({ json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const message = hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || '')
  const expectedNonMember = isExpectedBusinessRejection(message, ['不是付费会员', '非付费会员'])
  const rights = [
    ...asList(data.rights),
    ...asList(data.rightList),
    ...asList(data.equityList),
    ...asList(data.list),
    ...asList(data.items)
  ]

  return {
    name: 'W+会员详情',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0 || expectedNonMember,
    message,
    wPlusMember: !expectedNonMember,
    wPlusRightCount: rights.length
  }
}

async function testMemberSignInCalendar(runtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/sign_in/calendar.api'
  assertReadonlySmokePath(pathname)
  const body = JSON.stringify({ ruleScene: 1 })
  const signatureBody = encodeURIComponent(body).replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase())
  const response = await axios.post(`https://${host}${pathname}`, body, {
    headers: {
      ...buildWandaHeaders(pathname, signatureBody, { ...runtime, host }),
      'Content-Type': 'application/json',
      'Content-Length': String(new TextEncoder().encode(body).length)
    },
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const calendar = asRecord(data.data ?? data.res ?? data)
  const days = [
    ...asList(calendar.dataList),
    ...asList(calendar.list),
    ...asList(calendar.items)
  ]

  return {
    name: '会员签到日历',
    method: 'POST',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    consecutiveDays: Number(calendar.consecutiveDays ?? calendar.signInStreak ?? 0) || 0,
    signInDayCount: days.length
  }
}

async function main() {
  assertReadonlySmokeSuite()

  const env = readEnv(envPath)
  const accountsData = readJson(accountPath)
  const cityData = readJson(cityPath)
  const account = pickAccount(accountsData.accounts || [])
  const cinema = pickCinema(cityData)

  if (!account) {
    throw new Error('本地账号数据中没有可用 CK 账号')
  }

  if (!cinema) {
    throw new Error('本地城市影院数据为空，无法测试影院场次接口')
  }

  const runtime = buildRuntime(env, account)
  const tests = []

  tests.push(await testIsLogin(runtime))
  const showtimeResult = await testShowtimeByCinema(runtime, cinema)
  tests.push(showtimeResult.test)
  tests.push(await testRealTimeSeat(runtime, pickShowtime(showtimeResult.data)))
  tests.push(await testOrderList(runtime))
  tests.push(await testStoredCards(runtime))
  tests.push(await testMemberCoupons(runtime))
  tests.push(await testMemberGradeEquity(runtime))
  tests.push(await testWPlusDetail(runtime))
  tests.push(await testMemberSignInCalendar(runtime))

  const summary = {
    userDataDir,
    account: {
      phone: hideSensitive(account.phone),
      status: account.status,
      hasCk: Boolean(account.ck),
      hasUserIdentifier: Boolean(account.userIdentifier)
    },
    cityCache: {
      cities: (cityData.cities || []).length,
      cinemas: (cityData.cinemas || []).length,
      rawCities: (cityData.city || []).length
    },
    tests
  }

  console.log(JSON.stringify(summary, null, 2))

  const failed = tests.filter((test) => test.httpStatus < 200 || test.httpStatus >= 300 || !test.success)

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(hideSensitive(error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
