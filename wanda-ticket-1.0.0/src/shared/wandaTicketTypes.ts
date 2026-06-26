export interface WandaApiResponse<T = unknown> {
  code?: number
  msg?: string
  success?: boolean
  data?: T
}

export interface WandaLoginRequestId {
  requestID: string
}

export interface WandaLoginResult {
  userToken: string
  userIdentifier: string
  mobile?: string
  isPayMember?: boolean
}

export interface WandaLoginStatus {
  success: boolean
  userInfo?: {
    mobile?: string
    userIdentifier?: string
    isPayMember?: boolean
  }
}

export interface CityRecord {
  id: string
  name: string
  pinyin?: string
  firstLetter?: string
  raw: unknown
}

export interface CinemaRecord {
  id: string
  cityId: string
  name: string
  address?: string
  pinyin?: string
  firstLetter?: string
  maoyanName?: string
  raw: unknown
}

export interface ShowtimeFilm {
  filmId: string
  filmName: string
  raw: unknown
}

export interface ShowtimeDate {
  date: string
  label: string
  raw: unknown
}

export interface ShowtimeItem {
  dId: string
  label: string
  startTime?: string
  hallName?: string
  filmId: string
  date: string
  raw: unknown
}

export interface SeatArea {
  areaId: string | number
  areaPrice?: {
    areaCode?: string | number
    salesPrice?: number
  }
  seat?: RawSeat[]
}

export interface RealTimeSeats {
  area: SeatArea[]
}

export interface RawSeat {
  row: string | number
  column: string | number
  coordx: number
  coordy: number
  status: number
  seatId: string | number
  areaId?: string | number
}

export type SeatStatus = 'available' | 'occupied' | 'selected'
export type SeatZone = 'normal' | 'preferred' | 'vip' | 'couple' | 'wplus' | 'discount'

export interface SeatNode {
  id: string
  rowLabel: string
  columnLabel: string
  coordx: number
  coordy: number
  status: SeatStatus
  zone: SeatZone
  price: number
  seatId: string
  areaId: string
  raw: RawSeat
}

export interface TicketOrderResult {
  orderId: string
  bizCode: number
  bizMsg?: string
  requestInfo?: unknown
  raw?: unknown
}

export interface TicketOrderSeatRef {
  areaId: string
  seatId: string
  rowName: string
  columnName: string
  areaName: string
}

export interface TicketOrderContext {
  orderId: string
  accountId: string
  phone: string
  cityName: string
  cinemaId: string
  cinemaName: string
  movieName: string
  showtimeId: string
  showtimeLabel: string
  amountCent: number
  seats: TicketOrderSeatRef[]
  requestInfo?: unknown
}

export interface TicketPaymentSubmitRequest {
  cinemaId: string
  mobilePhone: string
  orderId: string
  requestInfo: unknown
}

export interface TicketPaymentSubmitResult {
  orderId: string
  bizCode?: number
  bizMsg?: string
  tradeNo?: string
  requestInfo: unknown
  payInfo?: unknown
  raw: unknown
}

export interface PaymentActivityItem {
  code: string
  name: string
  price: number
  channelPrice: number
  able: boolean
  groupName: string
  groupType: string
  note: string
  typeCode: string
  detailType: string
  allotSeat: unknown
  allotSeatRaw: string
  raw: unknown
}

export type PaymentActivity = PaymentActivityItem

export interface PaymentActivityResult {
  availableActivities: PaymentActivityItem[]
  unavailableActivities: PaymentActivityItem[]
}

export interface PaymentCard {
  cardNo: string
  cardName: string
  cardTypeName: string
  cardTypeCode: string
  balance: number
  available: boolean
  statusDesc: string
  raw: unknown
}

export interface CouponItem {
  code: string
  name: string
  couponNo: string
  voucherNo: string
  couponTypeName: string
  typeCode: string
  able: boolean
  amount: number
  validity: string
  detailTypeName: string
  couponCategoryName: string
  raw: unknown
}

export interface CouponSelectionResult {
  allotSeat: string
  voucher: string
  raw: unknown
}

export interface CouponPaymentListItem {
  actuallyPaidAmount: number
  payPrice?: number
  rightsCode: string
  seat?: string | number
  seatId: number
  ticketCode: string
  ticketType: number
  usedCoupon: number
}

export interface CouponUseResult {
  price: number
  itemList: CouponPaymentListItem[]
  raw: unknown
}

export interface OrderStatusResult {
  bizCode?: number
  bizMsg?: string
  payStatus?: string | number
  showOrderStatus?: string | number
  showOrderStatusStr?: string
  raw: unknown
}

export type NormalizedOrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded' | 'unknown'

export interface OrderRecord {
  orderId: string
  orderNo: string
  phone: string
  movieName: string
  cinema: string
  showtime: string
  amount: number
  status: NormalizedOrderStatus
  statusText: string
  createdAt: string
  raw: unknown
}

export type OrderListItem = OrderRecord

export interface OrderListResult {
  records: OrderListItem[]
  total: number
  raw: unknown
}

export interface OrderPayInfoResult {
  orderId: string
  ticketCodes: string[]
  qrCodes: string[]
  payInfo?: unknown
  raw: unknown
}
