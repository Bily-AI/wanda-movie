import type { WandaHttpRequest } from './ipc'

export const WANDA_HOSTS = {
  USER: 'user-api-prd-mx.wandafilm.com',
  CINEMA: 'cinema-api-prd-mx.wandafilm.com',
  TICKET: 'ticket-api-prd-mx.wandafilm.com',
  GATEWAY: 'front-gateway-c.wandafilm.com',
  CARD: 'card-api-prd-mx.wandafilm.com',
  COUPON: 'coupon-api-prd-mx.wandafilm.com',
  MKT_ACTIVITY: 'mkt-activity-api-prd-mx.wandafilm.com'
} as const

export const AUTO_ORDER_HOSTS = {
  MAHUA: 'mhdyp.com',
  HAHA: 'hahapiao.cn'
} as const

export const LEGACY_EXTERNAL_HOSTS = {
  COUPON_SHARE: 'qp.sxjrj.cn'
} as const

export const WANDA_API_PATHS = {
  USER_LOGIN_VERIFY_CODE: '/user/login_verify_code.api',
  USER_LOGIN: '/user/login.api',
  USER_IS_LOGIN: '/user/islogin.api',
  SHOWTIME_BY_CINEMA: '/showtime/by_cinema.api',
  CINEMA_BY_CINEMA_ID: '/cinema/by_cinemaid.api',
  ORDER_REAL_TIME_SEAT: '/order/real_time_seat.api',
  ORDER_CREATE_TICKET: '/order/create_order.api',
  ORDER_CREATE: '/order/create.api',
  ORDER_CANCEL: '/order/cancel.api',
  ORDER_REFUND: '/order/refund_order.api',
  ORDER_PREPAY: '/order/prepay.api',
  ORDER_MERGE_PAYMENT: '/order/merge_payment.api',
  ORDER_STATUS: '/order/order_status.api',
  ORDER_QUERY_LIST: '/order/query_order_list.api',
  ORDER_QUERY_BY_USER_ID: '/order/query_by_userid.api',
  ORDER_QUERY_PAY_INFO: '/order/query_pay_info_upgrade.api',
  CARD_PAY_LIST: '/card/pay/list.api',
  CARD_USER_CARD_LIST: '/card/user_card/list.api',
  CARD_TRANSFER: '/card/transfer.version',
  CARD_RECHARGE: '/card/recharge.version',
  COUPON_MEMBER_GROUP_LIST: '/coupon/member/grouplist.api',
  COUPON_BIND: '/coupon/bind.api',
  COUPON_PRESENT: '/coupon/present/',
  MEMBER_GRADE: '/member/grade/',
  WPLUS_MEMBER_PLUS_DETAIL: '/wplus/member/plusDetail.api',
  WPLUS_RIGHT_RECEIVE: '/right/plus/order/receive',
  WPLUS_EXCHANGE_INFO: '/right/plus/order/sale/get_exchange_info_2023',
  MKT_ACTIVITY_SECRET: '/mkt/activity/secret/',
  PACK_ACTIVITY: '/pack_activity/activity/',
  PACK_ACTIVITY_CREATE_ORDER: '/pack_activity/activity/create_order.api',
  GIFT_ORDERS: '/giftshop/orders',
  GIFT_ORDER_DETAIL: '/giftshop/orders/detail',
  GIFT_TRANSACTION_CREATE: '/giftshop/transactions/create',
  GIFT_TRANSACTION_DETAIL: '/giftshop/transactions/detail',
  SIGN_IN_CALENDAR: '/sign_in/calendar.api'
} as const

export const AUTO_ORDER_API_PATHS = {
  MAHUA_BIDDING_ORDER_LIST: '/api/movie-server/movie/bidding/order/list',
  MAHUA_ORDER_LIST: '/api/movie-server/movie/get/order/list',
  MAHUA_ORDER_CONFIRM: '/api/movie-server/movie/get/order/confirm',
  HAHA_ORDER_LIST: '/api/Synchro/getOrderList',
  HAHA_ORDER_CONFIRM: '/api/Synchro/orderConfirm'
} as const

export const LEGACY_EXTERNAL_API_PATHS = {
  COUPON_SHARE_CREATE: '/sc.php'
} as const

const wandaHostValues: ReadonlySet<string> = new Set(Object.values(WANDA_HOSTS))
const autoOrderHostValues: ReadonlySet<string> = new Set(Object.values(AUTO_ORDER_HOSTS))
const legacyExternalHostValues: ReadonlySet<string> = new Set(Object.values(LEGACY_EXTERNAL_HOSTS))
const exactPathValues: readonly string[] = Object.values(WANDA_API_PATHS).filter((value) => !value.endsWith('/'))
const prefixPathValues: readonly string[] = Object.values(WANDA_API_PATHS).filter((value) => value.endsWith('/'))
const autoOrderExactPathValues: readonly string[] = Object.values(AUTO_ORDER_API_PATHS)
const legacyExternalExactPathValues: readonly string[] = Object.values(LEGACY_EXTERNAL_API_PATHS)
const blockedWandaPaymentKeywords: readonly string[] = ['alipay']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function includesBlockedWandaPaymentKeyword(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase()

    return blockedWandaPaymentKeywords.some((keyword) => normalizedValue.includes(keyword))
  }

  if (Array.isArray(value)) {
    return value.some((item) => includesBlockedWandaPaymentKeyword(item))
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => includesBlockedWandaPaymentKeyword(item))
  }

  return false
}

export function parseWandaUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

export function isKnownWandaPath(pathname: string): boolean {
  return exactPathValues.includes(pathname) || prefixPathValues.some((prefix) => pathname.startsWith(prefix))
}

export function isKnownAutoOrderPath(pathname: string): boolean {
  return autoOrderExactPathValues.includes(pathname)
}

export function validateWandaRequest(request: WandaHttpRequest): string | null {
  if (!isRecord(request)) {
    return '万达请求参数必须是对象'
  }

  if (!request.url || typeof request.url !== 'string') {
    return '万达请求缺少 url'
  }

  const parsedUrl = parseWandaUrl(request.url)

  if (!parsedUrl) {
    return '万达请求 url 格式无效'
  }

  const isWandaHost = wandaHostValues.has(parsedUrl.hostname)
  const isAutoOrderHost = autoOrderHostValues.has(parsedUrl.hostname)
  const isLegacyExternalHost = legacyExternalHostValues.has(parsedUrl.hostname)

  if (!isWandaHost && !isAutoOrderHost && !isLegacyExternalHost) {
    return '万达请求 host 不在旧版接口白名单内'
  }

  if (isWandaHost && includesBlockedWandaPaymentKeyword(`${parsedUrl.pathname}${parsedUrl.search}`)) {
    return '禁止发起支付宝相关请求'
  }

  if (isWandaHost && !isKnownWandaPath(parsedUrl.pathname)) {
    return '万达请求 path 不在旧版接口白名单内'
  }

  if (request.headers !== undefined && !isRecord(request.headers)) {
    return '万达请求 headers 必须是对象'
  }

  if (request.params !== undefined && !isRecord(request.params)) {
    return '万达请求 params 必须是对象'
  }

  if (isWandaHost && request.params !== undefined && includesBlockedWandaPaymentKeyword(request.params)) {
    return '禁止发起支付宝相关请求'
  }

  if (isAutoOrderHost && !isKnownAutoOrderPath(parsedUrl.pathname)) {
    return '自动接单 path 不在旧版接口白名单内'
  }

  if (request.body !== undefined && !isRecord(request.body) && typeof request.body !== 'string') {
    return '万达请求 body 必须是对象或字符串'
  }

  if (isWandaHost && request.body !== undefined && includesBlockedWandaPaymentKeyword(request.body)) {
    return '禁止发起支付宝相关请求'
  }

  return null
}
