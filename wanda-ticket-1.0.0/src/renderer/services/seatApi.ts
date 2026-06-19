import CryptoJS from 'crypto-js'

import { WANDA_API_PATHS } from '@shared/wandaCore'
import type {
  CouponItem,
  OrderListResult,
  OrderPayInfoResult,
  OrderRecord,
  OrderStatusResult,
  PaymentActivityItem,
  PaymentActivityResult,
  PaymentCard,
  RealTimeSeats,
  TicketOrderResult,
  TicketOrderSeatRef
} from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, toFormBody, wandaGet, wandaPost, type WandaBody } from './wandaRequest'

const ACTIVITY_AES_KEY = '6f34faeefba8fd39'
const PAYMENT_ACTIVITY_LIST_PATH = `${WANDA_API_PATHS.MKT_ACTIVITY_SECRET}list.api` // /mkt/activity/secret/list.api
const PAYMENT_COUPON_LIST_PATH = `${WANDA_API_PATHS.MKT_ACTIVITY_SECRET}ncoupons.api` // /mkt/activity/secret/ncoupons.api

function assertNotBlank(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value).trim()

    if (text) {
      return text
    }
  }

  return ''
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function centsToYuan(value: unknown): number {
  return Number((toNumber(value) / 100).toFixed(2))
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  const text = toText(value).trim().toLowerCase()

  return text === 'true' || text === '1' || text === 'yes' || text === 'y'
}

function maybeNumber(value: unknown): number | undefined {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function buildSeatPartition(seats: TicketOrderSeatRef[]): string {
  const grouped = new Map<string, string[]>()

  for (const seat of seats) {
    const areaId = seat.areaId.trim()
    const seatId = seat.seatId.trim()

    if (!areaId || !seatId) {
      continue
    }

    const seatIds = grouped.get(areaId) ?? []
    seatIds.push(seatId)
    grouped.set(areaId, seatIds)
  }

  return [...grouped.entries()].map(([areaId, seatIds]) => `${areaId}-${seatIds.join(',')}`).join('|')
}

function buildQueryPath(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const queryString = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')

  return queryString ? `${path}?${queryString}` : path
}

function decryptActivityPayload(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {}
  }

  try {
    const key = CryptoJS.enc.Utf8.parse(ACTIVITY_AES_KEY)
    const ciphertext = CryptoJS.enc.Hex.parse(value.trim())
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

function normalizePaymentActivity(item: unknown, group: Record<string, unknown>): PaymentActivityItem {
  const record = asRecord(item)

  return {
    code: firstText(record.code, record.activityCode, record.activityNo, record.id),
    name: firstText(record.name, record.activityName),
    price: centsToYuan(record.price),
    channelPrice: centsToYuan(record.channelPrice),
    able: toBoolean(record.able),
    groupName: firstText(group.groupName, group.name),
    groupType: firstText(group.groupType, group.type),
    note: firstText(record.note, record.remark, record.desc),
    typeCode: firstText(record.typeCode),
    allotSeat: firstText(record.allotSeat, record.allotseat),
    raw: item
  }
}

function normalizePaymentCard(item: unknown): PaymentCard {
  const record = asRecord(item)

  return {
    cardNo: firstText(record.cardNo, record.card_no, record.no),
    cardName: firstText(record.cardName, record.name),
    cardTypeName: firstText(record.cardTypeName, record.typeName),
    balance: centsToYuan(record.balance),
    available: toBoolean(record.available ?? record.able),
    statusDesc: firstText(record.statusDesc, record.status),
    raw: item
  }
}

function normalizeCoupon(item: unknown): CouponItem {
  const record = asRecord(item)

  return {
    code: firstText(record.code, record.couponCode),
    name: firstText(record.name, record.couponName),
    couponNo: firstText(record.couponNo, record.no),
    typeCode: firstText(record.typeCode),
    able: toBoolean(record.able),
    amount: centsToYuan(record.amount ?? record.price),
    validity: firstText(record.validityDateShowMsg, record.validity),
    detailTypeName: firstText(record.detailtypename, record.detailTypeName, record.couponTypeName),
    raw: item
  }
}

function normalizeOrderStatus(value: unknown): OrderStatusResult {
  const record = asRecord(value)
  const data = asRecord(record.data)
  const orderInf = asRecord(data.orderInf)
  const rawStatus = Object.keys(orderInf).length > 0 ? orderInf : data
  const result: OrderStatusResult = { raw: value }
  const bizCode = maybeNumber(record.code ?? data.bizCode)
  const bizMsg = firstText(record.msg, data.bizMsg)

  if (bizCode !== undefined) {
    result.bizCode = bizCode
  }

  if (bizMsg) {
    result.bizMsg = bizMsg
  }

  if (typeof rawStatus.payStatus === 'string' || typeof rawStatus.payStatus === 'number') {
    result.payStatus = rawStatus.payStatus
  }

  if (typeof rawStatus.showOrderStatus === 'string' || typeof rawStatus.showOrderStatus === 'number') {
    result.showOrderStatus = rawStatus.showOrderStatus
  }

  const showOrderStatusStr = firstText(rawStatus.showOrderStatusStr)

  if (showOrderStatusStr) {
    result.showOrderStatusStr = showOrderStatusStr
  }

  return result
}

function getOrderStatus(
  payStatus: unknown,
  showOrderStatus: unknown,
  statusText: string
): OrderRecord['status'] {
  const text = statusText.toLowerCase()
  const payStatusValue = Number(payStatus)
  const showOrderStatusValue = Number(showOrderStatus)

  if (text.includes('退') || payStatusValue === 4 || showOrderStatusValue === 4) {
    return 'refunded'
  }

  if (text.includes('取消') || payStatusValue === 5 || showOrderStatusValue === 5) {
    return 'cancelled'
  }

  if (text.includes('完成') || text.includes('成功') || payStatusValue === 3 || showOrderStatusValue === 3) {
    return 'completed'
  }

  if (text.includes('待') || payStatusValue === 1 || showOrderStatusValue === 1) {
    return 'pending'
  }

  return 'unknown'
}

function normalizeOrderRecord(item: unknown, phone: string): OrderRecord {
  const record = asRecord(item)
  const ticketInfo = asRecord(asList(record.subTicketOrderInfo)[0])
  const cinemaInfo = asRecord(ticketInfo.orderInf)
  const movie = asRecord(asList(asRecord(cinemaInfo.movies).movie)[0])
  const statusText = firstText(record.showOrderStatusStr, record.statusText, record.statusName)
  const status = getOrderStatus(record.payStatus, record.showOrderStatus, statusText)

  return {
    orderId: firstText(record.orderId, record.id),
    orderNo: firstText(record.orderNo, record.orderId),
    phone: firstText(record.phone, record.mobile, phone),
    movieName: firstText(movie.name, movie.movieName, record.movieName),
    cinema: firstText(cinemaInfo.cinameName, cinemaInfo.cinemaName, record.cinemaName),
    showtime: firstText(movie.showTime, movie.showtime, record.showTime),
    amount: centsToYuan(record.realPay ?? record.salesAmount ?? record.amount),
    status,
    statusText: statusText || status,
    createdAt: firstText(record.createTime, record.createdAt, record.orderTime),
    raw: item
  }
}

function collectPaymentGroups(payload: Record<string, unknown>): unknown[] {
  const res = payload.res
  const resRecord = asRecord(res)

  return [
    ...asList(res),
    ...asList(resRecord.groups),
    ...asList(resRecord.groupList),
    ...asList(resRecord.activityList)
  ]
}

function collectGroupItems(group: Record<string, unknown>): unknown[] {
  return [...asList(group.groupItems), ...asList(group.items), ...asList(group.activityList)]
}

function collectCoupons(payload: Record<string, unknown>): unknown[] {
  const res = asRecord(payload.res)

  return [...asList(res.coupons), ...asList(res.couponList), ...asList(payload.coupons), ...asList(payload.couponList)]
}

function collectOrderRecords(data: Record<string, unknown>): unknown[] {
  return [
    ...asList(data.listOrderInf),
    ...asList(data.orderInf),
    ...asList(data.records),
    ...asList(data.orders),
    ...asList(data.list)
  ]
}

function textList(value: unknown, objectKeys: string[]): string[] {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]

  return items
    .map((item) => {
      const record = asRecord(item)

      if (Object.keys(record).length > 0) {
        return firstText(...objectKeys.map((key) => record[key]))
      }

      return firstText(item)
    })
    .filter(Boolean)
}

function firstListRecord(value: unknown): Record<string, unknown> {
  return asRecord(Array.isArray(value) ? value[0] : value)
}

function extractPayInfo(orderId: string, response: unknown): OrderPayInfoResult {
  const data = asRecord(asRecord(response).data)
  const directTicketInfo = firstListRecord(data.subTicketOrderInfo)
  const orderInf = firstListRecord(data.orderInf)
  const ticketInfo = firstListRecord(orderInf.subTicketOrderInfo)
  const source = Object.keys(ticketInfo).length > 0 ? ticketInfo : Object.keys(directTicketInfo).length > 0 ? directTicketInfo : data

  return {
    orderId,
    ticketCodes: textList(source.electronicCode ?? source.ticketCodes ?? source.ticketCode, [
      'code',
      'ticketCode',
      'electronicCode',
      'value'
    ]),
    qrCodes: textList(source.electronicQR ?? source.qrCodes ?? source.qrCode, [
      'qr',
      'qrCode',
      'electronicQR',
      'value'
    ]),
    raw: response
  }
}

export async function fetchRealTimeSeat(dId: string, ck: string, userIdentifier: string): Promise<RealTimeSeats> {
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<{ realtimeSeats?: RealTimeSeats }>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_REAL_TIME_SEAT,
    { dId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 || !response.data?.realtimeSeats) {
    throw new Error(response.msg || '座位数据获取失败')
  }

  return response.data.realtimeSeats
}

export async function createTicketOrder(
  dId: string,
  seatIds: string[],
  totalPrice: number,
  mobile: string,
  ck: string,
  userIdentifier: string
): Promise<TicketOrderResult> {
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(mobile, '手机号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  if (seatIds.length === 0 || seatIds.some((seatId) => !seatId.trim())) {
    throw new Error('座位 ID 不能为空')
  }

  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new Error('订单金额必须大于 0')
  }

  const body: WandaBody = {
    retailerCode: 'MX',
    mobile,
    seatId: seatIds.join('|'),
    totalPrice,
    dId
  }
  const signatureBody = toFormBody(body).replaceAll('%7C', '|')

  const response = await wandaPost<TicketOrderResult>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_CREATE_TICKET,
    body,
    ck,
    userIdentifier,
    { signatureBody }
  )
  const data = response.data

  if (response.code !== 0 || !data || data.bizCode !== 0 || !data.orderId) {
    throw new Error(data?.bizMsg || response.msg || '创建订单失败')
  }

  return data
}

export async function cancelTicketOrder(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<TicketOrderResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<TicketOrderResult>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_CANCEL,
    { orderId },
    ck,
    userIdentifier
  )
  const data = response.data

  if (response.code !== 0 || !data || data.bizCode !== 0) {
    throw new Error(data?.bizMsg || response.msg || '取消订单失败')
  }

  return data
}

export async function fetchPaymentActivity(
  seats: TicketOrderSeatRef[],
  orderId: string,
  dId: string,
  ck: string,
  userIdentifier: string
): Promise<PaymentActivityResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const partition = buildSeatPartition(seats)

  assertNotBlank(partition, '座位不能为空')

  const path = buildQueryPath(PAYMENT_ACTIVITY_LIST_PATH, {
    partition,
    orderId,
    did: dId
  })
  const response = await wandaGet<unknown>(WANDA_HOSTS.MKT_ACTIVITY, path, {}, ck, userIdentifier)

  if (response.code !== 0 || !response.data) {
    return { availableActivities: [], unavailableActivities: [] }
  }

  const decrypted = decryptActivityPayload(response.data)
  const availableActivities: PaymentActivityItem[] = []
  const unavailableActivities: PaymentActivityItem[] = []

  for (const group of collectPaymentGroups(decrypted)) {
    const groupRecord = asRecord(group)

    for (const item of collectGroupItems(groupRecord)) {
      const activity = normalizePaymentActivity(item, groupRecord)

      if (activity.able) {
        availableActivities.push(activity)
      } else {
        unavailableActivities.push(activity)
      }
    }
  }

  return { availableActivities, unavailableActivities }
}

export async function fetchPayCards(orderId: string, ck: string, userIdentifier: string): Promise<PaymentCard[]> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CARD,
    WANDA_API_PATHS.CARD_PAY_LIST,
    { orderId },
    ck,
    userIdentifier
  )
  const data = asRecord(response.data)

  if (response.code !== 0 || toNumber(data.bizCode, -1) !== 0) {
    return []
  }

  return [...asList(response.data), ...asList(data.cards), ...asList(data.cardList), ...asList(data.list)]
    .map(normalizePaymentCard)
    .filter((card) => card.available)
}

export async function fetchCoupons(
  seats: TicketOrderSeatRef[],
  cinemaId: string,
  dId: string,
  ck: string,
  userIdentifier: string
): Promise<CouponItem[]> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(dId, '场次 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const partition = buildSeatPartition(seats)

  assertNotBlank(partition, '座位不能为空')

  const path = buildQueryPath(PAYMENT_COUPON_LIST_PATH, {
    partition,
    cinemaId,
    latitude: '',
    did: dId,
    able: true,
    longitude: '',
    coordinateType: 2
  })
  const response = await wandaGet<unknown>(WANDA_HOSTS.MKT_ACTIVITY, path, {}, ck, userIdentifier)

  if (response.code !== 0 || !response.data) {
    return []
  }

  const decrypted = decryptActivityPayload(response.data)
  return collectCoupons(decrypted).map(normalizeCoupon).filter((coupon) => coupon.able)
}

export async function queryOrderStatus(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<OrderStatusResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_STATUS,
    { orderId },
    ck,
    userIdentifier
  )

  return normalizeOrderStatus(response)
}

export async function queryOrderList(
  pageIndex: number,
  pageSize: number,
  phone: string,
  ck: string,
  userIdentifier: string
): Promise<OrderListResult> {
  assertNotBlank(phone, '手机号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_LIST,
    { busiType: 3, pageIndex, pageSize, timeLeagth: 0 },
    ck,
    userIdentifier
  )
  const data = asRecord(response.data)
  const records = collectOrderRecords(data).map((item) => normalizeOrderRecord(item, phone))

  return {
    records,
    total: toNumber(data.totalCount ?? data.total ?? data.count, records.length),
    raw: response
  }
}

export async function queryOrderByUserId(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<OrderPayInfoResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_BY_USER_ID,
    { orderId, timeLeagth: 0 },
    ck,
    userIdentifier
  )

  return extractPayInfo(orderId, response)
}

export async function queryPayInfoUpgrade(
  orderId: string,
  requestInfo: string,
  ck: string,
  userIdentifier: string
): Promise<OrderPayInfoResult> {
  assertNotBlank(orderId, '订单 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_QUERY_PAY_INFO,
    { orderId, requestInfo },
    ck,
    userIdentifier
  )

  return extractPayInfo(orderId, response)
}
