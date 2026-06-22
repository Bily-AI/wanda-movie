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

async function main() {
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
