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
}
