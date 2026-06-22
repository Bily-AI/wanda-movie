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

function sliceRequired(file, content, startLabel, endLabel, label) {
  const start = content.indexOf(startLabel)

  if (start < 0) {
    throw new Error(`${file} 缺少 ${label}`)
  }

  const end = content.indexOf(endLabel, start + startLabel.length)

  if (end < 0) {
    throw new Error(`${file} 缺少 ${label}`)
  }

  return content.slice(start, end)
}

const packageJson = read('package.json')
const ipc = read('src/shared/ipc.ts')
const core = read('src/shared/wandaCore.ts')
const types = read('src/shared/wandaTicketTypes.ts')
const mainIndex = read('src/main/index.ts')
const requestService = read('src/renderer/services/wandaRequest.ts')
const authApi = read('src/renderer/services/wandaAuthApi.ts')
const cinemaApi = read('src/renderer/services/cinemaApi.ts')
const seatApi = read('src/renderer/services/seatApi.ts')
const accountsStore = read('src/renderer/stores/accounts.ts')
const logsStore = read('src/renderer/stores/logs.ts')
const ticketStore = read('src/renderer/stores/ticket.ts')
const ticketView = read('src/renderer/views/TicketView.vue')
const appVue = read('src/renderer/App.vue')
const mainLocalData = read('src/main/localData.ts')
const seatMap = read('src/renderer/components/SeatMap.vue')
const selectedSeatList = read('src/renderer/components/SelectedSeatList.vue')

assertIncludes('package.json', packageJson, '"check:phase3"')
assertIncludes('src/shared/ipc.ts', ipc, 'Record<string, unknown> | string')
assertIncludes('src/shared/wandaCore.ts', core, 'ORDER_CREATE_TICKET')
assertIncludes('src/shared/wandaCore.ts', core, '/order/create_order.api')
assertIncludes('src/shared/wandaCore.ts', core, 'ticket-api-prd-mx.wandafilm.com')
assertIncludes('src/shared/wandaCore.ts', core, "typeof request.body !== 'string'")
assertIncludes('src/main/index.ts', mainIndex, "../preload/index.mjs")

for (const label of [
  'WandaLoginRequestId',
  'WandaLoginResult',
  'CityRecord',
  'CinemaRecord',
  'ShowtimeFilm',
  'RealTimeSeats',
  'RawSeat',
  'SeatNode',
  'TicketOrderResult'
]) {
  assertIncludes('src/shared/wandaTicketTypes.ts', types, label)
}

for (const label of [
  'buildWandaUrl',
  'toFormBody',
  'wandaGet',
  'wandaPost',
  'buildWandaHeaders',
  'buildCinemaHeaders',
  'wandaCinemaGet',
  'buildWandaLoginHeaders',
  'wandaLoginPost',
  'setWandaRequestParams'
]) {
  assertIncludes('src/renderer/services/wandaRequest.ts', requestService, label)
}

assertNotIncludes('src/renderer/services/wandaRequest.ts', requestService, 'getWandaApp()?.wandaHttpGet')
assertNotIncludes('src/renderer/services/wandaRequest.ts', requestService, 'getWandaApp()?.wandaHttpPost')

for (const label of [
  'MX-API',
  'X-RY-CHANNEL',
  'X-RY-CHECK',
  'X-RY-SIGN',
  'X-RY-MODEL',
  'ShumeiBoxId',
  'User-Agent',
  'X-RY-SYSTEM-VER',
  'Accept-Charset',
  'MX-CID',
  'VITE_WANDA_SIGN_SALT',
  'VITE_WANDA_MX_CID',
  'MD5('
]) {
  assertIncludes('src/renderer/services/wandaRequest.ts', requestService, label)
}

assertIncludes('src/renderer/services/wandaRequest.ts', requestService, 'WandaPostOptions')
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, 'signatureBody')
assertIncludes(
  'src/renderer/services/wandaRequest.ts',
  requestService,
  '.filter(([, value]) => value !== undefined)'
)

for (const label of ['sendVerifyCode', 'loginWithCode', 'checkLoginStatus']) {
  assertIncludes('src/renderer/services/wandaAuthApi.ts', authApi, label)
}

for (const [startLabel, endLabel] of [
  ['export async function sendVerifyCode', 'export async function loginWithCode'],
  ['export async function loginWithCode', 'export async function checkLoginStatus']
]) {
  const authLoginBlock = sliceRequired('src/renderer/services/wandaAuthApi.ts', authApi, startLabel, endLabel, startLabel)
  assertIncludes('src/renderer/services/wandaAuthApi.ts', authLoginBlock, 'wandaLoginPost')
  assertNotIncludes('src/renderer/services/wandaAuthApi.ts', authLoginBlock, 'wandaPost')
}

const authStatusBlock = sliceRequired(
  'src/renderer/services/wandaAuthApi.ts',
  authApi,
  'export async function checkLoginStatus',
  '  const data = response.data',
  '登录状态检查函数'
)
assertIncludes('src/renderer/services/wandaAuthApi.ts', authStatusBlock, 'wandaPost')

assertIncludes('src/renderer/services/wandaAuthApi.ts', authApi, "cinemaId: '7115'")
assertIncludes('src/renderer/services/wandaAuthApi.ts', authApi, "userPlat: 'oppo'")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "DEFAULT_WANDA_MODEL = 'M2102J2SC'")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, 'getDefaultWandaUserId() || userIdentifier.trim()')
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeParam('model')")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeParam('userId')")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeParam('shumeiBoxId')")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeNumberParam('height', 2206)")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeNumberParam('height', 2200)")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "getRuntimeNumberParam('width', 1080)")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "'Accept-Encoding': 'gzip, deflate'")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, "CINEMA_SYSTEM_VERSION = '10'")
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, 'generateMxCid')
assertIncludes('src/renderer/services/wandaRequest.ts', requestService, 'Host: `${host}:443`')

const loginHeaderBlock = sliceRequired(
  'src/renderer/services/wandaRequest.ts',
  requestService,
  'export function buildWandaLoginHeaders',
  'export async function wandaLoginPost',
  '登录专用请求头函数'
)
assertIncludes('src/renderer/services/wandaRequest.ts', loginHeaderBlock, 'systemVersion: CINEMA_SYSTEM_VERSION')
assertIncludes('src/renderer/services/wandaRequest.ts', loginHeaderBlock, "getRuntimeNumberParam('height', 2200)")
assertIncludes('src/renderer/services/wandaRequest.ts', loginHeaderBlock, 'Content-Length')
assertNotIncludes('src/renderer/services/wandaRequest.ts', loginHeaderBlock, 'X-RY-')
assertNotIncludes('src/renderer/services/wandaRequest.ts', loginHeaderBlock, "_mi_")

const cinemaHeaderBlock = sliceRequired(
  'src/renderer/services/wandaRequest.ts',
  requestService,
  'export function buildCinemaHeaders',
  'export async function wandaCinemaGet',
  '影院专用请求头函数'
)
assertNotIncludes('src/renderer/services/wandaRequest.ts', cinemaHeaderBlock, 'X-RY-')

assertIncludes('src/renderer/stores/accounts.ts', accountsStore, "DEFAULT_WANDA_USER_IDENTIFIER")
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'result.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER')
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'toPlainAccountsData')
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'structuredClone')
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /writeLocalData\('accounts', toPlainAccountsData\(/,
  '账号保存必须先转成可被 Electron IPC 克隆的普通对象'
)

for (const label of ['fetchCinemaShowtime', 'fetchCinemaDetail']) {
  assertIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, label)
}
assertIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, 'wandaCinemaGet')
assertIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, 'WANDA_HOSTS.TICKET')
assertNotIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, 'wandaGet')
assertNotIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, 'assertNotBlank(userIdentifier')

for (const label of ['fetchRealTimeSeat', 'createTicketOrder', 'cancelTicketOrder']) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}
assertNotIncludes('src/renderer/services/seatApi.ts', seatApi, 'wandaCinemaGet')
assertNotIncludes('src/renderer/services/seatApi.ts', seatApi, 'buildCinemaHeaders')

assertIncludes('src/renderer/services/seatApi.ts', seatApi, 'WANDA_API_PATHS.ORDER_CREATE_TICKET')
assertIncludes('src/renderer/services/seatApi.ts', seatApi, "replaceAll('%7C', '|')")
assertIncludes('src/renderer/services/seatApi.ts', seatApi, 'totalPrice <= 0')
assertNotIncludes(
  'src/renderer/services/seatApi.ts',
  seatApi.replaceAll('WANDA_API_PATHS.ORDER_CREATE_TICKET', ''),
  'WANDA_API_PATHS.ORDER_CREATE'
)

for (const label of ['sendLoginCode', 'loginWandaAccount', 'checkCurrentLoginStatus', 'requestId']) {
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, label)
}

assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /state\.loginForm\.message\.trim\(\)[\s\S]*?if \(message\)[\s\S]*?return message[\s\S]*?state\.accounts\.find/,
  '登录消息优先于当前账号状态'
)
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /this\.loginForm\.requestId = ''[\s\S]*?this\.loginForm\.requestPhone = ''[\s\S]*?sendVerifyCode\(phone\)[\s\S]*?this\.loginForm\.requestId = result\.requestID[\s\S]*?this\.loginForm\.requestPhone = phone/,
  '验证码请求号绑定当前手机号'
)
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /if \(this\.loginForm\.requestPhone !== phone\)[\s\S]*?请重新获取验证码[\s\S]*?return[\s\S]*?loginWithCode\(phone, code, this\.loginForm\.requestId\)/,
  '登录前校验验证码手机号'
)
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /await this\.saveAccounts\(\)[\s\S]*?this\.loginForm\.message = '登录成功，账号已保存'/,
  '保存成功后再提示账号已保存'
)
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /if \(!result\.ok\)[\s\S]*?throw new Error\(result\.error \|\| '账号保存失败'\)/,
  '本地保存失败向上抛出'
)
assertMatches(
  'src/renderer/stores/accounts.ts',
  accountsStore,
  /let status[\s\S]*?try \{[\s\S]*?status = await checkLoginStatus[\s\S]*?\} catch \(error\)[\s\S]*?account\.status = 'expired'/,
  '状态接口失败才标记账号失效'
)

for (const label of ['@click="accountsStore.sendLoginCode"', '@click="accountsStore.loginWandaAccount"']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertMatches(
  'src/renderer/views/TicketView.vue',
  ticketView,
  /class="full-button"[\s\S]*?:disabled="[\s\S]*?accountsStore\.loginForm\.sending[\s\S]*?accountsStore\.loginForm\.loggingIn[\s\S]*?!accountsStore\.loginForm\.requestId[\s\S]*?"[\s\S]*?@click="accountsStore\.loginWandaAccount"/,
  '登录按钮禁用无 requestId 和 loading 状态'
)

assertIncludes('src/renderer/stores/logs.ts', logsStore, 'addLog')
assertIncludes('src/renderer/stores/logs.ts', logsStore, 'maskAccount')

for (const label of [
  'loadCityData',
  'selectCity',
  'loadCinemaShowtimes',
  'selectMovie',
  'selectDate',
  'setShowtime',
  'showtimeRequestSerial',
  'rawShowtimeData',
  'currentShowtime',
  'showtimeItems'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /canRefreshSeats\(state\)[\s\S]*?state\.currentShowtime/,
  '刷新座位必须依赖真实 currentShowtime'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /const requestSerial = \+\+this\.showtimeRequestSerial[\s\S]*?fetchCinemaShowtime[\s\S]*?requestSerial !== this\.showtimeRequestSerial[\s\S]*?this\.rawShowtimeData =/,
  '影院场次请求防异步串台'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /async loadCinemaShowtimes\(\)[\s\S]*?const accountId = account\.id[\s\S]*?accountId !== useAccountsStore\(\)\.currentAccount\?\.id[\s\S]*?this\.rawShowtimeData =/,
  '影院场次请求必须防账号切换旧响应覆盖'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /resetQueryAfterCityChange\(\)[\s\S]*?\+\+this\.showtimeRequestSerial/,
  '切换城市时失效旧场次请求'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /catch \(error\)[\s\S]*?requestSerial !== this\.showtimeRequestSerial[\s\S]*?cinemaId !== this\.query\.cinema[\s\S]*?accountId !== useAccountsStore\(\)\.currentAccount\?\.id[\s\S]*?this\.showtimeError = message/,
  '场次失败路径防旧影院和旧账号覆盖'
)
for (const label of [
  'showtimeFilmInf',
  'showtimeFilmDateInf',
  'showtimesInf',
  'showtimeList',
  'showtimeId',
  'realtime',
  'filmList',
  'versionLanguage'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of ['CityID', 'CityName', 'CmList', 'CmID', 'CmName', 'MyCmName', 'CmAdd']) {
  assertIncludes('src/main/localData.ts', mainLocalData, label)
}

assertIncludes('src/main/localData.ts', mainLocalData, 'readSeedCityData')
assertIncludes('src/main/localData.ts', mainLocalData, 'process.resourcesPath')
assertIncludes('src/main/localData.ts', mainLocalData, 'continue')
assertIncludes('src/renderer/App.vue', appVue, 'ticketStore.loadCityData()')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, 'allow-create')

for (const label of [
  '@change="ticketStore.selectCity"',
  '@change="ticketStore.loadCinemaShowtimes"',
  '@change="ticketStore.selectMovie"',
  '@change="ticketStore.selectDate"',
  '@change="ticketStore.setShowtime"'
]) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

for (const label of [
  'loadRealTimeSeats',
  'normalizeSeats',
  'toggleSeat',
  'seatNodes',
  'selectedSeatNodes',
  'seatData',
  'loadingSeats',
  'seatRequestSerial'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

for (const label of ['SeatMap', 'SelectedSeatList', '@click="ticketStore.loadRealTimeSeats"']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'fetchRealTimeSeat')
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /function getSeatStatus\(status: unknown\)[\s\S]*?Number\(status\) === 1/,
  '只有 status 1 可选'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /areaPrice\?\.areaCode[\s\S]*?areaPrice\?\.salesPrice[\s\S]*?const areaId = firstText\(area\.areaId, seat\.areaId\)/,
  '使用旧包区域价格和外层 areaId'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /const seatSerial = \+\+this\.seatRequestSerial[\s\S]*?const dId = this\.currentShowtime\.dId[\s\S]*?fetchRealTimeSeat\(dId[\s\S]*?seatSerial !== this\.seatRequestSerial[\s\S]*?this\.currentShowtime\?\.dId !== dId[\s\S]*?accountId !== useAccountsStore\(\)\.currentAccount\?\.id/,
  '座位请求防旧场次和旧账号覆盖'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /async loadRealTimeSeats\(\)[\s\S]*?const accountId = account\.id[\s\S]*?accountId !== useAccountsStore\(\)\.currentAccount\?\.id[\s\S]*?this\.seatData =/,
  '座位请求必须防账号切换旧响应覆盖'
)
const loadRealTimeSeatsBlock = sliceRequired(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  'async loadRealTimeSeats()',
  'toggleSeat(seat: SeatNode)',
  '实时座位加载函数'
)
const loadRealTimeSeatsCatch = sliceRequired(
  'src/renderer/stores/ticket.ts',
  loadRealTimeSeatsBlock,
  'catch (error)',
  'finally',
  '实时座位失败路径'
)

assertMatches(
  'src/renderer/stores/ticket.ts',
  loadRealTimeSeatsCatch,
  /seatSerial !== this\.seatRequestSerial[\s\S]*?this\.currentShowtime\?\.dId !== dId[\s\S]*?accountId !== useAccountsStore\(\)\.currentAccount\?\.id[\s\S]*?return[\s\S]*?const message[\s\S]*?this\.clearSeatData\(\)/,
  '座位失败路径防旧场次和旧账号覆盖'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /if \(!account\?\.ck \|\| !account\.userIdentifier \|\| !this\.currentShowtime\)[\s\S]*?this\.clearSeatData\(\)/,
  '座位前置失败清空旧座位'
)
assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'maxSeatCount: 8')
assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'this.selectedSeatNodes.length < this.maxSeatCount')
assertIncludes('src/renderer/components/SeatMap.vue', seatMap, 'coordx')
assertIncludes('src/renderer/components/SeatMap.vue', seatMap, 'coordy')
assertIncludes('src/renderer/components/SelectedSeatList.vue', selectedSeatList, 'selectedSeats')

for (const label of [
  'createCurrentOrder',
  'cancelCurrentOrder',
  'currentOrderId',
  'orderCreating',
  'orderCancelling',
  'selectedSeatTotalPrice'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', ticketStore, label)
}

assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'createTicketOrder')
assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'cancelTicketOrder')
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /showtimeId:\s*this\.currentShowtime\.dId[\s\S]*?amountCent:\s*Math\.round\(this\.selectedSeatTotalPrice \* 100\)[\s\S]*?seatIds:\s*this\.selectedSeatNodes\.map\(\(seat\) => seat\.seatId\)/,
  '创建订单必须使用当前真实场次、已选座位和分单位总价'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /createTicketOrder\([\s\S]*?snapshot\.showtimeId[\s\S]*?snapshot\.seatIds[\s\S]*?snapshot\.amountCent/,
  '创建订单必须提交真实订单快照'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /if \([\s\S]*?!account\?\.ck[\s\S]*?!account\.userIdentifier[\s\S]*?!account\.phone[\s\S]*?!this\.currentShowtime(?:\?\.dId)?[\s\S]*?this\.selectedSeatNodes\.length === 0[\s\S]*?\) \{/,
  '创建订单必须校验账号、场次和座位'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /if \(this\.currentOrderId \|\| this\.orderCreating\)[\s\S]*?return[\s\S]*?createTicketOrder/,
  '已有订单或正在创建订单时不能重复创建'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /cancelTicketOrder\((?:this\.currentOrderId|orderId), (?:account\.ck|ck), (?:account\.userIdentifier|userIdentifier)\)/,
  '取消订单必须调用真实取消接口'
)
assertMatches(
  'src/renderer/stores/ticket.ts',
  ticketStore,
  /if \(this\.orderCancelling\)[\s\S]*?return[\s\S]*?cancelTicketOrder/,
  '取消订单必须防重复提交'
)

for (const label of ['ticketStore.createCurrentOrder', 'ticketStore.cancelCurrentOrder', 'ticketStore.currentOrder']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertIncludes('src/renderer/stores/ticket.ts', ticketStore, 'handleAccountChanged')
assertIncludes('src/renderer/views/TicketView.vue', ticketView, 'watch(')
assertIncludes('src/renderer/views/TicketView.vue', ticketView, 'ticketStore.handleAccountChanged()')
assertIncludes('src/renderer/views/TicketView.vue', ticketView, '<el-popconfirm')
assertIncludes('src/renderer/views/TicketView.vue', ticketView, '@confirm="ticketStore.createCurrentOrder"')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, '@click="ticketStore.createCurrentOrder"')
assertMatches(
  'src/renderer/views/TicketView.vue',
  ticketView,
  /@click="ticketStore\.cancelCurrentOrder"[\s\S]*?:disabled="ticketStore\.orderCancelling"/,
  '取消订单按钮必须禁用重复点击'
)

const forbidden = [
  /\b1\d{10}\b/,
  /CK:\s*[A-Za-z0-9]/,
  /ck=[A-Za-z0-9]/,
  /token=[A-Za-z0-9]/,
  /password\s*[:=]\s*['"][^'"]+['"]/,
  /secret\s*[:=]\s*['"][^'"]+['"]/
]

for (const [file, content] of [
  ['src/renderer/services/wandaRequest.ts', requestService],
  ['src/renderer/services/wandaAuthApi.ts', authApi],
  ['src/renderer/services/cinemaApi.ts', cinemaApi],
  ['src/renderer/services/seatApi.ts', seatApi],
  ['src/renderer/stores/accounts.ts', accountsStore],
  ['src/renderer/stores/ticket.ts', ticketStore],
  ['src/renderer/views/TicketView.vue', ticketView]
]) {
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      throw new Error(`${file} 疑似包含敏感信息：${pattern}`)
    }
  }
}

console.log('第三阶段请求边界契约检查通过')
