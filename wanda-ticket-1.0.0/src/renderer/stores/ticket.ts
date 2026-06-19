import { defineStore } from 'pinia'

import { fetchCinemaShowtime } from '@renderer/services/cinemaApi'
import {
  cancelTicketOrder,
  createTicketOrder,
  fetchCoupons,
  fetchPayCards,
  fetchPaymentActivity,
  fetchRealTimeSeat,
  queryOrderStatus
} from '@renderer/services/seatApi'
import type {
  CinemaRecord,
  CityRecord,
  CouponItem,
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
}

interface TicketOrderSubmitSnapshot extends TicketOrderContextSnapshot {
  accountId: string
  phone: string
  ck: string
  userIdentifier: string
  seatIds: string[]
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
    checkingPayment: false,
    paymentDataMessage: '',
    selectedSeats: [] as SelectedSeat[],
    maxSeatCount: 8
  }),
  getters: {
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
    }
  },
  actions: {
    clearSeatSelection() {
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
      this.clearSeatSelection()
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
      this.clearSeatSelection()
    },
    resetQueryAfterMovieChange() {
      this.query.date = ''
      this.query.showtime = ''
      this.currentShowtime = null
      this.dates = []
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.clearSeatSelection()
    },
    resetQueryAfterDateChange() {
      this.query.showtime = ''
      this.currentShowtime = null
      this.showtimes = []
      this.showtimeItems = []
      this.clearSeatData()
      this.clearSeatSelection()
    },
    clearSeatData() {
      ++this.seatRequestSerial
      this.seatData = null
      this.seatNodes = []
      this.loadingSeats = false
      this.seatError = ''
      this.clearSeatSelection()
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
        seats: contextSnapshot.seats.map((seat) => ({ ...seat }))
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
      this.paymentDataMessage = ''
    },
    clearCurrentOrderPaymentContext() {
      ++this.orderRequestSerial
      ++this.paymentRequestSerial
      ++this.paymentCheckSerial
      this.currentOrderId = ''
      this.currentOrderAccountId = ''
      this.currentOrder = null
      this.clearPaymentPrerequisiteData()
      this.orderCreating = false
      this.orderCancelling = false
      this.loadingPaymentData = false
      this.checkingPayment = false
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
        this.paymentDataMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.clearPaymentPrerequisiteData()
        this.paymentDataMessage = '请切回创建订单的账号刷新支付前置数据'
        return
      }

      const hasValidSeats =
        currentOrder.seats.length > 0 && currentOrder.seats.every((seat) => seat.areaId.trim() && seat.seatId.trim())

      if (!currentOrder.orderId || !currentOrder.cinemaId || !currentOrder.showtimeId || !hasValidSeats) {
        this.clearPaymentPrerequisiteData()
        this.paymentDataMessage = '订单上下文缺少场次、影院或座位信息，无法刷新支付前置数据'
        useLogsStore().addLog('支付前置', account.phone, `订单上下文字段不足：${currentOrder.orderId || '无订单号'}`)
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const paymentSerial = ++this.paymentRequestSerial
      this.loadingPaymentData = true
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

        if (statusResult.status === 'rejected') {
          throw statusResult.reason
        }

        const activityData =
          activityResult.status === 'fulfilled'
            ? activityResult.value
            : { availableActivities: [], unavailableActivities: [] }
        const cards = cardsResult.status === 'fulfilled' ? cardsResult.value : []
        const coupons = couponsResult.status === 'fulfilled' ? couponsResult.value : []

        if (activityResult.status === 'rejected') {
          const message =
            activityResult.reason instanceof Error && activityResult.reason.message
              ? activityResult.reason.message
              : '获取支付活动失败'
          useLogsStore().addLog('支付前置', account.phone, `支付活动获取失败：${message}`)
          this.paymentActivity = ''
        }

        if (cardsResult.status === 'rejected') {
          const message =
            cardsResult.reason instanceof Error && cardsResult.reason.message
              ? cardsResult.reason.message
              : '获取支付卡失败'
          useLogsStore().addLog('支付前置', account.phone, `支付卡获取失败：${message}`)
          this.selectedPaymentCards = []
        }

        if (couponsResult.status === 'rejected') {
          const message =
            couponsResult.reason instanceof Error && couponsResult.reason.message
              ? couponsResult.reason.message
              : '获取优惠券失败'
          useLogsStore().addLog('支付前置', account.phone, `优惠券获取失败：${message}`)
          this.selectedCoupons = []
        }

        this.paymentActivities = activityData.availableActivities
        this.unavailablePaymentActivities = activityData.unavailableActivities
        this.paymentCards = cards
        this.coupons = coupons
        this.orderStatus = statusResult.value
        this.paymentDataMessage = `支付前置数据已刷新：可用活动 ${this.paymentActivities.length} 个，可用卡 ${this.paymentCards.length} 张，可用券 ${this.coupons.length} 张`
        useLogsStore().addLog('支付前置', account.phone, `支付前置数据刷新成功：${orderId}`)
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
    addCinemaRecord(item: unknown, defaultCityId: string, cinemaMap: Map<string, CinemaRecord>) {
      const record = asRecord(item)
      const id = firstText(record.id, record.cinemaId, record.cinemaid, record.CmID, record.cmID)
      const cityId = firstText(record.cityId, record.cityid, record.cityCode, record.CityID, record.cityID, defaultCityId)
      const name = firstText(record.name, record.cinemaName, record.MyCmName, record.CmName, record.maoyanName)

      if (!id || !cityId || !name || cinemaMap.has(id)) {
        return
      }

      cinemaMap.set(id, {
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
          const startTime = firstText(record.realtime, record.showTime, record.showTimeStr, record.startTime, record.beginTime)
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
      this.clearSeatSelection()
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
        this.clearSeatSelection()
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
    async createCurrentOrder() {
      const account = useAccountsStore().currentAccount

      if (this.currentOrderId || this.orderCreating) {
        this.currentOrderMessage = this.currentOrderId ? '已有待处理订单，请先取消当前订单' : '订单创建中，请勿重复提交'
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
        this.currentOrderAccountId = snapshot.accountId
        this.currentOrder = this.buildCurrentOrderContext(result.orderId, snapshot.accountId, snapshot.phone, snapshot)
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
