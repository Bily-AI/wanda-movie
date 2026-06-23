import { defineStore } from 'pinia'

import { fetchCinemaShowtime } from '@renderer/services/cinemaApi'
import {
  cancelTicketOrder,
  createTicketOrder,
  fetchCoupons,
  fetchCouponUsePayment,
  fetchPayCards,
  fetchPaymentActivity,
  fetchRealTimeSeat,
  queryOrderByUserId,
  queryPayInfoUpgrade,
  queryOrderStatus,
  selectCouponsForPayment,
  submitTicketPayment
} from '@renderer/services/seatApi'
import { parseOcrTicketText, type ParsedOcrTicket } from '@shared/ocrParser'
import type { AiOcrParsedTicket } from '@shared/ipc'
import type {
  CinemaRecord,
  CityRecord,
  CouponItem,
  CouponSelectionResult,
  CouponUseResult,
  OrderPayInfoResult,
  OrderStatusResult,
  PaymentActivity,
  PaymentCard,
  RawSeat,
  RealTimeSeats,
  SeatArea,
  SeatNode,
  SeatStatus,
  SeatZone,
  ShowtimeItem,
  TicketOrderContext,
  TicketPaymentSubmitResult,
  TicketOrderSeatRef
} from '@shared/wandaTicketTypes'
import { useAccountsStore } from './accounts'
import { useLogsStore } from './logs'

export interface TicketOption {
  label: string
  value: string
}

export interface SelectedSeat {
  id: string
  rowName: string
  columnName: string
  areaName: string
}

interface TicketOrderContextSnapshot {
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

interface TicketOrderSubmitSnapshot extends TicketOrderContextSnapshot {
  accountId: string
  phone: string
  ck: string
  userIdentifier: string
  seatIds: string[]
}

interface TicketStoredCardPayment {
  cardNumber: string
  paymentPrice: number
  paymentType: number
  ticketType: string
  ticketTypeName: string
}

interface BuiltTicketPaymentRequestInfo {
  contextId: string
  currentPrice: number
  externalPayment: {
    paySdkId: number
    paymentPrice: number
    paymentType: number
    returnUrl: string
  }
  goodInfo: string
  orderId: string
  verifyCode: string
  activity?: unknown
  cardPayment?: TicketStoredCardPayment
  storedCardPayments?: TicketStoredCardPayment[]
  ticketVoucher?: {
    discountPrice: number
    voucher: string
  }
  couponPaymentList?: CouponUseResult['itemList']
}

interface TicketCouponPaymentInfo {
  selection: CouponSelectionResult
  useResult: CouponUseResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function formatShowtimeTime(value: unknown): string {
  const text = toText(value).trim()

  if (!/^\d{10,13}$/.test(text)) {
    return text
  }

  const timestamp = Number(text.length === 10 ? `${text}000` : text)
  const date = new Date(timestamp)

  if (!Number.isFinite(date.getTime())) {
    return text
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date)
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function getNestedList(record: Record<string, unknown>, key: string, childKey: string): unknown[] {
  const child = asRecord(record[key])
  return asList(child[childKey])
}

function getShowtimeRoot(raw: unknown): Record<string, unknown> {
  const root = asRecord(raw)
  const data = asRecord(root.data)

  return Object.keys(data).length > 0 ? data : root
}

function getShowtimeFilmList(raw: unknown): unknown[] {
  const root = getShowtimeRoot(raw)
  const movies = asRecord(root.movies)

  return [
    ...asList(root.showtimeFilmInf),
    ...asList(root.filmList),
    ...asList(root.movies),
    ...asList(movies.movie)
  ]
}

function getDateList(film: Record<string, unknown>): unknown[] {
  return [
    ...asList(film.showtimeFilmDateInf),
    ...asList(film.dateList),
    ...asList(film.dates)
  ]
}

function getShowtimeList(dateRecord: Record<string, unknown>): unknown[] {
  return [
    ...getNestedList(dateRecord, 'showtimesInf', 'showtimeList'),
    ...asList(dateRecord.showtimeList),
    ...asList(dateRecord.showtimes),
    ...asList(dateRecord.sessions),
    ...asList(dateRecord.timeList)
  ]
}

function firstShowtimeFilm(record: Record<string, unknown>): Record<string, unknown> {
  const filmList = asList(record.filmList)
  const movieList = asList(asRecord(record.movies).movie)
  return asRecord(filmList[0] ?? movieList[0])
}

function optionDedupe(options: TicketOption[]): TicketOption[] {
  const seen = new Set<string>()

  return options.filter((item) => {
    if (seen.has(item.value)) {
      return false
    }

    seen.add(item.value)
    return true
  })
}

function showtimeFilmName(film: Record<string, unknown>): string {
  const directName = firstText(film.filmName, film.movieName, film.name)

  if (directName) {
    return directName
  }

  for (const date of getDateList(film)) {
    for (const showtime of getShowtimeList(asRecord(date))) {
      const showtimeFilm = firstShowtimeFilm(asRecord(showtime))
      const name = firstText(showtimeFilm.filmName, showtimeFilm.movieName, showtimeFilm.name)

      if (name) {
        return name
      }
    }
  }

  return ''
}

function filmMatches(film: unknown, filmId: string): boolean {
  const record = asRecord(film)
  return firstText(record.filmId, record.movieId, record.id, showtimeFilmName(record)) === filmId
}

function getSeatStatus(status: unknown): SeatStatus {
  return Number(status) === 1 ? 'available' : 'occupied'
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function yuanToCents(value: unknown): number {
  return Math.max(0, Math.round(toNumber(value) * 100))
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase()
}

function compactMatchText(value: string): string {
  return normalizeKeyword(value).replace(/[\s()（）【】[\]《》<>:：,，.。·\-_/]/g, '')
}

function fuzzyIncludes(left: string, right: string): boolean {
  const normalizedLeft = compactMatchText(left)
  const normalizedRight = compactMatchText(right)

  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  )
}

function findUnique<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  const matched = items.filter(predicate)

  return matched.length === 1 ? matched[0] : undefined
}

function findUniqueOptionByText(options: TicketOption[], text: string): TicketOption | undefined {
  return findUnique(options, (option) => fuzzyIncludes(option.label, text) || fuzzyIncludes(option.value, text))
}

function findUniqueCinemaByText(cinemas: CinemaRecord[], text: string): CinemaRecord | undefined {
  return findUnique(cinemas, (cinema) => fuzzyIncludes(cinema.name, text))
}

function needsAiOcrFallback(parsed: ParsedOcrTicket): boolean {
  return Boolean(
    !parsed.cinemaName ||
      !parsed.movieName ||
      !parsed.date ||
      !parsed.time ||
      parsed.seats.length === 0
  )
}

function mergeAiOcrParsedTicket(parsed: ParsedOcrTicket, aiParsed: AiOcrParsedTicket): ParsedOcrTicket {
  return {
    ...parsed,
    cinemaName: parsed.cinemaName || aiParsed.cinemaName || '',
    movieName: parsed.movieName || aiParsed.movieName || '',
    date: parsed.date || aiParsed.date || '',
    time: parsed.time || aiParsed.time || '',
    hallName: parsed.hallName || aiParsed.hallName || '',
    language: parsed.language || aiParsed.language || '',
    price: parsed.price || aiParsed.price || '',
    seats: parsed.seats.length > 0 ? parsed.seats : aiParsed.seats ?? []
  }
}

function optionMatchesDate(option: TicketOption, date: string): boolean {
  return option.value === date || option.label === date || option.value.includes(date) || option.label.includes(date)
}

function optionMatchesTime(option: TicketOption, time: string): boolean {
  return option.value.includes(time) || option.label.includes(time)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function matchesSearchKeyword(
  record: Pick<CityRecord | CinemaRecord, 'name' | 'pinyin' | 'firstLetter'> & { address?: string },
  keyword: string
): boolean {
  if (!keyword) {
    return true
  }

  return [record.name, record.pinyin, record.firstLetter, record.address]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(keyword))
}

export const useTicketStore = defineStore('ticket', {
  state: () => ({
    query: {
      keyword: '',
      city: '',
      cinema: '',
      movie: '',
      date: '',
      showtime: ''
    },
    cities: [] as TicketOption[],
    cinemas: [] as TicketOption[],
    movies: [] as TicketOption[],
    dates: [] as TicketOption[],
    showtimes: [] as TicketOption[],
    cityRecords: [] as CityRecord[],
    cinemaRecords: [] as CinemaRecord[],
    rawShowtimeData: null as unknown,
    currentShowtime: null as ShowtimeItem | null,
    loadingShowtimes: false,
    showtimeRequestSerial: 0,
    showtimeItems: [] as ShowtimeItem[],
    showtimeError: '',
    seatData: null as RealTimeSeats | null,
    seatNodes: [] as SeatNode[],
    selectedSeatNodes: [] as SeatNode[],
    loadingSeats: false,
    seatRequestSerial: 0,
    seatError: '',
    currentOrderId: '',
    currentOrderMessage: '',
    currentOrderAccountId: '',
    currentOrder: null as TicketOrderContext | null,
    currentOrderFinalized: false,
    currentOrderPayInfo: null as OrderPayInfoResult | null,
    orderStatus: null as OrderStatusResult | null,
    orderCreating: false,
    orderCancelling: false,
    orderRequestSerial: 0,
    paymentActivities: [] as PaymentActivity[],
    unavailablePaymentActivities: [] as PaymentActivity[],
    paymentCards: [] as PaymentCard[],
    coupons: [] as CouponItem[],
    paymentActivity: '',
    selectedPaymentCards: [] as string[],
    selectedCoupons: [] as string[],
    loadingPaymentData: false,
    paymentRequestSerial: 0,
    paymentCheckSerial: 0,
    paymentSubmitSerial: 0,
    checkingPayment: false,
    ticketCodePolling: false,
    ticketCodePollingSerial: 0,
    ticketCodePollingAttempts: 0,
    submittingPayment: false,
    paymentSubmitResult: null as TicketPaymentSubmitResult | null,
    paymentDataMessage: '',
    paymentPrerequisiteError: '',
    paymentSubmissionLocked: false,
    selectedSeats: [] as SelectedSeat[],
    maxSeatCount: 8
  }),
  getters: {
    filteredCityOptions(state): TicketOption[] {
      const keyword = normalizeKeyword(state.query.keyword)

      return state.cityRecords
        .filter((city) => matchesSearchKeyword(city, keyword))
        .map((city) => ({ label: city.name, value: city.id }))
    },
    filteredCinemaOptions(state): TicketOption[] {
      const keyword = normalizeKeyword(state.query.keyword)

      return state.cinemaRecords
        .filter((cinema) => (!state.query.city || cinema.cityId === state.query.city) && matchesSearchKeyword(cinema, keyword))
        .map((cinema) => ({ label: cinema.name, value: cinema.id }))
    },
    canSelectMovie(state) {
      return Boolean(state.query.cinema && state.movies.length > 0)
    },
    canSelectDate(state) {
      return Boolean(state.query.movie && state.dates.length > 0)
    },
    canSelectShowtime(state) {
      return Boolean(state.query.date && state.showtimes.length > 0)
    },
    canRefreshSeats(state) {
      return Boolean(
        state.query.city &&
          state.query.cinema &&
          state.query.movie &&
          state.query.date &&
          state.query.showtime &&
          state.currentShowtime
      )
    },
    selectedSeatCount(state) {
      return state.selectedSeats.length
    },
    selectedSeatTotalPrice(state) {
      return state.selectedSeatNodes.reduce((sum, seat) => sum + seat.price, 0)
    },
    canSubmitCurrentOrderPayment(state) {
      return Boolean(
        state.currentOrder &&
          !state.currentOrderFinalized &&
          !state.submittingPayment &&
          !state.loadingPaymentData &&
          !state.paymentPrerequisiteError &&
          !state.paymentSubmissionLocked
      )
    },
    hasPendingCurrentOrder(state) {
      return Boolean(state.currentOrderId || (state.currentOrder && !state.currentOrderFinalized))
    }
  },
  actions: {
    clearSeatSelection(force = false) {
      if (this.hasPendingCurrentOrder && !force) {
        this.currentOrderMessage = '已有待处理订单，请先取消当前订单后再调整座位'
        return
      }

      this.selectedSeatNodes = []
      this.selectedSeats = []
    },
    resetQueryAfterCityChange() {
      ++this.showtimeRequestSerial
      this.query.cinema = ''
      this.query.movie = ''
      this.query.date = ''
      this.query.showtime = ''
      this.rawShowtimeData = null
      this.currentShowtime = null
      this.movies = []
      this.dates = []
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.loadingShowtimes = false
      this.clearSeatSelection(true)
    },
    resetQueryAfterCinemaChange() {
      ++this.showtimeRequestSerial
      this.query.movie = ''
      this.query.date = ''
      this.query.showtime = ''
      this.rawShowtimeData = null
      this.currentShowtime = null
      this.movies = []
      this.dates = []
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.clearSeatSelection(true)
    },
    resetQueryAfterMovieChange() {
      this.query.date = ''
      this.query.showtime = ''
      this.currentShowtime = null
      this.dates = []
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.clearSeatSelection(true)
    },
    resetQueryAfterDateChange() {
      this.query.showtime = ''
      this.currentShowtime = null
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.clearSeatSelection(true)
    },
    clearSeatData() {
      ++this.seatRequestSerial
      this.seatData = null
      this.seatNodes = []
      this.loadingSeats = false
      this.seatError = ''
      this.clearSeatSelection(true)
    },
    handleAccountChanged() {
      const hadCurrentOrder = Boolean(this.currentOrderId)

      this.resetQueryAfterCinemaChange()
      this.loadingShowtimes = false
      this.loadingSeats = false
      this.clearCurrentOrderPaymentContext()

      if (hadCurrentOrder) {
        this.currentOrderMessage = '账号已切换，当前订单上下文已清空'
      }
    },
    buildCurrentOrderContext(
      orderId: string,
      accountId: string,
      phone: string,
      snapshot?: TicketOrderContextSnapshot
    ): TicketOrderContext {
      const contextSnapshot =
        snapshot ??
        ({
          cityName: this.cities.find((item) => item.value === this.query.city)?.label ?? '',
          cinemaId: this.query.cinema,
          cinemaName: this.cinemas.find((item) => item.value === this.query.cinema)?.label ?? '',
          movieName: this.movies.find((item) => item.value === this.query.movie)?.label ?? '',
          showtimeId: this.currentShowtime?.dId || this.query.showtime,
          showtimeLabel:
            this.currentShowtime?.label ?? this.showtimes.find((item) => item.value === this.query.showtime)?.label ?? '',
          amountCent: Math.round(this.selectedSeatTotalPrice * 100),
          seats: this.selectedSeatNodes.map((seat) => ({
            areaId: seat.areaId,
            seatId: seat.seatId,
            rowName: seat.rowLabel,
            columnName: seat.columnLabel,
            areaName: seat.zone
          }))
        } satisfies TicketOrderContextSnapshot)

      return {
        orderId,
        accountId,
        phone,
        cityName: contextSnapshot.cityName,
        cinemaId: contextSnapshot.cinemaId,
        cinemaName: contextSnapshot.cinemaName,
        movieName: contextSnapshot.movieName,
        showtimeId: contextSnapshot.showtimeId,
        showtimeLabel: contextSnapshot.showtimeLabel,
        amountCent: contextSnapshot.amountCent,
        seats: contextSnapshot.seats.map((seat) => ({ ...seat })),
        requestInfo: contextSnapshot.requestInfo
      }
    },
    clearPaymentPrerequisiteData() {
      this.currentOrderPayInfo = null
      this.orderStatus = null
      this.paymentActivities = []
      this.unavailablePaymentActivities = []
      this.paymentCards = []
      this.coupons = []
      this.paymentActivity = ''
      this.selectedPaymentCards = []
      this.selectedCoupons = []
      this.paymentSubmitResult = null
      this.paymentDataMessage = ''
      this.paymentPrerequisiteError = ''
    },
    autoMatchPaymentCard(): PaymentCard | null {
      if (!this.paymentActivity || this.paymentCards.length === 0) {
        return null
      }

      const activity = this.paymentActivities.find(
        (a) => a.code === this.paymentActivity || a.name === this.paymentActivity
      )

      if (!activity) {
        return null
      }

      const matchedCards = this.paymentCards.filter(
        (card) => card.cardTypeCode === activity.typeCode && card.available
      )

      if (matchedCards.length > 0) {
        const bestCard = matchedCards.reduce((prev, current) => {
          return current.balance > prev.balance ? current : prev
        })

        this.selectedPaymentCards = [bestCard.cardNo]
        return bestCard
      }

      return null
    },
    clearCurrentOrderPaymentContext() {
      ++this.orderRequestSerial
      ++this.paymentRequestSerial
      ++this.paymentCheckSerial
      ++this.paymentSubmitSerial
      ++this.ticketCodePollingSerial
      this.currentOrderId = ''
      this.currentOrderAccountId = ''
      this.currentOrder = null
      this.currentOrderFinalized = false
      this.clearPaymentPrerequisiteData()
      this.orderCreating = false
      this.orderCancelling = false
      this.loadingPaymentData = false
      this.checkingPayment = false
      this.ticketCodePolling = false
      this.ticketCodePollingAttempts = 0
      this.submittingPayment = false
      this.paymentSubmissionLocked = false
    },
    finalizeCurrentOrder(message?: string) {
      this.currentOrderFinalized = true
      this.currentOrderId = ''
      this.currentOrderAccountId = this.currentOrder?.accountId ?? this.currentOrderAccountId
      this.orderCancelling = false
      this.paymentSubmissionLocked = true

      if (message) {
        this.currentOrderMessage = message
      }
    },
    async refreshPaymentPrerequisites() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      if (!currentOrder) {
        this.clearPaymentPrerequisiteData()
        this.paymentDataMessage = '请先确认订单和已登录账号'
        return
      }

      if (!account?.ck || !account.userIdentifier) {
        this.clearPaymentPrerequisiteData()
        this.paymentPrerequisiteError = '请先选择创建订单的已登录账号'
        this.paymentDataMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.clearPaymentPrerequisiteData()
        this.paymentPrerequisiteError = '请切回创建订单的账号刷新支付前置数据'
        this.paymentDataMessage = '请切回创建订单的账号刷新支付前置数据'
        return
      }

      const hasValidSeats =
        currentOrder.seats.length > 0 && currentOrder.seats.every((seat) => seat.areaId.trim() && seat.seatId.trim())

      if (!currentOrder.orderId || !currentOrder.cinemaId || !currentOrder.showtimeId || !hasValidSeats) {
        this.clearPaymentPrerequisiteData()
        this.paymentPrerequisiteError = '订单上下文缺少场次、影院或座位信息'
        this.paymentDataMessage = '订单上下文缺少场次、影院或座位信息，无法刷新支付前置数据'
        useLogsStore().addLog('支付前置', account.phone, `订单上下文字段不足：${currentOrder.orderId || '无订单号'}`)
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const paymentSerial = ++this.paymentRequestSerial
      this.loadingPaymentData = true
      this.paymentPrerequisiteError = ''
      this.paymentDataMessage = ''

      try {
        const [statusResult, activityResult, cardsResult, couponsResult] = await Promise.allSettled([
          queryOrderStatus(orderId, account.ck, account.userIdentifier),
          fetchPaymentActivity(currentOrder.seats, orderId, currentOrder.showtimeId, account.ck, account.userIdentifier),
          fetchPayCards(orderId, account.ck, account.userIdentifier),
          fetchCoupons(currentOrder.seats, currentOrder.cinemaId, currentOrder.showtimeId, account.ck, account.userIdentifier)
        ] as const)

        if (
          paymentSerial !== this.paymentRequestSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const activityData =
          activityResult.status === 'fulfilled'
            ? activityResult.value
            : { availableActivities: [], unavailableActivities: [] }
        const cards = cardsResult.status === 'fulfilled' ? cardsResult.value : []
        const coupons = couponsResult.status === 'fulfilled' ? couponsResult.value : []
        const orderStatus = statusResult.status === 'fulfilled' ? statusResult.value : null
        const prerequisiteFailures: string[] = []

        if (statusResult.status === 'rejected') {
          const message =
            statusResult.reason instanceof Error && statusResult.reason.message
              ? statusResult.reason.message
              : '查询订单状态失败'
          prerequisiteFailures.push(`订单状态：${message}`)
          useLogsStore().addLog('支付前置', account.phone, `订单状态查询失败：${message}`)
        }

        if (activityResult.status === 'rejected') {
          const message =
            activityResult.reason instanceof Error && activityResult.reason.message
              ? activityResult.reason.message
              : '获取支付活动失败'
          prerequisiteFailures.push(`支付活动：${message}`)
          useLogsStore().addLog('支付前置', account.phone, `支付活动获取失败：${message}`)
          this.paymentActivity = ''
        }

        if (cardsResult.status === 'rejected') {
          const message =
            cardsResult.reason instanceof Error && cardsResult.reason.message
              ? cardsResult.reason.message
              : '获取支付卡失败'
          prerequisiteFailures.push(`支付卡：${message}`)
          useLogsStore().addLog('支付前置', account.phone, `支付卡获取失败：${message}`)
          this.selectedPaymentCards = []
        }

        if (couponsResult.status === 'rejected') {
          const message =
            couponsResult.reason instanceof Error && couponsResult.reason.message
              ? couponsResult.reason.message
              : '获取优惠券失败'
          prerequisiteFailures.push(`兑换券：${message}`)
          useLogsStore().addLog('支付前置', account.phone, `优惠券获取失败：${message}`)
          this.selectedCoupons = []
        }

        this.paymentActivities = activityData.availableActivities
        this.unavailablePaymentActivities = activityData.unavailableActivities
        this.paymentCards = cards
        this.coupons = coupons
        this.orderStatus = orderStatus
        this.paymentPrerequisiteError = prerequisiteFailures.join('；')
        this.paymentDataMessage = prerequisiteFailures.length
          ? `支付前置数据部分失败：${this.paymentPrerequisiteError}`
          : `支付前置数据已刷新：可用活动 ${this.paymentActivities.length} 个，可用卡 ${this.paymentCards.length} 张，可用券 ${this.coupons.length} 张`
        useLogsStore().addLog(
          '支付前置',
          account.phone,
          prerequisiteFailures.length
            ? `支付前置数据部分失败：${this.paymentPrerequisiteError}`
            : `支付前置数据刷新成功：${orderId}`
        )
      } catch (error) {
        if (
          paymentSerial !== this.paymentRequestSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '支付前置数据刷新失败'
        this.clearPaymentPrerequisiteData()
        this.paymentPrerequisiteError = message
        this.paymentDataMessage = `支付前置数据刷新失败：${message}`
        useLogsStore().addLog('支付前置', account.phone, `支付前置数据刷新失败：${message}`)
      } finally {
        if (
          paymentSerial === this.paymentRequestSerial &&
          this.currentOrder?.orderId === orderId &&
          useAccountsStore().currentAccount?.id === accountId
        ) {
          this.loadingPaymentData = false
        }
      }
    },
    async checkCurrentOrderBeforePayment() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      if (!currentOrder) {
        this.paymentDataMessage = '请先确认选座创建订单'
        return
      }

      if (!account?.ck || !account.userIdentifier) {
        this.paymentDataMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.paymentDataMessage = '请切回创建订单的账号检查支付状态'
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const checkSerial = ++this.paymentCheckSerial
      this.checkingPayment = true
      this.paymentDataMessage = ''

      try {
        const status = await queryOrderStatus(orderId, account.ck, account.userIdentifier)

        if (
          checkSerial !== this.paymentCheckSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        this.orderStatus = status
        this.paymentDataMessage = status.showOrderStatusStr
          ? `支付前置检查完成，当前订单状态：${status.showOrderStatusStr}，未发起支付`
          : '支付前置检查完成，未发起支付'
        useLogsStore().addLog('支付前置', account.phone, `支付前置检查完成，未发起支付：${orderId}`)
      } catch (error) {
        if (
          checkSerial !== this.paymentCheckSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '支付前置检查失败'
        this.paymentDataMessage = `支付前置检查失败：${message}`
        useLogsStore().addLog('支付前置', account.phone, `支付前置检查失败：${message}`)
      } finally {
        if (
          checkSerial === this.paymentCheckSerial &&
          this.currentOrder?.orderId === orderId &&
          useAccountsStore().currentAccount?.id === accountId
        ) {
          this.checkingPayment = false
        }
      }
    },
    async buildTicketCouponPaymentInfo(
      currentOrder: TicketOrderContext,
      ck: string,
      userIdentifier: string
    ): Promise<TicketCouponPaymentInfo | null> {
      const selectedCoupons = this.selectedCoupons
        .map((couponCode) => this.coupons.find((coupon) => coupon.code === couponCode || coupon.couponNo === couponCode))
        .filter((coupon): coupon is CouponItem => Boolean(coupon))

      if (selectedCoupons.length === 0) {
        return null
      }

      this.paymentActivity = ''
      this.selectedPaymentCards = []

      const couponTypeCodes = selectedCoupons.map((coupon) => firstText(coupon.typeCode, coupon.code, coupon.couponNo))
      const selection = await selectCouponsForPayment(
        currentOrder.seats,
        currentOrder.cinemaId,
        couponTypeCodes,
        ck,
        userIdentifier
      )
      const useResult = await fetchCouponUsePayment(
        currentOrder.seats,
        currentOrder.orderId,
        currentOrder.showtimeId,
        selection.allotSeat,
        ck,
        userIdentifier
      )

      return { selection, useResult }
    },
    buildTicketPaymentRequestInfo(
      currentOrder: TicketOrderContext,
      couponPaymentInfo: TicketCouponPaymentInfo | null = null
    ): BuiltTicketPaymentRequestInfo {
      const selectedActivity = this.paymentActivity
        ? this.paymentActivities.find((activity) => activity.code === this.paymentActivity)
        : undefined
      const selectedCards = this.selectedPaymentCards
        .map((cardNo) => this.paymentCards.find((card) => card.cardNo === cardNo))
        .filter((card): card is PaymentCard => Boolean(card))
        .slice(0, 5)

      if (this.paymentActivity && !selectedActivity) {
        throw new Error('当前支付活动已失效，请刷新支付前置数据后重试')
      }

      if (selectedActivity && selectedCards.length === 0) {
        throw new Error('当前支付活动需要先选择支付卡')
      }

      const isCouponPayment = Boolean(couponPaymentInfo)
      const primaryCard = selectedCards[0]
      const seatTotalPrice = Math.max(0, currentOrder.amountCent)
      const payablePrice = couponPaymentInfo
        ? Math.max(0, couponPaymentInfo.useResult.price)
        : selectedActivity
          ? yuanToCents(selectedActivity.price)
          : seatTotalPrice
      let remainingPrice = payablePrice
      const storedCardPayments: TicketStoredCardPayment[] = []

      for (const card of isCouponPayment ? [] : selectedCards) {
        if (remainingPrice <= 0) {
          break
        }

        const cardBalance = yuanToCents(card.balance)
        const paymentPrice = Math.min(cardBalance, remainingPrice)

        if (paymentPrice <= 0) {
          continue
        }

        storedCardPayments.push({
          cardNumber: card.cardNo,
          paymentPrice,
          paymentType: 1,
          ticketType: card.cardTypeCode,
          ticketTypeName: card.cardTypeName
        })
        remainingPrice -= paymentPrice
      }

      const requestInfo: BuiltTicketPaymentRequestInfo = {
        contextId: '',
        currentPrice: 0,
        externalPayment: {
          paySdkId: 1057,
          paymentPrice: Math.max(0, remainingPrice),
          paymentType: 1057,
          returnUrl: 'wandafilm/pay/finished'
        },
        goodInfo: '',
        orderId: String(currentOrder.orderId),
        verifyCode: ''
      }

      if (couponPaymentInfo) {
        requestInfo.ticketVoucher = {
          discountPrice: Math.max(0, seatTotalPrice - payablePrice),
          voucher: couponPaymentInfo.selection.voucher
        }
        requestInfo.couponPaymentList = couponPaymentInfo.useResult.itemList
      }

      if (!isCouponPayment && selectedActivity && primaryCard) {
        requestInfo.activity = {
          allotJson: selectedActivity.allotSeat || '{}',
          card: {
            cardNumber: primaryCard.cardNo,
            quantity: 0
          },
          discountPrice: Math.max(0, seatTotalPrice - payablePrice),
          integral: 0,
          ticketType: selectedActivity.typeCode,
          ticketTypeName: primaryCard.cardTypeName,
          type: selectedActivity.detailType
        }
      }

      if (storedCardPayments.length > 0) {
        requestInfo.storedCardPayments = storedCardPayments
      }

      return requestInfo
    },
    async submitCurrentOrderPayment() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      if (this.submittingPayment) {
        this.paymentDataMessage = '支付提交中，请勿重复提交'
        return
      }

      if (this.paymentSubmissionLocked) {
        this.paymentDataMessage = '支付已提交，请刷新订单状态或取票码，避免重复调用真实支付接口'
        return
      }

      if (this.loadingPaymentData) {
        this.paymentDataMessage = '支付前置数据刷新中，请稍后再提交'
        return
      }

      if (this.paymentPrerequisiteError) {
        this.paymentDataMessage = `支付前置数据异常，暂不允许提交：${this.paymentPrerequisiteError}`
        return
      }

      if (!currentOrder) {
        this.paymentDataMessage = '请先确认选座创建订单'
        return
      }

      if (!account?.ck || !account.userIdentifier) {
        this.paymentDataMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.paymentDataMessage = '请切回创建订单的账号提交支付'
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const submitSerial = ++this.paymentSubmitSerial
      this.submittingPayment = true
      this.paymentSubmitResult = null
      this.paymentDataMessage = ''

      try {
        const couponPaymentInfo = await this.buildTicketCouponPaymentInfo(currentOrder, account.ck, account.userIdentifier)

        if (
          submitSerial !== this.paymentSubmitSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const requestInfo = this.buildTicketPaymentRequestInfo(currentOrder, couponPaymentInfo)
        const result = await submitTicketPayment(
          {
            cinemaId: currentOrder.cinemaId,
            mobilePhone: currentOrder.phone,
            orderId,
            requestInfo
          },
          account.ck,
          account.userIdentifier
        )

        if (
          submitSerial !== this.paymentSubmitSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        this.paymentSubmitResult = result
        this.currentOrder = { ...currentOrder, requestInfo }
        this.paymentSubmissionLocked = true
        this.paymentDataMessage = result.bizMsg
          ? `提交支付完成：${result.bizMsg}`
          : '提交支付完成，已调用真实支付接口'
        useLogsStore().addLog('提交支付', account.phone, `真实支付接口提交完成：${orderId}`)

        const externalPayment = asRecord(requestInfo.externalPayment)
        const externalPaymentPrice = toNumber(externalPayment.paymentPrice)
        const payInfoRecord = asRecord(result.payInfo)
        const tradeNo = firstText(result.tradeNo, payInfoRecord.tradeNo, asRecord(payInfoRecord.payment).tradeNo)

        if (externalPaymentPrice > 0 && tradeNo) {
          const payInfo = await queryPayInfoUpgrade(orderId, tradeNo, account.ck, account.userIdentifier)

          if (
            submitSerial !== this.paymentSubmitSerial ||
            this.currentOrder?.orderId !== orderId ||
            useAccountsStore().currentAccount?.id !== accountId
          ) {
            return
          }

          this.currentOrderPayInfo = payInfo
          this.paymentDataMessage = result.bizMsg
            ? `提交支付完成：${result.bizMsg}，已获取外部支付参数`
            : '提交支付完成，已获取外部支付参数'
          useLogsStore().addLog('提交支付', account.phone, `外部支付参数已获取，等待支付完成：${orderId}`)
          return
        } else if (externalPaymentPrice > 0) {
          throw new Error('提交支付成功但缺少 tradeNo，无法查询外部支付信息')
        }

        const status = await queryOrderStatus(orderId, account.ck, account.userIdentifier)

        if (
          submitSerial !== this.paymentSubmitSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        this.orderStatus = status
        await this.refreshTicketCode()
      } catch (error) {
        if (
          submitSerial !== this.paymentSubmitSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '提交支付失败'
        this.paymentDataMessage = message
        useLogsStore().addLog('提交支付', account.phone, `真实支付接口提交失败：${message}`)
      } finally {
        if (
          submitSerial === this.paymentSubmitSerial &&
          this.currentOrder?.orderId === orderId &&
          useAccountsStore().currentAccount?.id === accountId
        ) {
          this.submittingPayment = false
        }
      }
    },
    async refreshTicketCode() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder
      this.currentOrderPayInfo = null

      if (!currentOrder?.orderId) {
        this.currentOrderMessage = '暂无可刷新取票码的订单'
        return
      }

      if (!account?.ck || !account.userIdentifier) {
        this.currentOrderMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.currentOrderMessage = '请切回创建订单的账号刷新取票码'
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const checkSerial = ++this.paymentCheckSerial
      this.checkingPayment = true
      this.currentOrderMessage = ''

      try {
        const payInfo = await queryOrderByUserId(orderId, account.ck, account.userIdentifier)

        if (
          checkSerial !== this.paymentCheckSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        this.currentOrderPayInfo = payInfo
        const codeCount = payInfo.ticketCodes.length + payInfo.qrCodes.length
        if (codeCount > 0) {
          this.finalizeCurrentOrder(`取票码已刷新，共 ${codeCount} 条`)
        } else {
          this.currentOrderMessage = '订单尚未出票或取票码暂不可用'
        }
        useLogsStore().addLog('取票码', account.phone, `取票码刷新完成：${orderId}`)
      } catch (error) {
        if (
          checkSerial !== this.paymentCheckSerial ||
          this.currentOrder?.orderId !== orderId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '取票码刷新失败'
        this.currentOrderMessage = message
        useLogsStore().addLog('取票码', account.phone, `取票码刷新失败：${message}`)
      } finally {
        if (
          checkSerial === this.paymentCheckSerial &&
          this.currentOrder?.orderId === orderId &&
          useAccountsStore().currentAccount?.id === accountId
        ) {
          this.checkingPayment = false
        }
      }
    },
    async startTicketCodePolling() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      if (this.ticketCodePolling) {
        this.currentOrderMessage = '取票码追踪中，请勿重复启动'
        return
      }

      if (!currentOrder?.orderId) {
        this.currentOrderMessage = '暂无可追踪取票码的订单'
        return
      }

      if (!account?.ck || !account.userIdentifier) {
        this.currentOrderMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.currentOrderMessage = '请切回创建订单的账号追踪取票码'
        return
      }

      const maxAttempts = 10
      const pollIntervalMs = 3000
      const orderId = currentOrder.orderId
      const accountId = account.id
      const pollSerial = ++this.ticketCodePollingSerial
      this.ticketCodePolling = true
      this.ticketCodePollingAttempts = 0
      this.currentOrderMessage = '正在追踪出票状态'

      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          if (
            pollSerial !== this.ticketCodePollingSerial ||
            this.currentOrder?.orderId !== orderId ||
            useAccountsStore().currentAccount?.id !== accountId
          ) {
            return
          }

          this.ticketCodePollingAttempts = attempt

          try {
            const status = await queryOrderStatus(orderId, account.ck, account.userIdentifier)

            if (
              pollSerial !== this.ticketCodePollingSerial ||
              this.currentOrder?.orderId !== orderId ||
              useAccountsStore().currentAccount?.id !== accountId
            ) {
              return
            }

            this.orderStatus = status
          } catch (error) {
            const message = error instanceof Error && error.message ? error.message : '订单状态查询失败'
            useLogsStore().addLog('取票码', account.phone, `出票追踪状态查询失败：${message}`)
          }

          try {
            const payInfo = await queryOrderByUserId(orderId, account.ck, account.userIdentifier)

            if (
              pollSerial !== this.ticketCodePollingSerial ||
              this.currentOrder?.orderId !== orderId ||
              useAccountsStore().currentAccount?.id !== accountId
            ) {
              return
            }

            this.currentOrderPayInfo = payInfo
            const codeCount = payInfo.ticketCodes.length + payInfo.qrCodes.length

            if (codeCount > 0) {
              this.finalizeCurrentOrder(`已出票，取票码共 ${codeCount} 条`)
              useLogsStore().addLog('取票码', account.phone, `出票追踪完成：${orderId}`)
              return
            }
          } catch (error) {
            const message = error instanceof Error && error.message ? error.message : '取票码查询失败'
            useLogsStore().addLog('取票码', account.phone, `出票追踪取票码查询失败：${message}`)
          }

          this.currentOrderMessage = `出票追踪中（${attempt}/${maxAttempts}），未取到取票码`

          if (attempt < maxAttempts) {
            await wait(pollIntervalMs)
          }
        }

        this.currentOrderMessage = '暂未取到取票码，可稍后手动刷新'
        useLogsStore().addLog('取票码', account.phone, `出票追踪结束仍未出票：${orderId}`)
      } finally {
        if (
          pollSerial === this.ticketCodePollingSerial &&
          this.currentOrder?.orderId === orderId &&
          useAccountsStore().currentAccount?.id === accountId
        ) {
          this.ticketCodePolling = false
        }
      }
    },
    addCityRecord(item: unknown, cityMap: Map<string, CityRecord>) {
      const record = asRecord(item)
      const id = firstText(record.id, record.cityId, record.cityid, record.CityID, record.code)
      const name = firstText(record.name, record.cityName, record.CityName)

      if (!id || !name || cityMap.has(id)) {
        return
      }

      cityMap.set(id, {
        id,
        name,
        pinyin: firstText(record.pinyin),
        firstLetter: firstText(record.firstLetter),
        raw: item
      })
    },
    mergeCinemaRecord(cinemaMap: Map<string, CinemaRecord>, cinema: CinemaRecord) {
      const current = cinemaMap.get(cinema.id)

      if (!current) {
        cinemaMap.set(cinema.id, cinema)
        return
      }

      const currentName = current.name

      if (cinema.name.length > currentName.length) {
        cinemaMap.set(cinema.id, {
          ...current,
          ...cinema
        })
      }
    },
    addCinemaRecord(item: unknown, defaultCityId: string, cinemaMap: Map<string, CinemaRecord>) {
      const record = asRecord(item)
      const id = firstText(record.id, record.cinemaId, record.cinemaid, record.CmID, record.cmID)
      const cityId = firstText(record.cityId, record.cityid, record.cityCode, record.CityID, record.cityID, defaultCityId)
      const name = firstText(record.name, record.cinemaName, record.CmName, record.MyCmName, record.maoyanName)

      if (!id || !cityId || !name) {
        return
      }

      this.mergeCinemaRecord(cinemaMap, {
        id,
        cityId,
        name,
        address: firstText(record.address, record.CmAdd),
        pinyin: firstText(record.pinyin),
        firstLetter: firstText(record.firstLetter),
        raw: item
      })
    },
    async loadCityData() {
      const result = await window.wandaApp?.readLocalData('city')

      if (!result?.ok) {
        this.showtimeError = '缺少真实城市/影院数据'
        return
      }

      const cityMap = new Map<string, CityRecord>()
      const cinemaMap = new Map<string, CinemaRecord>()

      for (const city of result.data.cities) {
        this.addCityRecord(city, cityMap)
      }

      for (const cinema of result.data.cinemas) {
        this.addCinemaRecord(cinema, '', cinemaMap)
      }

      for (const city of result.data.city) {
        const record = asRecord(city)
        const cityId = firstText(record.CityID)
        this.addCityRecord(city, cityMap)

        for (const cinema of asList(record.CmList)) {
          this.addCinemaRecord(cinema, cityId, cinemaMap)
        }
      }

      this.cityRecords = [...cityMap.values()]
      this.cinemaRecords = [...cinemaMap.values()]
      this.cities = this.cityRecords.map((city) => ({ label: city.name, value: city.id }))
      this.showtimeError = this.cityRecords.length > 0 && this.cinemaRecords.length > 0 ? '' : '缺少真实城市/影院数据'

      if (this.query.city) {
        this.cinemas = this.cinemaRecords
          .filter((cinema) => cinema.cityId === this.query.city)
          .map((cinema) => ({ label: cinema.name, value: cinema.id }))
      }
    },
    selectCity() {
      this.resetQueryAfterCityChange()
      this.cinemas = this.cinemaRecords
        .filter((cinema) => !this.query.city || cinema.cityId === this.query.city)
        .map((cinema) => ({ label: cinema.name, value: cinema.id }))
      this.showtimeError = this.cinemas.length > 0 ? '' : '当前城市缺少真实影院数据'
    },
    async loadCinemaShowtimes() {
      this.resetQueryAfterCinemaChange()
      const account = useAccountsStore().currentAccount
      const cinemaId = this.query.cinema

      if (!account?.ck || !account.userIdentifier || !cinemaId) {
        this.showtimeError = '请先选择已登录万达账号和影院'
        return
      }

      const requestSerial = ++this.showtimeRequestSerial
      const accountId = account.id
      this.loadingShowtimes = true
      this.showtimeError = ''

      try {
        const rawShowtimeData = await fetchCinemaShowtime(cinemaId, account.ck, account.userIdentifier)

        if (
          requestSerial !== this.showtimeRequestSerial ||
          cinemaId !== this.query.cinema ||
          accountId !== useAccountsStore().currentAccount?.id
        ) {
          return
        }

        this.rawShowtimeData = rawShowtimeData
        this.movies = this.extractMovies(this.rawShowtimeData)
        this.showtimeError = this.movies.length > 0 ? '' : '当前影院暂无可选影片'
        useLogsStore().addLog('购票查询', account.phone, `影院场次加载成功：${this.movies.length} 部影片`)
      } catch (error) {
        if (
          requestSerial !== this.showtimeRequestSerial ||
          cinemaId !== this.query.cinema ||
          accountId !== useAccountsStore().currentAccount?.id
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '影院场次加载失败'
        this.showtimeError = message
        useLogsStore().addLog('购票查询', account.phone, `影院场次加载失败：${message}`)
      } finally {
        if (requestSerial === this.showtimeRequestSerial) {
          this.loadingShowtimes = false
        }
      }
    },
    extractMovies(raw: unknown): TicketOption[] {
      return optionDedupe(
        getShowtimeFilmList(raw)
          .map((item) => {
            const record = asRecord(item)
            const label = showtimeFilmName(record)
            const value = firstText(record.filmId, record.movieId, record.id, label)

            return { value, label }
          })
          .filter((item) => item.value && item.label)
      )
    },
    selectMovie() {
      this.resetQueryAfterMovieChange()
      this.dates = this.extractDates(this.rawShowtimeData, this.query.movie)
      this.showtimeError = this.dates.length > 0 ? '' : '当前影片暂无可选日期'
    },
    extractDates(raw: unknown, filmId: string): TicketOption[] {
      const film = getShowtimeFilmList(raw).find((item) => filmMatches(item, filmId))
      const dates = getDateList(asRecord(film))

      return optionDedupe(
        dates
          .map((item) => {
            const record = asRecord(item)
            const value = firstText(record.date, record.showDate, record.showtimeDate, record.day)

            return { value, label: value }
          })
          .filter((item) => item.value)
      )
    },
    selectDate() {
      this.resetQueryAfterDateChange()
      this.showtimeItems = this.extractShowtimeItems(this.rawShowtimeData, this.query.movie, this.query.date)
      this.showtimes = this.showtimeItems.map((item) => ({ value: item.dId, label: item.label }))
      this.showtimeError = this.showtimes.length > 0 ? '' : '当前日期暂无可选场次'
    },
    extractShowtimeItems(raw: unknown, filmId: string, date: string): ShowtimeItem[] {
      const film = getShowtimeFilmList(raw).find((item) => filmMatches(item, filmId))
      const matchedDate = getDateList(asRecord(film)).find((item) => {
        const record = asRecord(item)
        return firstText(record.date, record.showDate, record.showtimeDate, record.day) === date
      })

      return getShowtimeList(asRecord(matchedDate))
        .map((item) => {
          const record = asRecord(item)
          const filmInfo = firstShowtimeFilm(record)
          const dId = firstText(record.showtimeId, record.dId, record.did, record.id)
          const startTime = formatShowtimeTime(firstText(record.realtime, record.showTime, record.showTimeStr, record.startTime, record.beginTime))
          const endTime = firstText(record.showEndTime, record.showEndTimeStr, record.endTime)
          const hallName = firstText(record.hallName, record.hall, record.cinemaHallName)
          const version = firstText(
            record.versionLanguage,
            filmInfo.versionLanguage,
            record.language,
            record.version,
            record.movieLanguage,
            record.movieVersion
          )
          const label = [startTime, hallName, version].filter(Boolean).join(' - ') || dId

          return {
            dId,
            label,
            startTime,
            hallName,
            filmId,
            date,
            raw: { ...record, endTime, version }
          }
        })
        .filter((item) => item.dId)
    },
    extractShowtimes(raw: unknown, filmId: string, date: string): TicketOption[] {
      return this.extractShowtimeItems(raw, filmId, date).map((item) => ({
        value: item.dId,
        label: item.label
      }))
    },
    setShowtime() {
      this.currentShowtime = this.showtimeItems.find((item) => item.dId === this.query.showtime) ?? null
      this.showtimeError = this.currentShowtime ? '' : '请选择真实场次'
      this.clearSeatData()
      this.clearSeatSelection(true)
    },
    getSeatZone(areaCode: string): SeatZone {
      const zoneMap: Record<string, SeatZone> = {
        '1': 'normal',
        '32': 'preferred',
        '33': 'discount',
        '36': 'wplus'
      }

      return zoneMap[areaCode] ?? 'normal'
    },
    normalizeSeats(data: RealTimeSeats): SeatNode[] {
      const areas = Array.isArray(data.area) ? data.area : []

      return areas.flatMap((area: SeatArea) => {
        const seats = Array.isArray(area.seat) ? area.seat : []
        const areaCode = firstText(area.areaPrice?.areaCode, area.areaId, '1')
        const price = toNumber(area.areaPrice?.salesPrice) / 100

        return seats.map((seat: RawSeat) => {
          const rowLabel = firstText(seat.row)
          const columnLabel = firstText(seat.column)
          const seatId = firstText(seat.seatId)
          const areaId = firstText(area.areaId, seat.areaId)

          return {
            id: `${areaId}-${seatId || `${rowLabel}-${columnLabel}`}`,
            rowLabel,
            columnLabel,
            coordx: toNumber(seat.coordx),
            coordy: toNumber(seat.coordy),
            status: getSeatStatus(seat.status),
            zone: this.getSeatZone(areaCode),
            price,
            seatId,
            areaId,
            raw: seat
          }
        })
      })
    },
    async loadRealTimeSeats() {
      const account = useAccountsStore().currentAccount

      if (!account?.ck || !account.userIdentifier || !this.currentShowtime) {
        this.clearSeatData()
        this.seatError = '请先选择已登录万达账号和真实场次'
        return
      }

      const seatSerial = ++this.seatRequestSerial
      const dId = this.currentShowtime.dId
      const accountId = account.id
      this.loadingSeats = true
      this.seatError = ''

      try {
        const seatData = await fetchRealTimeSeat(dId, account.ck, account.userIdentifier)

        if (
          seatSerial !== this.seatRequestSerial ||
          this.currentShowtime?.dId !== dId ||
          accountId !== useAccountsStore().currentAccount?.id
        ) {
          return
        }

        this.seatData = seatData
        this.seatNodes = this.normalizeSeats(this.seatData)
        this.clearSeatSelection(true)
        useLogsStore().addLog('座位', account.phone, `座位数据获取成功，共 ${this.seatNodes.length} 座`)
      } catch (error) {
        if (
          seatSerial !== this.seatRequestSerial ||
          this.currentShowtime?.dId !== dId ||
          accountId !== useAccountsStore().currentAccount?.id
        ) {
          return
        }

        const message = error instanceof Error && error.message ? error.message : '座位数据获取失败'
        this.clearSeatData()
        this.seatError = message
        useLogsStore().addLog('座位', account.phone, `座位数据获取失败：${message}`)
      } finally {
        if (seatSerial === this.seatRequestSerial) {
          this.loadingSeats = false
        }
      }
    },
    selectSeatsByParsedOcr(parsed: ParsedOcrTicket): number {
      if (this.hasPendingCurrentOrder) {
        this.currentOrderMessage = '已有待处理订单，请先取消当前订单后再按 OCR 调整座位'
        return 0
      }

      const matchedSeats = parsed.seats
        .map((seat) =>
          this.seatNodes.find(
            (node) =>
              node.status !== 'occupied' &&
              String(node.rowLabel) === seat.rowName &&
              String(node.columnLabel) === seat.columnName
          )
        )
        .filter((seat): seat is SeatNode => Boolean(seat))
        .slice(0, this.maxSeatCount)

      if (matchedSeats.length === 0) {
        return 0
      }

      this.selectedSeatNodes = matchedSeats
      this.selectedSeats = matchedSeats.map((seat) => ({
        id: seat.id,
        rowName: seat.rowLabel,
        columnName: seat.columnLabel,
        areaName: seat.zone
      }))

      return matchedSeats.length
    },
    async applyParsedOcrTicket(parsed: ParsedOcrTicket) {
      const account = useAccountsStore().currentAccount
      const applied: string[] = []

      if (parsed.movieName || parsed.cinemaName) {
        this.query.keyword = parsed.movieName || parsed.cinemaName
      }

      if (parsed.cinemaName) {
        const cinema = findUniqueCinemaByText(this.cinemaRecords, parsed.cinemaName)

        if (cinema) {
          if (this.query.city !== cinema.cityId) {
            this.query.city = cinema.cityId
            this.selectCity()
          }

          this.query.cinema = cinema.id
          applied.push('影院')
          await this.loadCinemaShowtimes()
        }
      }

      if (parsed.movieName && this.movies.length > 0) {
        const movie = findUniqueOptionByText(this.movies, parsed.movieName)

        if (movie) {
          this.query.movie = movie.value
          this.selectMovie()
          applied.push('影片')
        }
      }

      if (parsed.date && this.dates.length > 0) {
        const date = findUnique(this.dates, (item) => optionMatchesDate(item, parsed.date))

        if (date) {
          this.query.date = date.value
          this.selectDate()
          applied.push('日期')
        }
      }

      if (parsed.time && this.showtimes.length > 0) {
        const showtime = findUnique(this.showtimes, (item) => optionMatchesTime(item, parsed.time))

        if (showtime) {
          this.query.showtime = showtime.value
          this.setShowtime()
          applied.push('场次')
        }
      }

      if (parsed.seats.length > 0) {
        if (this.seatNodes.length === 0 && this.canRefreshSeats) {
          await this.loadRealTimeSeats()
        }

        const selectedCount = this.selectSeatsByParsedOcr(parsed)

        if (selectedCount > 0) {
          applied.push(`座位 ${selectedCount} 个`)
        }
      }

      this.showtimeError =
        applied.length > 0 ? `OCR 已匹配：${applied.join('、')}` : 'OCR 已识别，请先加载真实城市、影院、影片和场次后再匹配'

      useLogsStore().addLog(
        'OCR识别',
        account?.phone || '-',
        applied.length > 0 ? `OCR 匹配成功：${applied.join('、')}` : 'OCR 已识别但未匹配到当前真实数据'
      )
    },
    async applyOcrTicketText(text: string): Promise<ParsedOcrTicket> {
      const parsed = parseOcrTicketText(text)
      let finalParsed = parsed

      if (needsAiOcrFallback(parsed)) {
        const account = useAccountsStore().currentAccount
        const result = await window.wandaApp?.aiParseOcr({ text: parsed.rawText, words: parsed.words })

        if (result?.ok) {
          finalParsed = mergeAiOcrParsedTicket(parsed, result.data)
          useLogsStore().addLog('AI OCR', account?.phone || '-', 'AI 兜底解析完成')
        } else if (result?.error) {
          useLogsStore().addLog('AI OCR', account?.phone || '-', `AI 兜底跳过：${result.error}`)
        }
      }

      await this.applyParsedOcrTicket(finalParsed)
      return finalParsed
    },
    async createCurrentOrder() {
      const account = useAccountsStore().currentAccount

      if (this.hasPendingCurrentOrder || this.orderCreating) {
        this.currentOrderMessage = this.hasPendingCurrentOrder ? '已有待处理订单，请先取消当前订单' : '订单创建中，请勿重复提交'
        return
      }

      if (
        !account?.ck ||
        !account.userIdentifier ||
        !account.phone ||
        !this.currentShowtime?.dId ||
        this.selectedSeatNodes.length === 0
      ) {
        this.currentOrderMessage = '请先选择已登录账号、真实场次和座位'
        return
      }

      const snapshot: TicketOrderSubmitSnapshot = {
        accountId: account.id,
        phone: account.phone,
        ck: account.ck,
        userIdentifier: account.userIdentifier,
        cityName: this.cities.find((item) => item.value === this.query.city)?.label ?? '',
        cinemaId: this.query.cinema,
        cinemaName: this.cinemas.find((item) => item.value === this.query.cinema)?.label ?? '',
        movieName: this.movies.find((item) => item.value === this.query.movie)?.label ?? '',
        showtimeId: this.currentShowtime.dId,
        showtimeLabel:
          this.currentShowtime.label ?? this.showtimes.find((item) => item.value === this.query.showtime)?.label ?? '',
        amountCent: Math.round(this.selectedSeatTotalPrice * 100),
        seats: this.selectedSeatNodes.map((seat) => ({
          areaId: seat.areaId,
          seatId: seat.seatId,
          rowName: seat.rowLabel,
          columnName: seat.columnLabel,
          areaName: seat.zone
        })),
        seatIds: this.selectedSeatNodes.map((seat) => seat.seatId)
      }
      const requestSerial = ++this.orderRequestSerial
      this.orderCreating = true
      this.currentOrderMessage = ''

      try {
        const result = await createTicketOrder(
          snapshot.showtimeId,
          snapshot.seatIds,
          snapshot.amountCent,
          snapshot.phone,
          snapshot.ck,
          snapshot.userIdentifier
        )

        if (requestSerial !== this.orderRequestSerial || useAccountsStore().currentAccount?.id !== snapshot.accountId) {
          useLogsStore().addLog('订单', snapshot.phone, `旧订单创建返回已忽略：${result.orderId}`)
          if (result.orderId) {
            void cancelTicketOrder(result.orderId, snapshot.ck, snapshot.userIdentifier)
              .then(() => {
                useLogsStore().addLog('订单', snapshot.phone, `旧订单创建返回已补取消：${result.orderId}`)
              })
              .catch((cancelError) => {
                const message =
                  cancelError instanceof Error && cancelError.message
                    ? cancelError.message
                    : '订单取消失败'
                useLogsStore().addLog('订单', snapshot.phone, `旧订单创建返回补取消失败：${result.orderId}，${message}`)
              })
          }
          return
        }

        this.currentOrderId = result.orderId
        this.currentOrderFinalized = false
        this.paymentSubmissionLocked = false
        this.currentOrderAccountId = snapshot.accountId
        this.currentOrder = this.buildCurrentOrderContext(result.orderId, snapshot.accountId, snapshot.phone, {
          ...snapshot,
          requestInfo: result.requestInfo
        })
        this.currentOrderMessage = result.bizMsg || '订单创建成功'
        useLogsStore().addLog('订单', snapshot.phone, `订单创建成功：${result.orderId}`)
        await this.refreshPaymentPrerequisites()
      } catch (error) {
        if (requestSerial !== this.orderRequestSerial || useAccountsStore().currentAccount?.id !== snapshot.accountId) {
          useLogsStore().addLog('订单', snapshot.phone, '旧订单创建返回已忽略')
          return
        }

        const message = error instanceof Error && error.message ? error.message : '订单创建失败'
        this.currentOrderMessage = message
        useLogsStore().addLog('订单', snapshot.phone, `订单创建失败：${message}`)
      } finally {
        if (requestSerial === this.orderRequestSerial) {
          this.orderCreating = false
        }
      }
    },
    async cancelCurrentOrder() {
      const account = useAccountsStore().currentAccount

      if (this.orderCancelling) {
        this.currentOrderMessage = '订单取消中，请勿重复提交'
        return
      }

      if (!account?.ck || !account.userIdentifier || !this.currentOrderId) {
        this.currentOrderMessage = '暂无可取消订单'
        return
      }

      if (this.currentOrderAccountId && this.currentOrderAccountId !== account.id) {
        this.currentOrderMessage = '请切回创建订单的账号取消订单'
        return
      }

      const orderId = this.currentOrderId
      const accountId = account.id
      const phone = account.phone
      const ck = account.ck
      const userIdentifier = account.userIdentifier
      const requestSerial = ++this.orderRequestSerial
      this.orderCancelling = true

      try {
        await cancelTicketOrder(orderId, ck, userIdentifier)

        if (
          requestSerial !== this.orderRequestSerial ||
          this.currentOrderId !== orderId ||
          (this.currentOrderAccountId || this.currentOrder?.accountId) !== accountId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          useLogsStore().addLog('订单', phone, `旧订单取消返回已忽略：${orderId}`)
          return
        }

        useLogsStore().addLog('订单', phone, `订单已取消：${orderId}`)
        this.currentOrderMessage = '订单已取消'
        this.clearCurrentOrderPaymentContext()
      } catch (error) {
        if (
          requestSerial !== this.orderRequestSerial ||
          this.currentOrderId !== orderId ||
          (this.currentOrderAccountId || this.currentOrder?.accountId) !== accountId ||
          useAccountsStore().currentAccount?.id !== accountId
        ) {
          useLogsStore().addLog('订单', phone, `旧订单取消返回已忽略：${orderId}`)
          return
        }

        const message = error instanceof Error && error.message ? error.message : '订单取消失败'
        this.currentOrderMessage = message
        useLogsStore().addLog('订单', phone, `订单取消失败：${message}`)
      } finally {
        if (requestSerial === this.orderRequestSerial) {
          this.orderCancelling = false
        }
      }
    },
    toggleSeat(seat: SeatNode) {
      if (this.hasPendingCurrentOrder) {
        this.currentOrderMessage = '已有待处理订单，请先取消当前订单后再调整座位'
        return
      }

      if (seat.status === 'occupied') {
        return
      }

      const exists = this.selectedSeatNodes.some((item) => item.id === seat.id)

      if (exists) {
        this.selectedSeatNodes = this.selectedSeatNodes.filter((item) => item.id !== seat.id)
      } else if (this.selectedSeatNodes.length < this.maxSeatCount) {
        this.selectedSeatNodes.push(seat)
      }

      this.selectedSeats = this.selectedSeatNodes.map((item) => ({
        id: item.id,
        rowName: item.rowLabel,
        columnName: item.columnLabel,
        areaName: item.zone
      }))
    }
  }
})
