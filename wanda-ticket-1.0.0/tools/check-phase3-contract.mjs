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
const ticketView = read('src/renderer/views/TicketView.vue')

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

for (const label of ['@click="accountsStore.sendLoginCode"', '@click="accountsStore.loginWandaAccount"']) {
  assertIncludes('src/renderer/views/TicketView.vue', ticketView, label)
}

assertIncludes('src/renderer/stores/logs.ts', logsStore, 'addLog')
assertIncludes('src/renderer/stores/logs.ts', logsStore, 'maskAccount')

console.log('第三阶段请求边界契约检查通过')
