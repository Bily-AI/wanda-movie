import { defineStore } from 'pinia'
import { pinyin } from 'pinyin-pro'

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
import {
  isLikelySeatSelectionOcrText,
  isLikelyToolUiOcrText,
  parseOcrTicketText,
  type ParsedOcrTicket
} from '@shared/ocrParser'
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

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

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
  verifyCode?: string
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

// 城市/影院数据本身不带拼音，用中文名现算全拼与首字母，供拼音、首字母搜索匹配
function buildNamePinyin(name: string): { pinyin: string; firstLetter: string } {
  if (!name) {
    return { pinyin: '', firstLetter: '' }
  }

  const clean = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const full = clean(pinyin(name, { toneType: 'none', nonZh: 'consecutive' }))
  const first = clean(pinyin(name, { pattern: 'first', toneType: 'none', nonZh: 'consecutive' }))

  return { pinyin: full, firstLetter: first }
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
  if (!text || options.length === 0) return undefined

  const cleanedText = text.replace(/\s+/g, '').toLowerCase()

  const candidates = options.map((option) => {
    const name = (option.label || '').replace(/\s+/g, '').toLowerCase()
    if (cleanedText.includes(name) || name.includes(cleanedText)) {
      return { option, score: name.length * 100 + 1000 }
    }

    const nameChars = [...new Set(name.split(''))]
    let matchedChars = 0
    for (const char of nameChars) {
      if (cleanedText.includes(char)) matchedChars++
    }

    const charCoverage = nameChars.length > 0 ? matchedChars / nameChars.length : 0
    const score = charCoverage * 500
    return { option, score }
  })

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  if (best && best.score > 100) {
    return best.option
  }
  return undefined
}

function resolveOcrCityId(cities: CityRecord[], cityName: string): string {
  const target = (cityName || '').replace(/[市\s]/g, '')

  if (!target || cities.length === 0) {
    return ''
  }

  const matched = cities.find((city) => (city.name || '').replace(/[市\s]/g, '') === target)

  return matched?.id ?? ''
}

function findUniqueCinemaByText(cinemas: CinemaRecord[], text: string): CinemaRecord | undefined {
  if (!text || cinemas.length === 0) return undefined

  const trimmed = text.trim()
  const spaceRemoved = trimmed.replace(/\s+/g, '')
  const parensRemoved = trimmed.replace(/[（(].*?[）)]/g, '')
  const parensReplaced = trimmed.replace(/[（(）)]/g, '')
  const prefixRemoved = parensRemoved.replace(/^万达影城/, '')

  interface WeightedVariant {
    text: string
    weight: number
  }

  const variants: WeightedVariant[] = [
    { text: trimmed, weight: 1.5 },
    { text: spaceRemoved, weight: 1.3 },
    { text: parensReplaced, weight: 1.2 },
    { text: prefixRemoved, weight: 1.0 },
    { text: parensRemoved, weight: 0.6 }
  ]

  const getMatchScore = (cinema: CinemaRecord): number => {
    const name = (cinema.name || '').trim().toLowerCase()
    const maoyanName = (cinema.maoyanName || '').trim().toLowerCase()

    let maxScore = 0
    for (const variant of variants) {
      const vText = variant.text.toLowerCase()
      const lcsName = computeLcsLength(vText, name)
      const lcsMaoyan = computeLcsLength(vText, maoyanName)
      const consecutiveName = computeLcsConsecutive(vText, name)
      const consecutiveMaoyan = computeLcsConsecutive(vText, maoyanName)

      const matchVal = Math.max(lcsName, lcsMaoyan)
      const consecutiveVal = Math.max(consecutiveName, consecutiveMaoyan)

      const variantScore = matchVal * 20 + consecutiveVal * 10
      const weightedScore = variantScore * variant.weight
      if (weightedScore > maxScore) {
        maxScore = weightedScore
      }
    }
    return maxScore
  }

  const candidates = cinemas.map((cinema) => ({
    cinema,
    score: getMatchScore(cinema)
  }))

  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0]
  const maxLen = Math.max(...variants.map((v) => v.text.length))
  const threshold = Math.max(30, maxLen * 15)

  if (best && best.score >= threshold) {
    return best.cinema
  }
  return undefined
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

function getLocalOcrMissingFields(parsed: ParsedOcrTicket): string[] {
  const missing: string[] = []

  if (!parsed.cinemaName) {
    missing.push('影院')
  }

  if (!parsed.movieName) {
    missing.push('影片')
  }

  if (!parsed.date) {
    missing.push('日期')
  }

  if (!parsed.time) {
    missing.push('场次')
  }

  if (parsed.seats.length === 0) {
    missing.push('座位')
  }

  return missing
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

function mergePreferredAiOcrParsedTicket(parsed: ParsedOcrTicket, aiParsed: AiOcrParsedTicket): ParsedOcrTicket {
  return {
    ...parsed,
    cinemaName: aiParsed.cinemaName || parsed.cinemaName || '',
    movieName: aiParsed.movieName || parsed.movieName || '',
    date: aiParsed.date || parsed.date || '',
    time: aiParsed.time || parsed.time || '',
    hallName: aiParsed.hallName || parsed.hallName || '',
    language: aiParsed.language || parsed.language || '',
    price: aiParsed.price || parsed.price || '',
    seats: aiParsed.seats?.length ? aiParsed.seats : parsed.seats
  }
}

function getReadableLocalOcrMissingFields(parsed: ParsedOcrTicket): string[] {
  const missing: string[] = []

  if (!parsed.cinemaName) {
    missing.push('影院')
  }

  if (!parsed.movieName) {
    missing.push('影片')
  }

  if (!parsed.date) {
    missing.push('日期')
  }

  if (!parsed.time) {
    missing.push('场次')
  }

  if (parsed.seats.length === 0) {
    missing.push('座位')
  }

  return missing
}

function formatOcrParsedSummary(prefix: string, parsed: Pick<ParsedOcrTicket, 'cinemaName' | 'movieName' | 'date' | 'time' | 'hallName' | 'language' | 'seats'>): string {
  return `${prefix}：影院=${parsed.cinemaName || '-'}，影片=${parsed.movieName || '-'}，日期=${parsed.date || '-'}，时间=${parsed.time || '-'}，影厅=${parsed.hallName || '-'}，版本=${parsed.language || '-'}，座位=${parsed.seats.map((seat) => `${seat.rowName}-${seat.columnName}`).join(',') || '-'}`
}

function compactDateToken(value: string): string {
  return value.replace(/\D+/g, '')
}

function buildIsoDate(year: number, month: string, day: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function extractRawDateCandidates(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ')
  const year = new Date().getFullYear()
  const results: string[] = []
  const seen = new Set<string>()

  for (const match of normalized.matchAll(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/g)) {
    const candidate = buildIsoDate(Number(match[1]), match[2], match[3])

    if (!seen.has(candidate)) {
      seen.add(candidate)
      results.push(candidate)
    }
  }

  for (const match of normalized.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    const candidate = buildIsoDate(year, match[1], match[2])

    if (!seen.has(candidate)) {
      seen.add(candidate)
      results.push(candidate)
    }
  }

  return results
}

function findDateOptionFromRawText(options: TicketOption[], text: string, parsedDate = ''): TicketOption | undefined {
  const candidates = [...new Set([parsedDate, ...extractRawDateCandidates(text)].filter(Boolean))]

  for (const candidate of candidates) {
    const matched = findUnique(options, (item) => optionMatchesDate(item, candidate))

    if (matched) {
      return matched
    }
  }

  return undefined
}

function optionMatchesDate(option: TicketOption, date: string): boolean {
  const optionValue = String(option.value || '')
  const optionLabel = String(option.label || '')
  const compactOptionValue = compactDateToken(optionValue)
  const compactOptionLabel = compactDateToken(optionLabel)
  const compactDate = compactDateToken(date)

  return Boolean(
    optionValue === date ||
      optionLabel === date ||
      optionValue.includes(date) ||
      optionLabel.includes(date) ||
      (compactDate &&
        (compactOptionValue === compactDate ||
          compactOptionLabel === compactDate ||
          compactOptionValue.includes(compactDate) ||
          compactOptionLabel.includes(compactDate)))
  )
}

function optionMatchesTime(option: TicketOption, time: string): boolean {
  return option.value.includes(time) || option.label.includes(time)
}

function extractPrimaryShowtimeTime(text: string, parsedTime = ''): string {
  const normalized = text.replace(/\s+/g, ' ')
  const rangeMatch = normalized.match(/([01]?\d|2[0-3])[:：](\d{2})\s*-\s*([01]?\d|2[0-3])[:：](\d{2})/)

  if (rangeMatch) {
    return `${rangeMatch[1].padStart(2, '0')}:${rangeMatch[2]}`
  }

  if (parsedTime) {
    return parsedTime
  }

  const match = normalized.match(/([01]?\d|2[0-3])[:：](\d{2})/)

  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : ''
}

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.match(/^(\d{1,2})[:：](\d{2})/)
  if (!parts) return -1
  return Number(parts[1]) * 60 + Number(parts[2])
}

function findClosestShowtime(showtimes: TicketOption[], targetTime: string): TicketOption | undefined {
  if (!targetTime || showtimes.length === 0) return undefined
  const targetMin = parseTimeToMinutes(targetTime)
  if (targetMin === -1) return undefined
  let bestOption: TicketOption | undefined = undefined
  let minDiff = Infinity

  for (const option of showtimes) {
    const timeMin = parseTimeToMinutes(option.label)
    if (timeMin === -1) continue
    const diff = Math.abs(timeMin - targetMin)
    if (diff < minDiff && diff <= 30) {
      minDiff = diff
      bestOption = option
    }
  }
  return bestOption
}

function hasShowtimeHints(parsed: Pick<ParsedOcrTicket, 'time' | 'hallName' | 'language'>): boolean {
  return Boolean(parsed.time || parsed.hallName || parsed.language)
}

function normalizeHallKeyword(value: string): string {
  return value.replace(/银幕|影厅|厅|号|\s|-/g, '').trim().toLowerCase()
}

function normalizeVersionKeyword(value: string): string {
  return value.replace(/\s+/g, '').replace(/\dD$/i, '').trim().toLowerCase()
}

function findShowtimeByHallAndLanguage(
  showtimeItems: Array<{ dId: string; label: string; hallName?: string; raw?: unknown }>,
  parsed: Pick<ParsedOcrTicket, 'hallName' | 'language' | 'time'>
): TicketOption | undefined {
  const hallKeyword = parsed.hallName ? normalizeHallKeyword(parsed.hallName) : ''
  const languageKeyword = parsed.language ? normalizeVersionKeyword(parsed.language) : ''

  if (!hallKeyword && !languageKeyword) {
    return undefined
  }

  const matchedItem = showtimeItems.find((item) => {
    const labelText = item.label.replace(/\s+/g, '').toLowerCase()
    const hallText = normalizeHallKeyword(item.hallName || '')
    const rawRecord = asRecord(item.raw)
    const versionText = normalizeVersionKeyword(firstText(rawRecord.version, rawRecord.language, rawRecord.movieVersion))
    let matched = true

    if (hallKeyword) {
      matched = matched && (hallText.includes(hallKeyword) || labelText.includes(hallKeyword))
    }

    if (languageKeyword) {
      matched = matched && (versionText.includes(languageKeyword) || labelText.includes(languageKeyword))
    }

    return matched
  })

  if (!matchedItem) {
    return undefined
  }

  return {
    value: matchedItem.dId,
    label: matchedItem.label
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function waitForCondition(predicate: () => boolean, timeoutMs = 15000, intervalMs = 200): Promise<boolean> {
  const startTime = Date.now()
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval)
        resolve(true)
      } else if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval)
        resolve(false)
      }
    }, intervalMs)
  })
}

function computeLcsLength(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0))

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp[len1][len2]
}

function computeLcsConsecutive(str1: string, str2: string): number {
  const len1 = str1.length
  const len2 = str2.length
  const dp = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0))
  let maxLen = 0

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
        maxLen = Math.max(maxLen, dp[i][j])
      } else {
        dp[i][j] = 0
      }
    }
  }
  return maxLen
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
    couponPreviewPayableCent: -1,
    couponPreviewLoading: false,
    couponPreviewSerial: 0,
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
    selectedSeatTotalPriceCent(): number {
      return yuanToCents(this.selectedSeatTotalPrice)
    },
    selectedSeatSelectedCouponAmountCent(state): number {
      const total = state.selectedCoupons.reduce((sum, couponCode) => {
        const coupon = state.coupons.find((item) => item.code === couponCode || item.couponNo === couponCode)
        return sum + yuanToCents(coupon?.amount)
      }, 0)

      return Math.max(0, total)
    },
    selectedActivityPayablePriceCent(state): number {
      const seatTotal = this.selectedSeatTotalPriceCent
      if (seatTotal <= 0) return 0
      const selectedActivity = state.paymentActivity
        ? state.paymentActivities.find((activity) => activity.code === state.paymentActivity || activity.name === state.paymentActivity)
        : undefined
      return selectedActivity ? yuanToCents(selectedActivity.price) : seatTotal
    },
    selectedSeatPreviewPayablePriceCent(state): number {
      const seatTotal = this.selectedSeatTotalPriceCent

      if (seatTotal <= 0) {
        return 0
      }

      if (state.selectedCoupons.length > 0) {
        // 优先使用券分摊接口返回的真实应付价；接口未就绪/失败时回退到本地按面额估算
        if (state.couponPreviewPayableCent >= 0) {
          return Math.min(seatTotal, Math.max(0, state.couponPreviewPayableCent))
        }

        return Math.max(0, seatTotal - this.selectedSeatSelectedCouponAmountCent)
      }

      const selectedActivity = state.paymentActivity
        ? state.paymentActivities.find((activity) => activity.code === state.paymentActivity || activity.name === state.paymentActivity)
        : undefined

      return selectedActivity ? yuanToCents(selectedActivity.price) : seatTotal
    },
    selectedSeatPreviewDiscountPriceCent(): number {
      return Math.max(0, this.selectedSeatTotalPriceCent - this.selectedSeatPreviewPayablePriceCent)
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
    getActivityPayablePriceCent(activity: PaymentActivity | undefined): number {
      const seatTotal = this.selectedSeatTotalPriceCent
      if (seatTotal <= 0) return 0
      if (!activity) return seatTotal
      return yuanToCents(activity.price)
    },
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
    // 一键清空：城市、影院、影片、日期、场次及座位选择全部复位
    clearTicketQuery() {
      this.query.keyword = ''
      this.query.city = ''
      this.resetQueryAfterCityChange()
      this.showtimeError = ''
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
      ++this.couponPreviewSerial
      this.couponPreviewPayableCent = -1
      this.couponPreviewLoading = false
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

      if (!account?.ck) {
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
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const paymentSerial = ++this.paymentRequestSerial
      this.loadingPaymentData = true
      this.paymentPrerequisiteError = ''
      this.paymentDataMessage = ''

      try {
        const [statusResult, activityResult, cardsResult, couponsResult] = await Promise.allSettled([
          queryOrderStatus(orderId, account.ck, userIdentifier),
          fetchPaymentActivity(currentOrder.seats, orderId, currentOrder.showtimeId, account.ck, userIdentifier),
          fetchPayCards(orderId, account.ck, userIdentifier),
          fetchCoupons(currentOrder.seats, currentOrder.cinemaId, currentOrder.showtimeId, account.ck, userIdentifier)
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

      if (!account?.ck) {
        this.paymentDataMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.paymentDataMessage = '请切回创建订单的账号检查支付状态'
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const checkSerial = ++this.paymentCheckSerial
      this.checkingPayment = true
      this.paymentDataMessage = ''

      try {
        const status = await queryOrderStatus(orderId, account.ck, userIdentifier)

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
    async refreshSelectedCouponPreview(): Promise<void> {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      const selectedCoupons = this.selectedCoupons
        .map((couponCode) => this.coupons.find((coupon) => coupon.code === couponCode || coupon.couponNo === couponCode))
        .filter((coupon): coupon is CouponItem => Boolean(coupon))

      // 无券 / 缺少下单账号或订单上下文时，清空预览，让预览价回退到本地估算
      if (selectedCoupons.length === 0 || !currentOrder || !account?.ck || currentOrder.accountId !== account.id) {
        ++this.couponPreviewSerial
        this.couponPreviewPayableCent = -1
        this.couponPreviewLoading = false
        return
      }

      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const couponTypeCodes = selectedCoupons.map((coupon) => firstText(coupon.typeCode, coupon.code, coupon.couponNo))
      const serial = ++this.couponPreviewSerial
      this.couponPreviewLoading = true

      try {
        const selection = await selectCouponsForPayment(
          currentOrder.seats,
          currentOrder.cinemaId,
          couponTypeCodes,
          account.ck,
          userIdentifier
        )

        if (serial !== this.couponPreviewSerial) {
          return
        }

        this.couponPreviewPayableCent = selection.payablePriceCent
      } catch (error) {
        if (serial !== this.couponPreviewSerial) {
          return
        }

        // 预览失败不阻塞下单，回退到本地估算
        this.couponPreviewPayableCent = -1
        const message = error instanceof Error && error.message ? error.message : '兑换券预览价格获取失败'
        useLogsStore().addLog('支付前置', account.phone, `兑换券预览价格获取失败：${message}`)
      } finally {
        if (serial === this.couponPreviewSerial) {
          this.couponPreviewLoading = false
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
        ? this.paymentActivities.find((activity) => activity.code === this.paymentActivity || activity.name === this.paymentActivity)
        : undefined
      const selectedCards = this.selectedPaymentCards
        .map((cardNo) => this.paymentCards.find((card) => card.cardNo === cardNo))
        .filter((card): card is PaymentCard => Boolean(card))
        .slice(0, 5)

      if (this.paymentActivity && !selectedActivity) {
        throw new Error('当前支付活动已失效，请刷新支付前置数据后重试')
      }

      const isCouponPayment = Boolean(couponPaymentInfo)
      const primaryCard = selectedCards[0]
      const seatTotalPriceCent = Math.max(0, currentOrder.amountCent)

      // 旧版口径：应付总盘子 = 券后价 / 活动价 / 座位全价（单字段，分）
      // 无券无活动时全价走外部支付，若不给全价 externalPayment 会是 0 导致后端「支付失败」
      const totalPayPriceCent = couponPaymentInfo
        ? Math.max(0, Math.round(couponPaymentInfo.useResult.price))
        : selectedActivity
          ? yuanToCents(selectedActivity.price)
          : seatTotalPriceCent

      // 逐卡分摊：券模式不分摊卡；否则前 5 张选中卡按 min(余额, 剩余) 递减
      const cardsToAllot = isCouponPayment ? [] : selectedCards
      let remainingCardPrice = totalPayPriceCent
      const storedCardPayments: TicketStoredCardPayment[] = []

      for (const card of cardsToAllot) {
        if (remainingCardPrice <= 0) {
          break
        }

        const cardBalance = yuanToCents(card.balance)
        const paymentPrice = Math.min(cardBalance, remainingCardPrice)

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
        remainingCardPrice -= paymentPrice
      }

      const externalPaymentPrice = Math.max(0, remainingCardPrice)
      const discountPrice = Math.max(0, seatTotalPriceCent - totalPayPriceCent)

      const requestInfo: BuiltTicketPaymentRequestInfo = {
        contextId: '',
        currentPrice: 0,
        externalPayment: {
          paySdkId: 1057,
          paymentPrice: externalPaymentPrice,
          paymentType: 1057,
          returnUrl: 'wandafilm/pay/finished'
        },
        goodInfo: '',
        orderId: String(currentOrder.orderId)
      }

      if (couponPaymentInfo) {
        requestInfo.ticketVoucher = {
          discountPrice,
          voucher: couponPaymentInfo.selection.voucher
        }
      }

      if (!isCouponPayment && selectedActivity && selectedActivity.allotSeat) {
        requestInfo.activity = {
          allotJson: selectedActivity.allotSeatRaw || '{}',
          ...(primaryCard ? { card: { cardNumber: primaryCard.cardNo, quantity: 0 } } : {}),
          discountPrice,
          integral: 0,
          ticketType: selectedActivity.code,
          ticketTypeName: primaryCard?.cardTypeName ?? '',
          type: selectedActivity.detailType
        }
      }

      if (storedCardPayments.length > 0) {
        requestInfo.cardPayment = storedCardPayments[0]
        requestInfo.storedCardPayments = storedCardPayments
      }

      if (couponPaymentInfo) {
        requestInfo.couponPaymentList = couponPaymentInfo.useResult.itemList.map((item) => ({
          actuallyPaidAmount: item.payPrice ?? item.actuallyPaidAmount,
          rightsCode: '',
          seatId: Number(item.seat ?? item.seatId),
          ticketCode: '',
          ticketType: 0,
          usedCoupon: 1
        }))
      }

      Object.assign(requestInfo, { verifyCode: '' })

      return requestInfo
    },
    async submitCurrentOrderPayment() {
      const account = useAccountsStore().currentAccount
      const currentOrder = this.currentOrder

      if (account?.ck && !account.userIdentifier) {
        account.userIdentifier = DEFAULT_WANDA_USER_IDENTIFIER
      }

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
        // 出票成功后主动拉一次出票记录，刷新「今日出票」计数
        void useAccountsStore().refreshTodayTicketCount(accountId)

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
        // 储值卡/券全额支付（无外部支付）：出票需要几秒，改为轮询取票码，避免一次性查询过早取不到码导致不弹取票码
        void this.startTicketCodePolling()
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

      if (!account?.ck) {
        this.currentOrderMessage = '请先选择创建订单的已登录账号'
        return
      }

      if (currentOrder.accountId !== account.id) {
        this.currentOrderMessage = '请切回创建订单的账号刷新取票码'
        return
      }

      const orderId = currentOrder.orderId
      const accountId = account.id
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const checkSerial = ++this.paymentCheckSerial
      this.checkingPayment = true
      this.currentOrderMessage = ''

      try {
        const payInfo = await queryOrderByUserId(orderId, account.ck, userIdentifier)

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

      if (!account?.ck) {
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
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
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
            const status = await queryOrderStatus(orderId, account.ck, userIdentifier)

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
            const payInfo = await queryOrderByUserId(orderId, account.ck, userIdentifier)

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

      const cityPinyin = buildNamePinyin(name)

      cityMap.set(id, {
        id,
        name,
        pinyin: firstText(record.pinyin) || cityPinyin.pinyin,
        firstLetter: firstText(record.firstLetter) || cityPinyin.firstLetter,
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

      const cinemaPinyin = buildNamePinyin(name)

      this.mergeCinemaRecord(cinemaMap, {
        id,
        cityId,
        name,
        address: firstText(record.address, record.CmAdd),
        pinyin: firstText(record.pinyin) || cinemaPinyin.pinyin,
        firstLetter: firstText(record.firstLetter) || cinemaPinyin.firstLetter,
        maoyanName: firstText(record.maoyanName, record.MyCmName),
        raw: item
      })
    },
    applyPreviewTicketData() {
      const city: CityRecord = { id: 'preview-city-beijing', name: '北京', raw: {} }
      const cinema: CinemaRecord = {
        id: 'preview-cinema-cbd',
        cityId: city.id,
        name: '北京CBD万达影城',
        address: '北京CBD',
        raw: {}
      }
      const showtime: ShowtimeItem = {
        dId: 'preview-showtime-1930',
        label: '19:30 中文2D',
        startTime: '19:30',
        hallName: 'IMAX厅',
        filmId: 'preview-movie-kowloon',
        date: '2026-06-30',
        raw: {}
      }
      const seats: SeatNode[] = []

      for (let row = 1; row <= 9; row += 1) {
        for (let column = 1; column <= 16; column += 1) {
          const occupied = row <= 2 && column >= 4 && column <= 7
          const zone: SeatZone =
            row === 4 && [4, 5, 12, 13].includes(column)
              ? 'vip'
              : row === 6 && [3, 4, 5, 12, 13].includes(column)
                ? 'preferred'
                : 'normal'

          seats.push({
            id: `preview-${row}-${column}`,
            rowLabel: String(row),
            columnLabel: String(column),
            coordx: column - 1,
            coordy: row - 1,
            status: occupied ? 'occupied' : 'available',
            zone,
            price: 60,
            seatId: `preview-seat-${row}-${column}`,
            areaId: zone,
            raw: {
              row,
              column,
              coordx: column - 1,
              coordy: row - 1,
              status: occupied ? 0 : 1,
              seatId: `preview-seat-${row}-${column}`,
              areaId: zone
            }
          })
        }
      }

      const selectedSeats = seats.filter((seat) => seat.rowLabel === '5' && ['7', '8'].includes(seat.columnLabel))

      this.query = {
        keyword: '北京CBD万达影城',
        city: city.id,
        cinema: cinema.id,
        movie: 'preview-movie-kowloon',
        date: '2026-06-30',
        showtime: showtime.dId
      }
      this.cityRecords = [city]
      this.cinemaRecords = [cinema]
      this.cities = [{ label: city.name, value: city.id }]
      this.cinemas = [{ label: cinema.name, value: cinema.id }]
      this.movies = [{ label: '九龙城寨之围城', value: 'preview-movie-kowloon' }]
      this.dates = [{ label: '2026-06-30 今天', value: '2026-06-30' }]
      this.showtimes = [{ label: showtime.label, value: showtime.dId }]
      this.showtimeItems = [showtime]
      this.currentShowtime = showtime
      this.seatNodes = seats
      this.selectedSeatNodes = selectedSeats
      this.selectedSeats = selectedSeats.map((seat) => ({
        id: seat.id,
        rowName: seat.rowLabel,
        columnName: seat.columnLabel,
        areaName: seat.zone
      }))
      this.paymentActivities = [
        {
          code: 'preview-activity',
          name: '满减活动',
          price: 0,
          channelPrice: 0,
          able: true,
          groupName: '预览活动',
          groupType: 'preview',
          note: '',
          typeCode: 'stored-card',
          detailType: '',
          allotSeat: null,
          allotSeatRaw: '',
          raw: {}
        }
      ]
      this.paymentCards = [
        {
          cardNo: 'preview-card',
          cardName: '储值卡',
          cardTypeName: '万达储值卡',
          cardTypeCode: 'stored-card',
          balance: 300,
          available: true,
          statusDesc: '可用',
          raw: {}
        }
      ]
      this.coupons = [
        {
          code: 'preview-coupon-1',
          name: '兑换券',
          couponNo: 'preview-coupon-1',
          voucherNo: 'preview-voucher-1',
          couponTypeName: '影票券',
          typeCode: 'ticket',
          able: true,
          amount: 0,
          validity: '2025-12-31',
          detailTypeName: '通用券',
          couponCategoryName: '影票',
          raw: {}
        }
      ]
      this.showtimeError = 'OCR 已匹配：影院、影片、日期、场次、座位 2 个'
      this.seatError = ''
      this.paymentDataMessage = ''
      this.paymentPrerequisiteError = ''
    },
    async loadCityData() {
      const result = await window.wandaApp?.readLocalData('city')

      if (!result?.ok) {
        if (import.meta.env.DEV && !window.wandaApp) {
          this.applyPreviewTicketData()
          return
        }

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

      if (!account?.ck || !cinemaId) {
        this.showtimeError = '请先选择已登录万达账号和影院'
        return
      }

      const requestSerial = ++this.showtimeRequestSerial
      const accountId = account.id
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      this.loadingShowtimes = true
      this.showtimeError = ''

      try {
        const rawShowtimeData = await fetchCinemaShowtime(cinemaId, account.ck, userIdentifier)

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

      if (account?.ck && !account.userIdentifier) {
        account.userIdentifier = DEFAULT_WANDA_USER_IDENTIFIER
      }

      if (!account?.ck || !account.userIdentifier || !this.currentShowtime) {
        this.clearSeatData()
        this.seatError = '请先选择已登录万达账号和真实场次'
        return
      }

      const seatSerial = ++this.seatRequestSerial
      const dId = this.currentShowtime.dId
      const accountId = account.id
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      this.loadingSeats = true
      this.seatError = ''

      try {
        const seatData = await fetchRealTimeSeat(dId, account.ck, userIdentifier)

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
    async applyParsedOcrTicketLegacy(parsed: ParsedOcrTicket) {
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
        let showtime = findUnique(this.showtimes, (item) => optionMatchesTime(item, parsed.time))

        if (!showtime) {
          showtime = findClosestShowtime(this.showtimes, parsed.time)
        }

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
    async applyParsedOcrTicket(parsed: ParsedOcrTicket) {
      const account = useAccountsStore().currentAccount
      const applied: string[] = []

      const stopMatching = (message: string, logMessage = message) => {
        this.showtimeError = applied.length > 0 ? `OCR \u5df2\u5339\u914d\uff1a${applied.join('\u3001')}\uff0c${message}` : message
        useLogsStore().addLog('OCR\u8bc6\u522b', account?.phone || '-', logMessage)
      }

      if (parsed.cinemaName || parsed.movieName) {
        this.query.keyword = parsed.cinemaName || parsed.movieName
      }

      if (parsed.cinemaName) {
        // 影院名可能多城市重名（如「万达广场IMAX店」），优先用 OCR 里的城市缩小范围再匹配
        const ocrCityId = resolveOcrCityId(this.cityRecords, parsed.cityName)
        const cinemaPool = ocrCityId
          ? this.cinemaRecords.filter((item) => item.cityId === ocrCityId)
          : this.cinemaRecords
        const cinema =
          findUniqueCinemaByText(cinemaPool, parsed.cinemaName) ||
          (ocrCityId ? findUniqueCinemaByText(this.cinemaRecords, parsed.cinemaName) : undefined)

        if (!cinema) {
          const cinemaKeyword = parsed.cinemaName.replace(/\s+/g, '').slice(0, 8)

          if (cinemaKeyword.length >= 2) {
            this.query.keyword = cinemaKeyword
          }

          stopMatching(
            'OCR \u672a\u7cbe\u786e\u5339\u914d\u5230\u5f71\u9662\uff0c\u5df2\u6309\u5173\u952e\u8bcd\u7b5b\u51fa\u7ed3\u679c\uff0c\u8bf7\u624b\u52a8\u9009\u62e9',
            'OCR \u672a\u7cbe\u786e\u5339\u914d\u5230\u5f71\u9662'
          )
          return
        }

        if (this.query.city !== cinema.cityId) {
          this.query.city = cinema.cityId
          this.selectCity()
        }

        this.query.cinema = cinema.id
        // \u5f71\u9662\u5df2\u7cbe\u786e\u5339\u914d\uff0c\u6e05\u7a7a\u641c\u7d22\u5173\u952e\u8bcd\uff0c\u5426\u5219\u57ce\u5e02/\u5f71\u9662\u4e0b\u62c9\u4f1a\u4e00\u76f4\u88ab\u5f71\u9662\u540d\u8fc7\u6ee4\u4f4f\u5bfc\u81f4\u65e0\u6cd5\u5207\u6362\u57ce\u5e02
        this.query.keyword = ''
        applied.push('\u5f71\u9662')
        await this.loadCinemaShowtimes()

        const moviesReady = await waitForCondition(() => this.movies.length > 0, 7500)
        if (!moviesReady) {
          stopMatching(
            '\u7535\u5f71\u5217\u8868\u52a0\u8f7d\u8d85\u65f6',
            'OCR \u5339\u914d\u4e2d\u65ad\uff1a\u7535\u5f71\u5217\u8868\u52a0\u8f7d\u8d85\u65f6'
          )
          return
        }
      }

      if (this.movies.length > 0) {
        let movie: TicketOption | undefined

        if (parsed.movieName) {
          movie = findUniqueOptionByText(this.movies, parsed.movieName)
        }

        if (!movie && parsed.movieName) {
          stopMatching(
            'OCR \u672a\u5339\u914d\u5230\u5f71\u7247\uff0c\u8bf7\u624b\u52a8\u9009\u62e9',
            'OCR \u672a\u5339\u914d\u5230\u5f71\u7247'
          )
          return
        }

        if (movie) {
          this.query.movie = movie.value
          this.selectMovie()
          applied.push('\u5f71\u7247')

          if (this.dates.length === 0) {
            stopMatching(
              '\u5f53\u524d\u5f71\u7247\u6682\u65e0\u53ef\u9009\u65e5\u671f',
              'OCR \u5339\u914d\u4e2d\u65ad\uff1a\u5f53\u524d\u5f71\u7247\u6682\u65e0\u53ef\u9009\u65e5\u671f'
            )
            return
          }
        }
      }

      if (this.dates.length > 0) {
        let date: TicketOption | undefined

        if (parsed.date) {
          date = findUnique(this.dates, (item) => optionMatchesDate(item, parsed.date))
        }

        if (!date) {
          date = findDateOptionFromRawText(this.dates, parsed.rawText, parsed.date)
        }

        if (!date && !parsed.date && this.dates.length === 1) {
          date = this.dates[0]
        }

        if (!date) {
          stopMatching(
            'OCR \u672a\u5339\u914d\u5230\u65e5\u671f\uff0c\u8bf7\u624b\u52a8\u9009\u62e9',
            `OCR \u672a\u5339\u914d\u5230\u65e5\u671f\uff1a\u8bc6\u522b=${parsed.date || '-'}\uff0c\u53ef\u9009=${this.dates.map((item) => item.label || item.value).join(',') || '-'}`
          )
          return
        }

        if (date) {
          this.query.date = date.value
          this.selectDate()
          applied.push('\u65e5\u671f')

          if (this.showtimes.length === 0) {
            stopMatching(
              '\u5f53\u524d\u65e5\u671f\u6682\u65e0\u53ef\u9009\u573a\u6b21',
              'OCR \u5339\u914d\u4e2d\u65ad\uff1a\u5f53\u524d\u65e5\u671f\u6682\u65e0\u53ef\u9009\u573a\u6b21'
            )
            return
          }
        }
      }

      const targetShowtime = extractPrimaryShowtimeTime(parsed.rawText, parsed.time)

      if ((hasShowtimeHints(parsed) || targetShowtime) && this.showtimes.length > 0) {
        let showtime = targetShowtime ? findUnique(this.showtimes, (item) => optionMatchesTime(item, targetShowtime)) : undefined

        if (!showtime) {
          showtime = findShowtimeByHallAndLanguage(this.showtimeItems, {
            ...parsed,
            time: targetShowtime || parsed.time
          })
        }

        if (!showtime && targetShowtime) {
          showtime = findClosestShowtime(this.showtimes, targetShowtime)
        }

        if (!showtime) {
          stopMatching(
            'OCR \u672a\u5339\u914d\u5230\u573a\u6b21\uff0c\u8bf7\u624b\u52a8\u9009\u62e9',
            `OCR \u672a\u5339\u914d\u5230\u573a\u6b21\uff1a\u65f6\u95f4=${targetShowtime || parsed.time || '-'}\uff0c\u5f71\u5385=${parsed.hallName || '-'}\uff0c\u7248\u672c=${parsed.language || '-'}` 
          )
          return
        }

        this.query.showtime = showtime.value
        this.setShowtime()
        applied.push('\u573a\u6b21')

        if (this.canRefreshSeats) {
          await this.loadRealTimeSeats()
          const seatsReady = await waitForCondition(() => this.seatNodes.length > 0, 15000)

          if (!seatsReady) {
            stopMatching(
              '\u5ea7\u4f4d\u52a0\u8f7d\u8d85\u65f6',
              'OCR \u5339\u914d\u4e2d\u65ad\uff1a\u5ea7\u4f4d\u52a0\u8f7d\u8d85\u65f6'
            )
            return
          }
        }
      }

      if (parsed.seats.length > 0) {
        if (this.seatNodes.length === 0 && this.canRefreshSeats) {
          await this.loadRealTimeSeats()
          const seatsReady = await waitForCondition(() => this.seatNodes.length > 0, 15000)

          if (!seatsReady) {
            stopMatching(
              '\u5ea7\u4f4d\u52a0\u8f7d\u8d85\u65f6',
              'OCR \u5339\u914d\u4e2d\u65ad\uff1a\u5ea7\u4f4d\u52a0\u8f7d\u8d85\u65f6'
            )
            return
          }
        }

        const selectedCount = this.selectSeatsByParsedOcr(parsed)

        if (selectedCount > 0) {
          applied.push(`\u5ea7\u4f4d ${selectedCount} \u4e2a`)
        }
      }

      this.showtimeError =
        applied.length > 0
          ? `OCR \u5df2\u5339\u914d\uff1a${applied.join('\u3001')}`
          : 'OCR \u5df2\u8bc6\u522b\uff0c\u8bf7\u5148\u52a0\u8f7d\u771f\u5b9e\u57ce\u5e02\u3001\u5f71\u9662\u3001\u5f71\u7247\u548c\u573a\u6b21\u540e\u518d\u5339\u914d'

      useLogsStore().addLog(
        'OCR\u8bc6\u522b',
        account?.phone || '-',
        applied.length > 0
          ? `OCR \u5339\u914d\u6210\u529f\uff1a${applied.join('\u3001')}`
          : 'OCR \u5df2\u8bc6\u522b\u4f46\u672a\u5339\u914d\u5230\u5f53\u524d\u771f\u5b9e\u6570\u636e'
      )
    },
    async applyOcrTicketText(text: string): Promise<ParsedOcrTicket> {
      if (isLikelyToolUiOcrText(text)) {
        throw new Error('检测到当前识别的是本工具界面截图，请复制万达票面或选座截图后再试')
      }

      const parsed = parseOcrTicketText(text)
      let finalParsed = parsed
      const account = useAccountsStore().currentAccount
      const seatSelectionContext = isLikelySeatSelectionOcrText(parsed.rawText)

      useLogsStore().addLog(
        'OCR识别',
        account?.phone || '-',
        `本地解析：影院=${parsed.cinemaName || '-'}，影片=${parsed.movieName || '-'}，日期=${parsed.date || '-'}，时间=${parsed.time || '-'}，影厅=${parsed.hallName || '-'}，版本=${parsed.language || '-'}，座位=${parsed.seats.map((seat) => `${seat.rowName}-${seat.columnName}`).join(',') || '-'}`
      )

      useLogsStore().addLog('OCR识别', account?.phone || '-', formatOcrParsedSummary('本地解析', parsed))

      const localMissingFields = getReadableLocalOcrMissingFields(parsed)

      if (seatSelectionContext || needsAiOcrFallback(parsed)) {
        if (seatSelectionContext || localMissingFields.length >= 2) {
          this.showtimeError = `本地匹配缺失[${localMissingFields.join('、') || '关键信息'}]，AI 智能分析中...`
          useLogsStore().addLog(
            'AI OCR',
            account?.phone || '-',
            `本地匹配缺失[${localMissingFields.join('、') || '关键信息'}]，开始 AI 兜底分析`
          )
        }

        const result = await window.wandaApp?.aiParseOcr({ text: parsed.rawText, words: parsed.words })

        if (result?.ok) {
          finalParsed = seatSelectionContext
            ? mergePreferredAiOcrParsedTicket(parsed, result.data)
            : mergeAiOcrParsedTicket(parsed, result.data)
          useLogsStore().addLog(
            'AI OCR',
            account?.phone || '-',
            `AI兜底解析：影院=${result.data.cinemaName || '-'}，影片=${result.data.movieName || '-'}，日期=${result.data.date || '-'}，时间=${result.data.time || '-'}，影厅=${result.data.hallName || '-'}，版本=${result.data.language || '-'}，座位=${result.data.seats?.map((seat) => `${seat.rowName}-${seat.columnName}`).join(',') || '-'}`
          )
        } else if (result?.error) {
          useLogsStore().addLog('AI OCR', account?.phone || '-', `AI 兜底跳过：${result.error}`)
        }
      }

      useLogsStore().addLog(
        'OCR识别',
        account?.phone || '-',
        `最终解析：影院=${finalParsed.cinemaName || '-'}，影片=${finalParsed.movieName || '-'}，日期=${finalParsed.date || '-'}，时间=${finalParsed.time || '-'}，影厅=${finalParsed.hallName || '-'}，版本=${finalParsed.language || '-'}，座位=${finalParsed.seats.map((seat) => `${seat.rowName}-${seat.columnName}`).join(',') || '-'}`
      )

      useLogsStore().addLog('OCR识别', account?.phone || '-', formatOcrParsedSummary('最终解析', finalParsed))

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
        userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER,
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

      if (!account?.ck || !this.currentOrderId) {
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
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
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
