import CryptoJS from 'crypto-js'

import { WANDA_HOSTS } from '@shared/wandaCore'
import type { RequestParamsLocalData } from '@shared/localData'
import type { WandaApiResponse } from '@shared/wandaTicketTypes'

export type WandaQuery = Record<string, string | number | boolean | undefined>
export type WandaBody = Record<string, string | number | boolean | undefined>

const WANDA_VERSION = '9.3.2'
const WANDA_CHANNEL = '1_2'
const WANDA_SYSTEM_VERSION = '13'
const CINEMA_SYSTEM_VERSION = '10'
const CINEMA_VERSION = '9.1.8'
const DEFAULT_WANDA_MODEL = 'M2102J2SC'
const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'
const DEFAULT_SHUMEI_BOX_ID = 'wanda-ticket-tool'
const WANDA_USER_AGENT = 'okhttp/4.12.0'

let runtimeRequestParams: Partial<RequestParamsLocalData> = {}

export interface WandaPostOptions {
  useProxy?: boolean
  signatureBody?: string
  contentType?: string
}

export interface WandaRequestOptions {
  useProxy?: boolean
}

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function getRuntimeParam(key: keyof RequestParamsLocalData): string {
  return String(runtimeRequestParams[key] || '').trim()
}

function getRuntimeNumberParam(key: keyof RequestParamsLocalData, fallback: number): number {
  const value = Number(getRuntimeParam(key))

  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function setWandaRequestParams(params: Partial<RequestParamsLocalData> = {}): void {
  runtimeRequestParams = { ...params }
}

function getRequiredWandaApp() {
  const wandaApp = getWandaApp()

  if (!wandaApp) {
    throw new Error('Electron 桥接未就绪，请确认 preload 已加载')
  }

  return wandaApp
}

function getWandaRuntimeConfig() {
  const signSalt = String(import.meta.env.VITE_WANDA_SIGN_SALT || '').trim()

  if (!signSalt) {
    throw new Error('缺少万达签名盐配置 VITE_WANDA_SIGN_SALT')
  }

  return {
    signSalt,
    model: getRuntimeParam('model') || String(import.meta.env.VITE_WANDA_MODEL || DEFAULT_WANDA_MODEL).trim() || DEFAULT_WANDA_MODEL,
    shumeiBoxId:
      getRuntimeParam('shumeiBoxId') ||
      getRuntimeParam('deviceFingerprint') ||
      String(import.meta.env.VITE_WANDA_SHUMEI_BOX_ID || DEFAULT_SHUMEI_BOX_ID).trim() ||
      DEFAULT_SHUMEI_BOX_ID,
    mxCid: String(import.meta.env.VITE_WANDA_MX_CID || '').trim()
  }
}

function buildRequestPath(url: string): string {
  const parsedUrl = new URL(url)

  return `${parsedUrl.pathname}${parsedUrl.search}`
}

function extractWandaRequestLabel(host: string, path: string): string {
  try {
    const url = new URL(`https://${host}${path}`)

    return `${url.hostname}${url.pathname}`
  } catch {
    return `${host}${path.split('?')[0]}`
  }
}

export function sanitizeWandaErrorMessage(rawMessage: string | undefined): string {
  const message = String(rawMessage || '').trim()

  if (!message) {
    return ''
  }

  return message
    .replace(/(X-RY-TOKEN|Authorization|Cookie|ck|_mi_|token)(["']?\s*[:=]\s*["']?)[^"',\s&}]+/gi, '$1$2<已隐藏>')
    .replace(/(mobilePhone|mobile|phone|手机号)(["']?\s*[:=]\s*["']?)1[3-9]\d{9}/gi, '$1$2<已隐藏>')
    .replace(/(requestInfo|payInfo|tradeNo|body)(["']?\s*[:=]\s*["']?)[^"',}]+/gi, '$1$2<已隐藏>')
    .replace(/\b1[3-9]\d{9}\b/g, '1**********')
}

function formatWandaTransportError(
  method: 'GET' | 'POST',
  host: string,
  path: string,
  rawMessage: string | undefined,
  fallbackMessage: string
): string {
  const requestLabel = extractWandaRequestLabel(host, path)
  const sanitizedMessage = sanitizeWandaErrorMessage(rawMessage)

  return `${fallbackMessage}：${method} ${requestLabel}${sanitizedMessage ? `，${sanitizedMessage}` : ''}`
}

function getDefaultWandaUserId(): string {
  return getRuntimeParam('userId') || String(import.meta.env.VITE_WANDA_USER_ID || '').trim() || DEFAULT_WANDA_USER_IDENTIFIER
}

function generateMxCid(): string {
  const chars = '0123456789abcdef'
  let value = ''

  for (let index = 0; index < 32; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }

  return value
}

export function buildWandaUrl(host: string, path: string, query: WandaQuery = {}): string {
  const url = new URL(`https://${host}${path}`)

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  return url.toString()
}

export function toFormBody(body: WandaBody): string {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

export function buildWandaHeaders(
  path: string,
  body: string,
  ck = '',
  userIdentifier = ''
): Record<string, string> {
  const timestamp = String(Date.now())
  const { signSalt, model, shumeiBoxId, mxCid } = getWandaRuntimeConfig()
  const ryUser = getDefaultWandaUserId() || userIdentifier.trim()
  const width = getRuntimeNumberParam('width', 1080)
  const height = getRuntimeNumberParam('height', 2206)
  const check = CryptoJS.MD5(`${signSalt}${timestamp}${path}${body}`).toString()
  const mxApi = {
    systemVersion: WANDA_SYSTEM_VERSION,
    height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: WANDA_VERSION,
    _mi_: ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model,
    sCode: 'Wanda',
    width,
    ShumeiBoxId: shumeiBoxId
  }

  const headers: Record<string, string> = {
    'MX-API': JSON.stringify(mxApi),
    'MX-CID': mxCid,
    'Accept-Charset': 'UTF-8,*',
    'Accept-Encoding': 'gzip',
    Connection: 'Keep-Alive',
    'User-Agent': WANDA_USER_AGENT,
    ShumeiBoxId: shumeiBoxId,
    'X-RY-CHANNEL': WANDA_CHANNEL,
    'X-RY-TIMESTAMP': timestamp,
    'X-RY-SYSTEM-VER': WANDA_SYSTEM_VERSION,
    'X-RY-VERSION': WANDA_VERSION,
    'X-RY-TOKEN': ck,
    'X-RY-USER': ryUser,
    'X-RY-CHECK': check,
    'X-RY-MODEL': model,
    'X-RY-SIGN': check
  }

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  return headers
}

export function buildWandaLoginHeaders(path: string, body: string): Record<string, string> {
  const timestamp = String(Date.now())
  const { signSalt, model, shumeiBoxId, mxCid } = getWandaRuntimeConfig()
  const width = getRuntimeNumberParam('width', 1080)
  const height = getRuntimeNumberParam('height', 2200)
  const check = CryptoJS.MD5(`${signSalt}${timestamp}${path}${body}`).toString()
  const mxApi = {
    systemVersion: CINEMA_SYSTEM_VERSION,
    height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: WANDA_VERSION,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model,
    sCode: 'Wanda',
    width,
    ShumeiBoxId: shumeiBoxId
  }

  return {
    'MX-API': JSON.stringify(mxApi),
    'MX-CID': mxCid || generateMxCid(),
    Host: WANDA_HOSTS.USER,
    ShumeiBoxId: shumeiBoxId,
    'Accept-Charset': 'UTF-8,*',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': String(new TextEncoder().encode(body).length),
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': WANDA_USER_AGENT
  }
}

export async function wandaLoginPost<T>(path: string, body: WandaBody): Promise<WandaApiResponse<T>> {
  const formBody = toFormBody(body)
  const url = buildWandaUrl(WANDA_HOSTS.USER, path)
  const headers = buildWandaLoginHeaders(path, formBody)
  const result = await getRequiredWandaApp().wandaHttpPost({ url, headers, body: formBody })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('POST', WANDA_HOSTS.USER, path, result?.error, '万达登录 POST 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export function buildCinemaHeaders(path: string, ck = '', host: string = WANDA_HOSTS.CINEMA): Record<string, string> {
  const timestamp = String(Date.now())
  const { signSalt, model, shumeiBoxId } = getWandaRuntimeConfig()
  const width = getRuntimeNumberParam('width', 1080)
  const height = getRuntimeNumberParam('height', 2200)
  const check = CryptoJS.MD5(`${signSalt}${timestamp}${path}`).toString()
  const mxApi = {
    systemVersion: CINEMA_SYSTEM_VERSION,
    height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: CINEMA_VERSION,
    _mi_: ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model,
    sCode: 'Wanda',
    width,
    ShumeiBoxId: shumeiBoxId
  }

  return {
    'MX-CID': generateMxCid(),
    'MX-API': JSON.stringify(mxApi),
    Host: `${host}:443`,
    'Accept-Charset': 'UTF-8,*',
    ShumeiBoxId: shumeiBoxId,
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': WANDA_USER_AGENT
  }
}

export async function wandaCinemaGet<T>(
  path: string,
  query: WandaQuery,
  ck = '',
  host: string = WANDA_HOSTS.CINEMA
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path, query)
  const requestPath = buildRequestPath(url)
  const headers = buildCinemaHeaders(requestPath, ck, host)
  const result = await getRequiredWandaApp().wandaHttpGet({ url, headers })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('GET', host, requestPath, result?.error, '万达影院 GET 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export function buildSeatHeaders(
  path: string,
  ck = '',
  userIdentifier = '',
  host: string = WANDA_HOSTS.GATEWAY
): Record<string, string> {
  const timestamp = String(Date.now())
  const { signSalt, model, shumeiBoxId } = getWandaRuntimeConfig()
  const ryUser = getDefaultWandaUserId() || userIdentifier.trim()
  const width = getRuntimeNumberParam('width', 1080)
  const height = getRuntimeNumberParam('height', 2206)
  const check = CryptoJS.MD5(`${signSalt}${timestamp}${path}`).toString()
  const mxApi = {
    systemVersion: WANDA_SYSTEM_VERSION,
    height,
    'Accept-Encoding': 'gzip, deflate',
    ts: timestamp,
    ver: WANDA_VERSION,
    _mi_: ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model,
    sCode: 'Wanda',
    width,
    ShumeiBoxId: shumeiBoxId
  }

  return {
    'MX-API': JSON.stringify(mxApi),
    'X-RY-SIGN': check,
    'X-RY-USER': ryUser,
    Host: host,
    'X-RY-CHECK': check,
    'X-RY-MODEL': model,
    'X-RY-TOKEN': ck,
    ShumeiBoxId: shumeiBoxId,
    'X-RY-SYSTEM-VER': WANDA_SYSTEM_VERSION,
    'X-RY-VERSION': WANDA_VERSION,
    'Accept-Charset': 'UTF-8,*',
    'X-RY-CHANNEL': WANDA_CHANNEL,
    'X-RY-TIMESTAMP': timestamp,
    Connection: 'Keep-Alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': WANDA_USER_AGENT
  }
}

export async function wandaSeatGet<T>(
  path: string,
  query: WandaQuery,
  ck = '',
  userIdentifier = '',
  host: string = WANDA_HOSTS.GATEWAY
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path, query)
  const requestPath = buildRequestPath(url)
  const headers = buildSeatHeaders(requestPath, ck, userIdentifier, host)
  const result = await getRequiredWandaApp().wandaHttpGet({ url, headers })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('GET', host, requestPath, result?.error, '万达座位 GET 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaGet<T>(
  host: string,
  path: string,
  query: WandaQuery,
  ck = '',
  userIdentifier = '',
  options: WandaRequestOptions = {}
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path, query)
  const requestPath = buildRequestPath(url)
  const headers = {
    ...buildWandaHeaders(requestPath, '', ck, userIdentifier),
    Host: host
  }
  const result = await getRequiredWandaApp().wandaHttpGet({ url, headers, useProxy: options.useProxy })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('GET', host, requestPath, result?.error, '万达 GET 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaGetWithHeaders<T>(
  host: string,
  path: string,
  headers: Record<string, string>
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path)
  const result = await getRequiredWandaApp().wandaHttpGet({ url, headers: { ...headers, Host: host } })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('GET', host, buildRequestPath(url), result?.error, '万达 GET 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaPost<T>(
  host: string,
  path: string,
  body: WandaBody,
  ck = '',
  userIdentifier = '',
  options: WandaPostOptions = {}
): Promise<WandaApiResponse<T>> {
  const formBody = toFormBody(body)
  const url = buildWandaUrl(host, path)
  const signatureBody = options.signatureBody ?? formBody
  const headers: Record<string, string> = {
    ...buildWandaHeaders(path, signatureBody, ck, userIdentifier),
    Host: host,
    'Content-Length': String(new TextEncoder().encode(formBody).length)
  }

  if (options.contentType) {
    headers['Content-Type'] = options.contentType
  }

  const result = await getRequiredWandaApp().wandaHttpPost({
    url,
    headers,
    body: formBody,
    useProxy: options.useProxy
  })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('POST', host, path, result?.error, '万达 POST 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaPostForm<T>(
  host: string,
  path: string,
  formBody: string,
  ck = '',
  userIdentifier = '',
  options: WandaPostOptions = {}
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path)
  const signatureBody = options.signatureBody ?? formBody
  const headers: Record<string, string> = {
    ...buildWandaHeaders(path, signatureBody, ck, userIdentifier),
    Host: host,
    'Content-Length': String(new TextEncoder().encode(formBody).length)
  }

  if (options.contentType) {
    headers['Content-Type'] = options.contentType
  }

  const result = await getRequiredWandaApp().wandaHttpPost({
    url,
    headers,
    body: formBody,
    useProxy: options.useProxy
  })

  if (!result?.ok) {
    throw new Error(formatWandaTransportError('POST', host, path, result?.error, '万达 POST 请求失败'))
  }

  return result.data as WandaApiResponse<T>
}

export { WANDA_HOSTS }
