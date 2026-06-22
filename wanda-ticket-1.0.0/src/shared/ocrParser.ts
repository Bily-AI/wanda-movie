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
  return value.replace(/[：:]/g, ':').replace(/[【】\[\]]/g, '')
}

function splitWords(text: string): string[] {
  return text
    .split(/\r?\n|[|｜]/)
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

function normalizeDate(value: string): string {
  const isoMatch = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  const monthDayMatch = value.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)

  if (monthDayMatch) {
    return `${new Date().getFullYear()}-${monthDayMatch[1].padStart(2, '0')}-${monthDayMatch[2].padStart(2, '0')}`
  }

  return ''
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
  const candidates = [labeled, ...words]

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

  const filtered = words.filter((word) => !/(影城|影院|日期|时间|场次|影厅|座位|合计|金额|￥|¥)/.test(word))
  return filtered.find((word) => word.length >= 2 && !/\d+\s*排\s*\d+\s*座?/.test(word)) ?? ''
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

export function parseOcrTicketText(text: string): ParsedOcrTicket {
  const rawText = text.trim()
  const words = splitWords(rawText)

  return {
    rawText,
    words,
    cinemaName: findCinema(words),
    movieName: findMovie(words),
    date: findDate(words),
    time: findTime(words),
    hallName: findHall(words),
    language: findLanguage(words),
    price: findPrice(words),
    seats: findSeats(rawText)
  }
}
