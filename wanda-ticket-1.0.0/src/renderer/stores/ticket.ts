import { defineStore } from 'pinia'

import { fetchCinemaShowtime } from '@renderer/services/cinemaApi'
import { fetchRealTimeSeat } from '@renderer/services/seatApi'
import type {
  CinemaRecord,
  CityRecord,
  RawSeat,
  RealTimeSeats,
  SeatArea,
  SeatNode,
  SeatStatus,
  SeatZone,
  ShowtimeItem
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
    paymentActivity: '',
    selectedPaymentCards: [] as string[],
    selectedCoupons: [] as string[],
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
      this.loadingShowtimes = true
      this.showtimeError = ''

      try {
        const rawShowtimeData = await fetchCinemaShowtime(cinemaId, account.ck, account.userIdentifier)

        if (requestSerial !== this.showtimeRequestSerial || cinemaId !== this.query.cinema) {
          return
        }

        this.rawShowtimeData = rawShowtimeData
        this.movies = this.extractMovies(this.rawShowtimeData)
        this.showtimeError = this.movies.length > 0 ? '' : '当前影院暂无可选影片'
        useLogsStore().addLog('购票查询', account.phone, `影院场次加载成功：${this.movies.length} 部影片`)
      } catch (error) {
        if (requestSerial !== this.showtimeRequestSerial || cinemaId !== this.query.cinema) {
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
      this.loadingSeats = true
      this.seatError = ''

      try {
        const seatData = await fetchRealTimeSeat(dId, account.ck, account.userIdentifier)

        if (seatSerial !== this.seatRequestSerial || this.currentShowtime?.dId !== dId) {
          return
        }

        this.seatData = seatData
        this.seatNodes = this.normalizeSeats(this.seatData)
        this.clearSeatSelection()
        useLogsStore().addLog('座位', account.phone, `座位数据获取成功，共 ${this.seatNodes.length} 座`)
      } catch (error) {
        if (seatSerial !== this.seatRequestSerial || this.currentShowtime?.dId !== dId) {
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
