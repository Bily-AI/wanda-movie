import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { RealTimeSeats, TicketOrderResult } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, toFormBody, wandaGet, wandaPost, type WandaBody } from './wandaRequest'

function assertNotBlank(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message)
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
