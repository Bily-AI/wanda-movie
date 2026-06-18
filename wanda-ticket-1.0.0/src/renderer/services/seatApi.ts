import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { RealTimeSeats, TicketOrderResult } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, wandaGet, wandaPost } from './wandaRequest'

export async function fetchRealTimeSeat(dId: string, ck: string, userIdentifier: string): Promise<RealTimeSeats> {
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
  const response = await wandaPost<TicketOrderResult>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.ORDER_CREATE_TICKET,
    {
      retailerCode: 'MX',
      mobile,
      seatId: seatIds.join('|'),
      totalPrice,
      dId
    },
    ck,
    userIdentifier
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
