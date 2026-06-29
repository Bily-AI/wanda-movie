import { clipboard, ipcMain } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import axios from 'axios'

import {
  IPC_CHANNELS,
  type AiOcrParsedTicket,
  type AiOcrParseRequest,
  type AiOcrParseResult,
  type BaiduOcrRequest,
  type BaiduOcrResult,
  type ClipboardImageResult
} from '../shared/ipc'
import { readLocalDataFile } from './localData'

const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
const BAIDU_ACCURATE_BASIC_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic'
const BAIDU_ACCURATE_URL = 'https://aip.baidubce.com/rest/2.0/ocr/v1/accurate'
const DEFAULT_AI_OCR_BASE_URL = 'https://api.deepseek.com/chat/completions'
const DEFAULT_AI_OCR_MODEL = 'deepseek-chat'
const MAX_OCR_IMAGE_BASE64_LENGTH = 14 * 1024 * 1024
const MAX_AI_OCR_TEXT_LENGTH = 12000

interface BaiduTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface BaiduOcrResponse {
  words_result?: Array<{ words?: string }>
  words_result_num?: number
  error_code?: number
  error_msg?: string
}

interface BaiduOcrConfig {
  apiKey: string
  secretKey: string
  cacheKey: string
}

interface AiOcrConfig {
  enabled: boolean
  apiKey: string
  baseUrl: string
  model: string
}

interface AiChatResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: string | {
    message?: string
  }
}

export let accessTokenCache: { token: string; expiresAt: number; cacheKey: string } | null = null

let envFileCache: Record<string, string> | null = null

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')

    if (index <= 0) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    values[key] = value
  }

  return values
}

function readEnvFiles(): Record<string, string> {
  if (envFileCache) {
    return envFileCache
  }

  const candidates = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '..', '.env.local'),
    join(process.cwd(), '..', 'wanda-ticket-1.0.0', '.env.local')
  ]
  envFileCache = {}

  for (const filePath of candidates) {
    try {
      envFileCache = {
        ...envFileCache,
        ...parseEnvFile(readFileSync(filePath, 'utf-8'))
      }
    } catch {
      continue
    }
  }

  return envFileCache
}

function getConfigValue(...keys: string[]): string {
  const fileEnv = readEnvFiles()

  for (const key of keys) {
    const value = process.env[key] || fileEnv[key]

    if (value?.trim()) {
      return value.trim()
    }
  }

  return ''
}

async function getBaiduOcrConfig(): Promise<BaiduOcrConfig> {
  const settings = await readLocalDataFile('settings')
  const apiKey = settings.baiduOcr.apiKey.trim() || getConfigValue('BAIDU_OCR_API_KEY')
  const secretKey = settings.baiduOcr.secretKey.trim() || getConfigValue('BAIDU_OCR_SECRET_KEY')

  if (!apiKey || !secretKey) {
    throw new Error('缺少百度 OCR 配置 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY')
  }

  return {
    apiKey,
    secretKey,
    cacheKey: `${apiKey}:${secretKey}`
  }
}

async function getAiOcrConfig(): Promise<AiOcrConfig> {
  const settings = await readLocalDataFile('settings')
  const apiKey = settings.aiOcr.apiKey.trim() || getConfigValue('AI_OCR_API_KEY', 'DEEPSEEK_API_KEY')
  const baseUrl =
    settings.aiOcr.baseUrl.trim() ||
    getConfigValue('AI_OCR_BASE_URL', 'DEEPSEEK_BASE_URL') ||
    DEFAULT_AI_OCR_BASE_URL
  const model =
    settings.aiOcr.model.trim() || getConfigValue('AI_OCR_MODEL', 'DEEPSEEK_MODEL') || DEFAULT_AI_OCR_MODEL

  if (!settings.aiOcr.enabled) {
    throw new Error('AI OCR 兜底未启用')
  }

  if (!apiKey) {
    throw new Error('缺少 AI OCR API Key，请先在设置里配置')
  }

  return {
    enabled: settings.aiOcr.enabled,
    apiKey,
    baseUrl,
    model
  }
}

function stripDataUrlPrefix(imageBase64: string): string {
  return imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim()
}

function validateBaiduOcrRequest(request: BaiduOcrRequest): string | null {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return 'OCR 请求参数必须是对象'
  }

  if (typeof request.imageBase64 !== 'string' || !request.imageBase64.trim()) {
    return '缺少待识别图片'
  }

  if (request.accurate !== undefined && typeof request.accurate !== 'boolean') {
    return 'OCR 精度参数必须是布尔值'
  }

  const imageBase64 = request.imageBase64.trim()
  const hasSupportedDataUrl = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(imageBase64)
  const imageBody = stripDataUrlPrefix(imageBase64).replace(/\s+/g, '')

  if (imageBase64.startsWith('data:image/') && !hasSupportedDataUrl) {
    return 'OCR 图片只支持 PNG/JPG/WebP 格式'
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBody)) {
    return 'OCR 图片必须是 PNG/JPG/WebP 的 base64 内容'
  }

  if (imageBody.length > MAX_OCR_IMAGE_BASE64_LENGTH) {
    return 'OCR 图片过大，请使用 10MB 以内的图片'
  }

  return null
}

function validateAiOcrParseRequest(request: AiOcrParseRequest): string | null {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return 'AI OCR 请求参数必须是对象'
  }

  if (typeof request.text !== 'string' || !request.text.trim()) {
    return '缺少待解析 OCR 文本'
  }

  if (request.text.length > MAX_AI_OCR_TEXT_LENGTH) {
    return 'OCR 文本过长，请缩短后再解析'
  }

  if (
    request.words !== undefined &&
    (!Array.isArray(request.words) || request.words.some((word) => typeof word !== 'string'))
  ) {
    return 'OCR words 必须是字符串数组'
  }

  return null
}

async function getBaiduAccessToken(): Promise<string> {
  const config = await getBaiduOcrConfig()

  if (
    accessTokenCache &&
    accessTokenCache.cacheKey === config.cacheKey &&
    accessTokenCache.expiresAt > Date.now() + 60_000
  ) {
    return accessTokenCache.token
  }

  const response = await axios.post<BaiduTokenResponse>(BAIDU_TOKEN_URL, undefined, {
    params: {
      grant_type: 'client_credentials',
      client_id: config.apiKey,
      client_secret: config.secretKey
    },
    timeout: 15000,
    validateStatus: () => true
  })

  if (response.status < 200 || response.status >= 300 || !response.data.access_token) {
    throw new Error(response.data.error_description || response.data.error || '获取百度 access_token 失败')
  }

  accessTokenCache = {
    token: response.data.access_token,
    expiresAt: Date.now() + Math.max(response.data.expires_in ?? 0, 0) * 1000,
    cacheKey: config.cacheKey
  }

  return accessTokenCache.token
}

let forceGeneralBasic = false

async function requestBaiduOcr(imageBase64: string, accurate = true): Promise<BaiduOcrResponse> {
  const accessToken = await getBaiduAccessToken()
  const body = new URLSearchParams({
    image: stripDataUrlPrefix(imageBase64),
    language_type: 'CHN_ENG',
    detect_direction: 'true',
    paragraph: 'false',
    probability: 'false'
  })
  let targetUrl = accurate ? BAIDU_ACCURATE_BASIC_URL : BAIDU_ACCURATE_URL
  if (forceGeneralBasic) {
    targetUrl = 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic'
  }
  const url = `${targetUrl}?access_token=${encodeURIComponent(accessToken)}`
  const response = await axios.post<BaiduOcrResponse>(url, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 30000,
    validateStatus: () => true
  })

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`百度 OCR 请求失败：HTTP ${response.status}`)
  }

  return response.data
}

function cleanAiText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function firstAiText(...values: unknown[]): string {
  for (const value of values) {
    const text = cleanAiText(value)

    if (text) {
      return text
    }
  }

  return ''
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeAiDate(value: unknown): string {
  const text = cleanAiText(value)
  const isoMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  const relativeMatch = text.match(/(?:今天|明天|后天|今日|翌日)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)

  if (relativeMatch) {
    return `${new Date().getFullYear()}-${relativeMatch[1].padStart(2, '0')}-${relativeMatch[2].padStart(2, '0')}`
  }

  const monthDayMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)

  if (monthDayMatch) {
    return `${new Date().getFullYear()}-${monthDayMatch[1].padStart(2, '0')}-${monthDayMatch[2].padStart(2, '0')}`
  }

  return ''
}

function normalizeAiTime(value: unknown): string {
  const text = cleanAiText(value)
  const match = text.match(/([01]?\d|2[0-3])[:：点时](\d{2})/)

  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`
  }

  return ''
}

function extractAiLanguage(value: unknown): string {
  const text = cleanAiText(value)
  const match = text.match(/(IMAX|2D|3D|杜比|国语(?:2D|3D)?|英语(?:2D|3D)?|原版|粤语(?:2D|3D)?)/i)

  return match?.[1] ?? ''
}

function collectAiFallbackTexts(data: Record<string, unknown>, request: AiOcrParseRequest): string[] {
  const candidates = [
    data.date,
    data.showDate,
    data.showtimeDate,
    data.time,
    data.showTime,
    data.startTime,
    data.language,
    data.version,
    data.movieVersion,
    data.schedule,
    data.session,
    data.showInfo,
    data.showTimeInfo,
    data.showtime,
    data.playTime,
    data.dateTime,
    data.datetime,
    data.remark,
    data.text,
    request.text,
    Array.isArray(request.words) ? request.words.join(' ') : ''
  ]

  const texts = candidates.map((item) => cleanAiText(item)).filter(Boolean)
  const mergedTexts: string[] = []

  for (let index = 0; index < texts.length - 1; index += 1) {
    mergedTexts.push(`${texts[index]} ${texts[index + 1]}`.trim())
  }

  if (Array.isArray(request.words) && request.words.length > 1) {
    for (let index = 0; index < request.words.length - 1; index += 1) {
      const current = cleanAiText(request.words[index])
      const next = cleanAiText(request.words[index + 1])

      if (current && next) {
        mergedTexts.push(`${current} ${next}`)
      }
    }
  }

  return [...texts, ...mergedTexts]
}

function normalizeAiOcrSeats(value: unknown): AiOcrParsedTicket['seats'] {
  const seats = Array.isArray(value) ? value : []

  return seats.flatMap((seat) => {
    if (typeof seat === 'string') {
      const match = seat.match(/(\d{1,2})\D+(\d{1,2})/)

      if (!match) {
        return []
      }

      return [{ rowName: match[1], columnName: match[2], rawText: seat }]
    }

    if (!isPlainRecord(seat)) {
      return []
    }

    const rowName = firstAiText(seat.rowName, seat.row, seat.rowNo)
    const columnName = firstAiText(seat.columnName, seat.column, seat.col, seat.columnNo)

    if (!rowName || !columnName) {
      return []
    }

    return [
      {
        rowName,
        columnName,
        rawText: firstAiText(seat.rawText, seat.text) || `${rowName}排${columnName}座`
      }
    ]
  })
}

function normalizeAiOcrTicket(raw: unknown, request: AiOcrParseRequest): AiOcrParsedTicket {
  const source = isPlainRecord(raw) ? raw : {}
  const data = isPlainRecord(source.data) ? source.data : source
  const words = Array.isArray(request.words) ? request.words.map((word) => word.trim()).filter(Boolean) : []
  const fallbackTexts = collectAiFallbackTexts(data, request)
  const fallbackDate = fallbackTexts.map((item) => normalizeAiDate(item)).find(Boolean) ?? ''
  const fallbackTime = fallbackTexts.map((item) => normalizeAiTime(item)).find(Boolean) ?? ''
  const fallbackLanguage = fallbackTexts.map((item) => extractAiLanguage(item)).find(Boolean) ?? ''

  return {
    rawText: request.text.trim(),
    words,
    cinemaName: firstAiText(data.cinemaName, data.cinema, data.theater, data.cinema_name),
    movieName: firstAiText(data.movieName, data.movie, data.filmName, data.film, data.movie_name),
    date: normalizeAiDate(firstAiText(data.date, data.showDate, data.showtimeDate)) || fallbackDate,
    time: normalizeAiTime(firstAiText(data.time, data.showTime, data.startTime)) || fallbackTime,
    hallName: firstAiText(data.hallName, data.hall, data.cinemaHallName),
    language: firstAiText(data.language, data.version, data.movieVersion) || fallbackLanguage,
    price: firstAiText(data.price, data.totalPrice, data.amount),
    seats: normalizeAiOcrSeats(data.seats)
  }
}

function stripJsonFence(content: string): string {
  return content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
}

function extractJsonObject(content: string): unknown {
  const cleanContent = stripJsonFence(content)

  try {
    return JSON.parse(cleanContent)
  } catch {
    const match = cleanContent.match(/\{[\s\S]*\}/)

    if (!match) {
      throw new Error('AI OCR 返回内容不是有效 JSON')
    }

    return JSON.parse(match[0])
  }
}

function buildAiOcrPrompt(request: AiOcrParseRequest): string {
  return [
    '你是一个万达电影票 OCR 信息整理助手。',
    '请只返回 JSON，不要返回 markdown，不要解释。',
    '字段固定为 cinemaName、movieName、date、time、hallName、language、price、seats。',
    'date 必须使用 YYYY-MM-DD，time 必须使用 HH:mm。',
    'seats 是数组，每项包含 rowName、columnName、rawText。',
    '如果是手机选座页截图：影片名通常在“切换场次”左侧或上一行；日期时间以场次信息为准，不要取状态栏时间。',
    '遇到“后天 6月27日 15:00-16:42 国语2D”这类文本时，date 输出 2026-06-27，time 输出 15:00，language 输出 国语2D。',
    '不要编造城市、影院、影片、场次、座位或价格，不确定的字段返回空字符串或空数组。',
    '',
    'OCR 分行结果：',
    ...(request.words?.length ? request.words.map((word, index) => `${index + 1}. ${word}`) : ['(空)']),
    '',
    'OCR 文本：',
    request.text.trim()
  ].join('\n')
}

async function requestAiOcrParse(request: AiOcrParseRequest): Promise<AiOcrParsedTicket> {
  const config = await getAiOcrConfig()
  const response = await axios.post<AiChatResponse>(
    config.baseUrl,
    {
      model: config.model,
      messages: [
        {
          role: 'system',
          content: '你只输出可解析 JSON。'
        },
        {
          role: 'user',
          content: buildAiOcrPrompt(request)
        }
      ],
      temperature: 0,
      max_tokens: 800
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: () => true
    }
  )

  if (response.status < 200 || response.status >= 300) {
    const error = response.data?.error
    const message = typeof error === 'string' ? error : error?.message
    throw new Error(message || `AI OCR 请求失败：HTTP ${response.status}`)
  }

  const content = response.data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('AI OCR 返回内容为空')
  }

  return normalizeAiOcrTicket(extractJsonObject(content), {
    text: request.text,
    words: request.words ?? []
  })
}

export async function recognizeBaiduOcr(request: BaiduOcrRequest): Promise<BaiduOcrResult> {
  const validationError = validateBaiduOcrRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  try {
    forceGeneralBasic = false
    let data = await requestBaiduOcr(request.imageBase64, request.accurate)

    if (data.error_code === 6) {
      data = await requestBaiduOcr(request.imageBase64, false)

      if (data.error_code === 6) {
        forceGeneralBasic = true
        data = await requestBaiduOcr(request.imageBase64, false)
      }
    }

    if (data.error_code) {
      const detailedError = data.error_code === 6
        ? '百度 OCR 提示：无数据访问权限。通常是百度智能云应用未开通对应文字识别接口，或 API Key / Secret Key 配置错误。'
        : (data.error_msg || `百度 OCR 返回错误：${data.error_code}`)
      return {
        ok: false,
        error: detailedError
      }
    }

    const words = (data.words_result ?? []).map((item) => item.words ?? '').filter(Boolean)

    return {
      ok: true,
      data: {
        words,
        wordsNum: data.words_result_num ?? words.length,
        raw: data
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '百度 OCR 请求失败'
    }
  } finally {
    forceGeneralBasic = false
  }
}

export async function parseAiOcrTicketText(request: AiOcrParseRequest): Promise<AiOcrParseResult> {
  const validationError = validateAiOcrParseRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  try {
    return {
      ok: true,
      data: await requestAiOcrParse(request)
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'AI OCR 解析失败'
    }
  }
}

function readClipboardImage(): ClipboardImageResult {
  const image = clipboard.readImage()

  if (image.isEmpty()) {
    return {
      ok: false,
      error: '剪贴板中没有图片'
    }
  }

  const png = image.toPNG()

  return {
    ok: true,
    data: {
      base64: image.toDataURL(),
      size: png.length
    }
  }
}

export function registerBaiduOcrHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_READ_TEXT, () => {
    const text = clipboard.readText().trim()

    if (!text) {
      return {
        ok: false,
        error: '剪贴板中没有文本内容'
      }
    }

    return {
      ok: true,
      data: text
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_READ_IMAGE, () => readClipboardImage())

  ipcMain.handle(IPC_CHANNELS.OCR_RECOGNIZE, (_event, request: BaiduOcrRequest) => recognizeBaiduOcr(request))

  ipcMain.handle(IPC_CHANNELS.AI_OCR_PARSE, (_event, request: AiOcrParseRequest) => parseAiOcrTicketText(request))
}

