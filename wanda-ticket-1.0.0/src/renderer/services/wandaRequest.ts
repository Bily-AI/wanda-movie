import CryptoJS from 'crypto-js'

import { WANDA_HOSTS } from '@shared/wandaCore'
import type { WandaApiResponse } from '@shared/wandaTicketTypes'

export type WandaQuery = Record<string, string | number | boolean | undefined>
export type WandaBody = Record<string, string | number | boolean | undefined>

const WANDA_VERSION = '9.3.2'
const WANDA_CHANNEL = '1_2'
const DEFAULT_WANDA_MODEL = 'iPhone'
const DEFAULT_SHUMEI_BOX_ID = 'wanda-ticket-tool'
const WANDA_USER_AGENT = 'okhttp/4.12.0'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function getWandaRuntimeConfig() {
  const signSalt = String(import.meta.env.VITE_WANDA_SIGN_SALT || '').trim()

  if (!signSalt) {
    throw new Error('缺少万达签名盐配置 VITE_WANDA_SIGN_SALT')
  }

  return {
    signSalt,
    model: String(import.meta.env.VITE_WANDA_MODEL || DEFAULT_WANDA_MODEL).trim() || DEFAULT_WANDA_MODEL,
    shumeiBoxId:
      String(import.meta.env.VITE_WANDA_SHUMEI_BOX_ID || DEFAULT_SHUMEI_BOX_ID).trim() || DEFAULT_SHUMEI_BOX_ID
  }
}

function buildRequestPath(url: string): string {
  const parsedUrl = new URL(url)

  return `${parsedUrl.pathname}${parsedUrl.search}`
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
  const { signSalt, model, shumeiBoxId } = getWandaRuntimeConfig()
  const check = CryptoJS.MD5(`${signSalt}${timestamp}${path}${body}`).toString()
  const mxApi = {
    systemVersion: '13',
    height: 852,
    'Accept-Encoding': 'gzip',
    ts: timestamp,
    ver: WANDA_VERSION,
    _mi_: ck,
    json: true,
    appId: 2,
    cCode: WANDA_CHANNEL,
    check,
    model,
    sCode: 'Wanda',
    width: 393,
    ShumeiBoxId: shumeiBoxId
  }

  const headers: Record<string, string> = {
    'MX-API': JSON.stringify(mxApi),
    'Accept-Encoding': 'gzip',
    Connection: 'Keep-Alive',
    'User-Agent': WANDA_USER_AGENT,
    ShumeiBoxId: shumeiBoxId,
    'X-RY-CHANNEL': WANDA_CHANNEL,
    'X-RY-TIMESTAMP': timestamp,
    'X-RY-VERSION': WANDA_VERSION,
    'X-RY-TOKEN': ck,
    'X-RY-USER': userIdentifier,
    'X-RY-CHECK': check,
    'X-RY-MODEL': model,
    'X-RY-SIGN': check
  }

  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  return headers
}

export async function wandaGet<T>(
  host: string,
  path: string,
  query: WandaQuery,
  ck = '',
  userIdentifier = ''
): Promise<WandaApiResponse<T>> {
  const url = buildWandaUrl(host, path, query)
  const headers = {
    ...buildWandaHeaders(buildRequestPath(url), '', ck, userIdentifier),
    Host: host
  }
  const result = await getWandaApp()?.wandaHttpGet({ url, headers })

  if (!result?.ok) {
    throw new Error(result?.error || '万达 GET 请求失败')
  }

  return result.data as WandaApiResponse<T>
}

export async function wandaPost<T>(
  host: string,
  path: string,
  body: WandaBody,
  ck = '',
  userIdentifier = ''
): Promise<WandaApiResponse<T>> {
  const formBody = toFormBody(body)
  const url = buildWandaUrl(host, path)
  const headers = {
    ...buildWandaHeaders(path, formBody, ck, userIdentifier),
    Host: host,
    'Content-Length': String(new TextEncoder().encode(formBody).length)
  }
  const result = await getWandaApp()?.wandaHttpPost({ url, headers, body: formBody })

  if (!result?.ok) {
    throw new Error(result?.error || '万达 POST 请求失败')
  }

  return result.data as WandaApiResponse<T>
}

export { WANDA_HOSTS }
