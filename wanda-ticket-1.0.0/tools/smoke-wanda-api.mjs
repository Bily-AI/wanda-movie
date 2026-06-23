import axios from 'axios'
import CryptoJS from 'crypto-js'
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
const cityKeyword = readCliOption('--city=')
const cinemaKeyword =
  readCliOption('--cinema=') || defaultCinemaKeyword
const paymentOrderId = readCliOption('--payment-order=')
const paymentCinemaId = readCliOption('--payment-cinema=')
const paymentDId = readCliOption('--payment-did=')
const paymentSeats = readCliOption('--payment-seats=')

const WANDA_VERSION = '9.3.2'
const WANDA_CHANNEL = '1_2'
const WANDA_SYSTEM_VERSION = '13'
const CINEMA_SYSTEM_VERSION = '10'
const CINEMA_VERSION = '9.1.8'
const WANDA_MODEL = 'M2102J2SC'
const WANDA_USER_AGENT = 'okhttp/4.12.0'
const ACTIVITY_AES_KEY = '6f34faeefba8fd39'
const READONLY_SMOKE_PATHS = new Set([
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
  '/giftshop/orders'
])
const PAYMENT_DIAGNOSTIC_PATHS = new Set([
  '/order/order_status.api',
  '/card/pay/list.api',
  '/mkt/activity/secret/list.api',
  '/mkt/activity/secret/ncoupons.api'
])
const DANGEROUS_SMOKE_PATHS = [
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
]

function readCliOption(prefix) {
  return (
    process.argv
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || ''
  )
}

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

function collectList(value, keys) {
  if (Array.isArray(value)) {
    return value
  }

  const record = asRecord(value)
  const result = []

  for (const key of keys) {
    result.push(...asList(record[key]))
  }

  for (const key of ['data', 'res', 'result']) {
    if (record[key] !== value) {
      result.push(...collectList(record[key], keys))
    }
  }

  return result
}

function formatShowtimeTime(value) {
  const text = String(value || '').trim()

  if (!/^\d{10,13}$/.test(text)) {
    return text
  }

  const timestamp = Number(text.length === 10 ? `${text}000` : text)
  const date = new Date(timestamp)

  if (!Number.isFinite(date.getTime())) {
    return text
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function decryptActivityPayload(value) {
  const text = firstText(value)

  if (!text) {
    return {}
  }

  try {
    const key = CryptoJS.enc.Utf8.parse(ACTIVITY_AES_KEY)
    const ciphertext = CryptoJS.enc.Base64.parse(text)
    const params = CryptoJS.lib.CipherParams.create({ ciphertext })
    const decrypted = CryptoJS.AES.decrypt(params, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    }).toString(CryptoJS.enc.Utf8)

    return asRecord(JSON.parse(decrypted))
  } catch {
    return {}
  }
}

function hasPaymentDiagnosticArgs() {
  return Boolean(paymentOrderId || paymentCinemaId || paymentDId || paymentSeats)
}

function requirePaymentDiagnosticContext() {
  if (!paymentOrderId || !paymentCinemaId || !paymentDId || !paymentSeats) {
    throw new Error('支付前置诊断需要同时提供 --payment-order=订单号 --payment-cinema=影院ID --payment-did=场次ID --payment-seats=旧接口分区座位参数')
  }

  return {
    orderId: paymentOrderId,
    cinemaId: paymentCinemaId,
    dId: paymentDId,
    partition: paymentSeats
  }
}

function collectPaymentGroups(payload) {
  const record = asRecord(payload)
  const res = asRecord(record.res)

  return [
    ...asList(record.res),
    ...asList(record.groups),
    ...asList(record.groupList),
    ...asList(record.activityList),
    ...asList(res.groups),
    ...asList(res.groupList),
    ...asList(res.activityList)
  ]
}

function collectGroupItems(group) {
  const record = asRecord(group)

  return [...asList(record.groupItems), ...asList(record.items), ...asList(record.activityList)]
}

function collectCoupons(payload) {
  const record = asRecord(payload)
  const res = asRecord(record.res)

  return [
    ...asList(record.coupons),
    ...asList(record.couponList),
    ...asList(record.items),
    ...asList(record.list),
    ...asList(res.coupons),
    ...asList(res.couponList),
    ...asList(res.items),
    ...asList(res.list)
  ]
}

function cityMatchesKeyword(city, keyword) {
  if (!keyword) {
    return true
  }

  const record = asRecord(city)
  return [
    record.id,
    record.cityId,
    record.cityid,
    record.CityID,
    record.name,
    record.cityName,
    record.CityName,
    record.pinyin,
    record.firstLetter
  ].some((value) => String(value || '').includes(keyword))
}

function collectMatchedCityIds(cityData) {
  if (!cityKeyword) {
    return new Set()
  }

  const cityIds = new Set()

  for (const city of [...asList(cityData.cities), ...asList(cityData.city)]) {
    if (!cityMatchesKeyword(city, cityKeyword)) {
      continue
    }

    const record = asRecord(city)
    const cityId = firstText(record.id, record.cityId, record.cityid, record.CityID)

    if (cityId) {
      cityIds.add(cityId)
    }
  }

  return cityIds
}

function cinemaMatchesCity(cinema, matchedCityIds) {
  if (matchedCityIds.size === 0) {
    return true
  }

  const record = asRecord(cinema)
  const cityId = firstText(record.cityId, record.cityid, record.cityCode, record.CityID, record.cityID)

  return matchedCityIds.has(cityId)
}

function listCinemas(cityData) {
  const cinemas = new Map()

  for (const cinema of asList(cityData.cinemas)) {
    const record = asRecord(cinema)
    const id = firstText(record.id, record.cinemaId, record.cinemaid, record.CmID, record.cmID)

    if (id) {
      cinemas.set(id, cinema)
    }
  }

  for (const city of asList(cityData.city)) {
    const cityRecord = asRecord(city)
    const cityId = firstText(cityRecord.id, cityRecord.cityId, cityRecord.cityid, cityRecord.CityID)

    for (const cinema of asList(cityRecord.CmList)) {
      const record = asRecord(cinema)
      const id = firstText(record.id, record.cinemaId, record.cinemaid, record.CmID, record.cmID)

      if (id) {
        const current = asRecord(cinemas.get(id))
        const currentName = firstText(current.name, current.cinemaName, current.CmName)
        const nestedName = firstText(record.name, record.cinemaName, record.CmName)

        if (!cinemas.has(id) || nestedName.length > currentName.length) {
          cinemas.set(id, { ...current, ...record, name: nestedName || currentName, cityId })
        }
      }
    }
  }

  return [...cinemas.values()]
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

function assertPaymentDiagnosticPath(pathname) {
  if (!PAYMENT_DIAGNOSTIC_PATHS.has(pathname)) {
    throw new Error(`支付诊断接口未加入显式白名单：${pathname}`)
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

function pickShowtimes(raw) {
  const showtimes = []
  for (const film of getShowtimeFilmList(raw).map(asRecord)) {
    for (const dateRecord of getDateList(film).map(asRecord)) {
      for (const showtime of getShowtimeList(dateRecord).map(asRecord)) {
        const dId = firstText(showtime.showtimeId, showtime.dId, showtime.did, showtime.id)

        if (dId) {
          showtimes.push({
            dId,
            filmName: firstText(film.filmName, film.name, film.movieName),
            date: firstText(dateRecord.date, dateRecord.showDate, dateRecord.showtimeDate, dateRecord.day),
            label: [
              formatShowtimeTime(firstText(showtime.realtime, showtime.showTime, showtime.showTimeStr, showtime.startTime)),
              firstText(showtime.hallName, showtime.hall, showtime.cinemaHallName)
            ]
              .filter(Boolean)
              .join(' - ')
          })
        }
      }
    }
  }

  if (showtimes.length > 0) {
    return showtimes
  }

  throw new Error('场次接口返回中没有可用于座位接口的 dId')
}

function pickShowtime(raw) {
  return pickShowtimes(raw)[0]
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
  const cinemas = listCinemas(cityData)
  const matchedCityIds = collectMatchedCityIds(cityData)
  const cityCinemas = cinemas.filter((cinema) => cinemaMatchesCity(cinema, matchedCityIds))

  return (
    cityCinemas.find((cinema) => String(cinema.name || cinema.cinemaName || cinema.CmName).includes(cinemaKeyword)) ||
    cityCinemas[0] ||
    cinemas.find((cinema) => String(cinema.name || cinema.cinemaName || cinema.CmName).includes(cinemaKeyword)) ||
    cinemas[0]
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
  const seatStatusCounts = Object.fromEntries(
    [...seats.reduce((counts, seat) => {
      const status = firstText(asRecord(seat).status, 'unknown')
      counts.set(status, (counts.get(status) || 0) + 1)
      return counts
    }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right))
  )
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
    seatStatusCounts,
    availableSeatCount
  }
}

async function findSeatSmokeResult(runtime, showtimeResult) {
  let lastSeatResult = null

  for (const showtime of pickShowtimes(showtimeResult.data)) {
    const seatResult = await testRealTimeSeat(runtime, showtime)

    if (seatResult.success) {
      return seatResult
    }

    lastSeatResult = seatResult
  }

  return lastSeatResult
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

async function testActivityGifts(runtime, cinema) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/pack_activity/activity/list.api'
  assertReadonlySmokePath(pathname)
  const query = queryString({ cinemaId: cinema.id || cinema.cinemaId, json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const activities = [
    ...asList(data.activities),
    ...asList(data.activityList),
    ...asList(data.itemList),
    ...asList(data.list),
    ...asList(data.items)
  ]

  return {
    data,
    firstActivity: activities.map(asRecord).find((activity) => firstText(activity.id, activity.activityId, activity.code, activity.activityCode)),
    test: {
      name: '活动礼包列表',
      method: 'GET',
      path: pathname,
      cinemaId: cinema.id || cinema.cinemaId,
      httpStatus: response.status,
      code: response.data?.code,
      success: response.data?.success === true || response.data?.code === 0,
      message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
      activityGiftCount: activities.length
    }
  }
}

async function testActivityGiftDetail(runtime, cinema, activity) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/pack_activity/activity/detail.api'
  assertReadonlySmokePath(pathname)
  const activityRecord = asRecord(activity)
  const activityCode = firstText(activityRecord.id, activityRecord.activityId, activityRecord.code, activityRecord.activityCode)

  if (!activityCode) {
    return {
      name: '活动礼包详情',
      method: 'GET',
      path: pathname,
      skipped: true,
      success: true,
      activityDetailReachable: false,
      message: '活动列表为空，跳过详情接口'
    }
  }

  const query = queryString({ cinemaId: cinema.id || cinema.cinemaId, activityCode, json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)

  return {
    name: '活动礼包详情',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    activityDetailReachable: response.status >= 200 && response.status < 300
  }
}

async function testPaymentOrderStatus(runtime, context) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/order/order_status.api'
  assertPaymentDiagnosticPath(pathname)
  const body = formBody({ orderId: context.orderId })
  const response = await axios.post(`https://${host}${pathname}`, body, {
    headers: buildWandaHeaders(pathname, body, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const res = asRecord(data.res)
  const orderInf = asRecord(data.orderInf ?? res.orderInf)

  return {
    name: '支付订单状态诊断',
    method: 'POST',
    path: pathname,
    orderId: context.orderId,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || res.bizMsg || ''),
    payStatus: firstText(orderInf.payStatus, res.payStatus, data.payStatus),
    showOrderStatus: firstText(orderInf.showOrderStatus, res.showOrderStatus, data.showOrderStatus),
    showOrderStatusStr: firstText(orderInf.showOrderStatusStr, res.showOrderStatusStr, data.showOrderStatusStr)
  }
}

async function testPaymentPayCards(runtime, context) {
  const host = 'card-api-prd-mx.wandafilm.com'
  const pathname = '/card/pay/list.api'
  assertPaymentDiagnosticPath(pathname)
  const query = queryString({ orderId: context.orderId })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const cards = collectList(data, ['cards', 'cardList', 'itemList', 'items', 'list', 'commendcards'])

  return {
    name: '支付卡诊断',
    method: 'GET',
    path: pathname,
    orderId: context.orderId,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    paymentCardCount: cards.length
  }
}

async function testPaymentActivities(runtime, context) {
  const host = 'mkt-activity-api-prd-mx.wandafilm.com'
  const pathname = '/mkt/activity/secret/list.api'
  assertPaymentDiagnosticPath(pathname)
  const query = queryString({ partition: context.partition, orderId: context.orderId, did: context.dId })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const decrypted = decryptActivityPayload(response.data?.data)
  const groups = collectPaymentGroups(decrypted)
  const activities = groups.flatMap((group) => collectGroupItems(group))

  return {
    name: '支付活动诊断',
    method: 'GET',
    path: pathname,
    orderId: context.orderId,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || asRecord(decrypted).bizMsg || ''),
    paymentActivityGroupCount: groups.length,
    paymentActivityCount: activities.length
  }
}

async function testPaymentCoupons(runtime, context) {
  const host = 'mkt-activity-api-prd-mx.wandafilm.com'
  const pathname = '/mkt/activity/secret/ncoupons.api'
  assertPaymentDiagnosticPath(pathname)
  const query = queryString({
    partition: context.partition,
    cinemaId: context.cinemaId,
    latitude: '',
    did: context.dId,
    able: true,
    longitude: '',
    coordinateType: 2
  })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const decrypted = decryptActivityPayload(response.data?.data)
  const coupons = collectCoupons(decrypted)

  return {
    name: '支付兑换券诊断',
    method: 'GET',
    path: pathname,
    orderId: context.orderId,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || asRecord(decrypted).bizMsg || ''),
    paymentCouponCount: coupons.length
  }
}

async function testPaymentPrerequisites(runtime) {
  const context = requirePaymentDiagnosticContext()

  return [
    await testPaymentOrderStatus(runtime, context),
    await testPaymentPayCards(runtime, context),
    await testPaymentActivities(runtime, context),
    await testPaymentCoupons(runtime, context)
  ]
}

async function testGiftOrders(runtime) {
  const host = 'front-gateway-c.wandafilm.com'
  const pathname = '/giftshop/orders'
  assertReadonlySmokePath(pathname)
  const query = queryString({ pageIndex: 1, pageSize: 20, json: true })
  const requestPath = `${pathname}?${query}`
  const response = await axios.get(`https://${host}${requestPath}`, {
    headers: buildWandaGetHeaders(requestPath, { ...runtime, host }),
    timeout: 15000,
    validateStatus: () => true
  })
  const data = asRecord(response.data?.data)
  const orders = [
    ...asList(data.orders),
    ...asList(data.orderList),
    ...asList(data.items),
    ...asList(data.list),
    ...asList(data.records)
  ]

  return {
    name: '活动礼包订单',
    method: 'GET',
    path: pathname,
    httpStatus: response.status,
    code: response.data?.code,
    success: response.data?.success === true || response.data?.code === 0,
    message: hideSensitive(response.data?.msg || response.data?.message || data.bizMsg || ''),
    giftOrderTotal: Number(data.totalCount ?? data.total ?? data.count ?? orders.length) || 0,
    giftOrderCount: orders.length
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
  tests.push(await findSeatSmokeResult(runtime, showtimeResult))
  tests.push(await testOrderList(runtime))
  tests.push(await testStoredCards(runtime))
  tests.push(await testMemberCoupons(runtime))
  tests.push(await testMemberGradeEquity(runtime))
  tests.push(await testWPlusDetail(runtime))
  tests.push(await testMemberSignInCalendar(runtime))
  const activityResult = await testActivityGifts(runtime, cinema)
  tests.push(activityResult.test)
  tests.push(await testActivityGiftDetail(runtime, cinema, activityResult.firstActivity))
  tests.push(await testGiftOrders(runtime))

  if (hasPaymentDiagnosticArgs()) {
    tests.push(...(await testPaymentPrerequisites(runtime)))
  }

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
