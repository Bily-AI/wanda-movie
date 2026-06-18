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

const packageJson = read('package.json')
const ipc = read('src/shared/ipc.ts')
const core = read('src/shared/wandaCore.ts')
const types = read('src/shared/wandaTicketTypes.ts')
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

assertIncludes('package.json', packageJson, '"check:phase3"')
assertIncludes('src/shared/ipc.ts', ipc, 'Record<string, unknown> | string')
assertIncludes('src/shared/wandaCore.ts', core, 'ORDER_CREATE_TICKET')
assertIncludes('src/shared/wandaCore.ts', core, '/order/create_order.api')
assertIncludes('src/shared/wandaCore.ts', core, "typeof request.body !== 'string'")

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

for (const label of ['buildWandaUrl', 'toFormBody', 'wandaGet', 'wandaPost', 'buildWandaHeaders']) {
  assertIncludes('src/renderer/services/wandaRequest.ts', requestService, label)
}

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

assertIncludes('src/renderer/services/wandaAuthApi.ts', authApi, "cinemaId: ''")

for (const label of ['fetchCinemaShowtime', 'fetchCinemaDetail']) {
  assertIncludes('src/renderer/services/cinemaApi.ts', cinemaApi, label)
}

for (const label of ['fetchRealTimeSeat', 'createTicketOrder', 'cancelTicketOrder']) {
  assertIncludes('src/renderer/services/seatApi.ts', seatApi, label)
}

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

console.log('第三阶段请求边界契约检查通过')
