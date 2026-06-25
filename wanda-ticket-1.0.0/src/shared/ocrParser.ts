export interface ParsedOcrSeat {
  rowName: string
  columnName: string
  rawText: string
}

export interface ParsedOcrTicket {
  rawText: string
  words: string[]
  cinemaName: string
  movieName: string
  date: string
  time: string
  hallName: string
  language: string
  price: string
  seats: ParsedOcrSeat[]
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeSeparators(value: string): string {
  return value.replace(/[：﹕]/g, ':').replace(/[【】\[\]]/g, '')
}

function splitWords(text: string): string[] {
  return text
    .split(/\r?\n|\|/)
    .map((line) => cleanText(normalizeSeparators(line)))
    .filter(Boolean)
}

function valueAfterLabel(line: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|\\s)${label}\\s*[:：]?\\s*(.+)$`)
    const match = line.match(pattern)

    if (match?.[1]) {
      return cleanText(match[1])
    }
  }

  return ''
}

function firstValueByLabels(words: string[], labels: string[]): string {
  for (const word of words) {
    const value = valueAfterLabel(word, labels)

    if (value) {
      return value
    }
  }

  return ''
}

function currentYear(): number {
  return new Date().getFullYear()
}

function compactDateToken(value: string): string {
  return value.replace(/\D+/g, '')
}

function isLikelyStatusBarWord(word: string): boolean {
  return /^(?:\d{1,2}:\d{2}|\d+(?:\.\d+)?|[A-Za-z0-9.+/-]{1,6}|<{1,2}|>{1,2}|\.\.\.)$/.test(word)
}

function isLikelyMovieCandidate(word: string): boolean {
  if (word.length < 2) return false
  if (isLikelyStatusBarWord(word)) return false
  if (/[¥￥$]\s*\d/.test(word)) return false
  if (/\d{1,2}\s*[排座]/.test(word)) return false
  if (/(影城|影院|日期|时间|场次|影厅|座位|合计|金额|价格|确认选座|切换场次|已售|通知|说明)/.test(word)) {
    return false
  }
  if (/(IMAX|2D|3D|国语|英语|杜比|VIP)/i.test(word)) return false
  return true
}

function isLikelyScheduleWord(word: string): boolean {
  return (
    /(?:今天|明天|后天|今日|翌日)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日?.*\d{1,2}:\d{2}/.test(word) ||
    /20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}.*\d{1,2}:\d{2}/.test(word) ||
    /\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(word)
  )
}

function isNoiseMovieWord(word: string): boolean {
  return /^(已售|特惠区|普通区|优选|优选区|情侣区|vip区|会员|w\+会员区|说明|通知|确认选座|1\.3米|无座|已取消|换场次|切换场次)$/i.test(
    word
  )
}

function normalizeMovieCandidateWord(word: string): string {
  return cleanText(
    word
      .replace(/切换场次|确认选座|已售|通知|说明/g, ' ')
      .replace(/[¥￥]\s*\d+(?:\.\d{1,2})?/g, ' ')
      .replace(/(?:今天|明天|后天|今日|翌日)?\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g, ' ')
      .replace(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/g, ' ')
      .replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, ' ')
      .replace(/\d{1,2}:\d{2}/g, ' ')
      .replace(/(IMAX|2D|3D|国语|英语|杜比|VIP|原版|粤语)/gi, ' ')
      .replace(/(特惠区|普通区|优选区|情侣区|情侣座|vip区|w\+会员区)/gi, ' ')
      .replace(/\s+/g, ' ')
  )
}

function normalizeDate(value: string): string {
  const isoMatch = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  const relativeMatch = value.match(/(?:今天|明天|后天|今日|翌日)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)

  if (relativeMatch) {
    return `${currentYear()}-${relativeMatch[1].padStart(2, '0')}-${relativeMatch[2].padStart(2, '0')}`
  }

  const monthDayMatch = value.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)

  if (monthDayMatch) {
    return `${currentYear()}-${monthDayMatch[1].padStart(2, '0')}-${monthDayMatch[2].padStart(2, '0')}`
  }

  return ''
}

function normalizeDateFromJoinedText(value: string): string {
  return normalizeDate(value)
}

function findDate(words: string[]): string {
  const labeled = firstValueByLabels(words, ['日期', '观影日期', '放映日期', '场次日期'])
  const labeledDate = normalizeDate(labeled)

  if (labeledDate) {
    return labeledDate
  }

  for (const word of words) {
    const date = normalizeDate(word)

    if (date) {
      return date
    }
  }

  return ''
}

function findTime(words: string[]): string {
  const labeled = firstValueByLabels(words, ['时间', '场次', '放映时间', '开场时间'])
  const candidates = [labeled, ...words.filter((word) => !isLikelyStatusBarWord(word))]

  for (const word of candidates) {
    const match = word.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：点时]([0-5]\d)(?:[^\d]|$)/)

    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`
    }
  }

  return ''
}

function findCinema(words: string[]): string {
  const labeled = firstValueByLabels(words, ['影院名称', '影院', '影城', '电影院'])

  if (labeled) {
    return labeled
  }

  return words.find((word) => /万达.*(影城|影院)|影城|影院/.test(word)) ?? ''
}

function findMovie(words: string[]): string {
  const labeled = firstValueByLabels(words, ['影片名称', '影片', '电影', '片名'])

  if (labeled) {
    return labeled
  }

  return words.find((word) => isLikelyMovieCandidate(word)) ?? ''
}

function findHall(words: string[]): string {
  const labeled = firstValueByLabels(words, ['影厅', '厅号', '影厅名称'])

  if (labeled) {
    return labeled
  }

  for (const word of words) {
    const match = word.match(/([\w一二三四五六七八九十\d-]*(?:IMAX|VIP|杜比|巨幕)?[\w一二三四五六七八九十\d-]*厅)/)

    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

function findPrice(words: string[]): string {
  const labeled = firstValueByLabels(words, ['合计', '总价', '金额', '价格'])
  const candidates = [labeled, ...words]

  for (const word of candidates) {
    const match = word.match(/[￥¥]\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*元/)

    if (match) {
      return match[1] ?? match[2] ?? ''
    }
  }

  return ''
}

function findLanguage(words: string[]): string {
  const labeled = firstValueByLabels(words, ['语言版本', '版本', '制式'])

  if (labeled) {
    return labeled
  }

  return words.find((word) => /(IMAX|2D|3D|杜比|国语|原版|粤语|英语)/i.test(word)) ?? ''
}

function findSeats(text: string): ParsedOcrSeat[] {
  const seats: ParsedOcrSeat[] = []
  const seen = new Set<string>()
  const pattern = /(\d{1,2})\s*排\s*(\d{1,2})\s*(?:座|号)?/g
  let match = pattern.exec(text)

  while (match) {
    const rowName = match[1]
    const columnName = match[2]
    const key = `${rowName}-${columnName}`

    if (!seen.has(key)) {
      seen.add(key)
      seats.push({
        rowName,
        columnName,
        rawText: match[0]
      })
    }

    match = pattern.exec(text)
  }

  return seats
}

function findDateEnhanced(words: string[]): string {
  const parsed = findDate(words)

  if (parsed) {
    return parsed
  }

  const joinedDate = normalizeDateFromJoinedText(words.join(' '))

  if (joinedDate) {
    return joinedDate
  }

  return ''
}

function findScheduleContextIndex(words: string[]): number {
  return words.findIndex((word) => isLikelyScheduleWord(word))
}

function findMovieNearSchedule(words: string[]): string {
  for (const word of words) {
    const match = word.match(/^(.+?)\s*切换场次$/)

    if (!match?.[1]) {
      continue
    }

    const candidate = cleanText(match[1])

    if (candidate && candidate.length >= 3 && isLikelyMovieCandidate(candidate) && !isNoiseMovieWord(candidate)) {
      return candidate
    }
  }

  const scheduleIndex = findScheduleContextIndex(words)

  if (scheduleIndex >= 0) {
    for (const index of [scheduleIndex - 1, scheduleIndex - 2, scheduleIndex]) {
      const word = words[index]

      if (!word) {
        continue
      }

      const normalized = normalizeMovieCandidateWord(word)

      if (
        normalized &&
        normalized.length >= 3 &&
        isLikelyMovieCandidate(normalized) &&
        !isNoiseMovieWord(normalized)
      ) {
        return normalized
      }
    }
  }

  return ''
}

function findDateFromSchedule(words: string[]): string {
  const scheduleIndex = findScheduleContextIndex(words)

  if (scheduleIndex >= 0) {
    const scheduleDate = normalizeDateFromJoinedText(words[scheduleIndex])

    if (scheduleDate) {
      return scheduleDate
    }
  }

  return normalizeDateFromJoinedText(words.join(' '))
}

function findDateFromScheduleText(text: string): string {
  return normalizeDateFromJoinedText(normalizeSeparators(text).replace(/\s+/g, ' '))
}

function findTimeFromSchedule(words: string[]): string {
  const scheduleIndex = findScheduleContextIndex(words)
  const candidates =
    scheduleIndex >= 0
      ? [words[scheduleIndex], words[scheduleIndex - 1], words[scheduleIndex + 1]].filter(Boolean)
      : words

  for (const word of candidates) {
    const match = word.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：点时]([0-5]\d)(?:[^\d]|$)/)

    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`
    }
  }

  return ''
}

function findTimeFromScheduleText(text: string): string {
  const normalized = normalizeSeparators(text)
  const match = normalized.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：点时]([0-5]\d)(?:[^\d]|$)/)

  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }

  return ''
}

function findLanguageFromSchedule(words: string[]): string {
  const scheduleIndex = findScheduleContextIndex(words)
  const candidates =
    scheduleIndex >= 0
      ? [words[scheduleIndex], words[scheduleIndex - 1], words[scheduleIndex + 1]].filter(Boolean)
      : words

  for (const word of candidates) {
    const match = word.match(/(IMAX|2D|3D|杜比|国语|原版|粤语|英语)/i)

    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

function findLanguageFromScheduleText(text: string): string {
  const match = normalizeSeparators(text).match(/(IMAX|2D|3D|杜比|国语|原版|粤语|英语)/i)

  return match?.[1] ?? ''
}

function findTimeEnhanced(words: string[]): string {
  for (const word of words) {
    if (isLikelyStatusBarWord(word)) {
      continue
    }

    const match = word.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：点时]([0-5]\d)(?:[^\d]|$)/)

    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`
    }
  }

  return findTime(words)
}

function findCinemaEnhanced(words: string[]): string {
  const parsed = findCinema(words)

  if (parsed && !/(影城内|影院内|禁止吸烟|通知|说明|确认选座|切换场次|已售)/.test(parsed)) {
    return parsed
  }

  const candidates = words
    .filter((word) => /(万达.*(影城|影院)|影城|影院)/.test(word))
    .filter((word) => !/(影城内|影院内|禁止吸烟|通知|说明|确认选座|切换场次|已售)/.test(word))
    .sort((left, right) => {
      const leftScore = (left.includes('万达') ? 20 : 0) + (/[（(].+[）)]/.test(left) ? 10 : 0) + left.length
      const rightScore = (right.includes('万达') ? 20 : 0) + (/[（(].+[）)]/.test(right) ? 10 : 0) + right.length
      return rightScore - leftScore
    })

  return candidates[0] ?? ''
}

function findMovieEnhanced(words: string[]): string {
  const isSeatSelectionContext = words.some((word) => /(切换场次|确认选座)/.test(word)) || words.some((word) => isLikelyScheduleWord(word))
  const scheduleMovie = findMovieNearSchedule(words)

  if (scheduleMovie) {
    return scheduleMovie
  }

  if (isSeatSelectionContext) {
    return ''
  }

  const parsed = findMovie(words)

  if (parsed && isLikelyMovieCandidate(parsed) && !/(优惠|优选|普通区|特惠区|情侣区|情侣座|vip区|w\+会员区)/i.test(parsed)) {
    return parsed
  }

  return (
    words.find(
      (word) =>
        isLikelyMovieCandidate(word) && !/(优惠|优选|普通区|特惠区|情侣区|情侣座|vip区|w\+会员区)/i.test(word)
    ) ?? ''
  )
}

function findSeatsEnhanced(text: string): ParsedOcrSeat[] {
  return findSeats(text)
}

export function isLikelySeatSelectionOcrText(text: string): boolean {
  const normalized = text.replace(/\s+/g, '')

  return (
    /(切换场次|确认选座)/.test(normalized) ||
    (/\d{1,2}排\d{1,2}座/.test(normalized) && /(国语|英语|2D|3D|IMAX)/i.test(normalized))
  )
}

export function parseOcrTicketText(text: string): ParsedOcrTicket {
  const rawText = text.trim()
  const words = splitWords(rawText)
  const seatSelectionContext = isLikelySeatSelectionOcrText(rawText)

  return {
    rawText,
    words,
    cinemaName: findCinemaEnhanced(words),
    movieName: findMovieEnhanced(words),
    date: seatSelectionContext
      ? findDateFromScheduleText(rawText) || findDateFromSchedule(words) || findDateEnhanced(words)
      : findDateEnhanced(words),
    time: seatSelectionContext
      ? findTimeFromScheduleText(rawText) || findTimeFromSchedule(words) || findTimeEnhanced(words)
      : findTimeEnhanced(words),
    hallName: findHall(words),
    language: seatSelectionContext
      ? findLanguageFromScheduleText(rawText) || findLanguageFromSchedule(words) || findLanguage(words)
      : findLanguage(words),
    price: findPrice(words),
    seats: findSeatsEnhanced(rawText)
  }
}

export function isLikelyToolUiOcrText(text: string): boolean {
  const normalized = text.replace(/\s+/g, '')
  const strongMarkers = ['v1.0.0', '本地模式', '鉴权未启用']
  const helperMarkers = ['已选座位', '支付活动', '图片识别完成', '文本识别']
  const strongHitCount = strongMarkers.filter((marker) => normalized.includes(marker)).length
  const helperHitCount = helperMarkers.filter((marker) => normalized.includes(marker)).length

  return strongHitCount >= 1 && helperHitCount >= 1
}
