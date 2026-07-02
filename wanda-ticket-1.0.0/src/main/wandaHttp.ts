import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { app, ipcMain } from 'electron'
import axios, { type AxiosRequestConfig } from 'axios'

import { IPC_CHANNELS, type ProxyEndpoint, type WandaHttpRequest, type WandaHttpResult } from '../shared/ipc'
import { WANDA_API_PATHS, validateWandaRequest } from '../shared/wandaCore'
import { getProxyEndpoint } from './proxy'

const MERGE_PAYMENT_DIAGNOSTIC_FILE = 'merge-payment-last.json'
const SENSITIVE_TEXT = '<hidden>'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function maskText(value: unknown): string {
  const text = String(value ?? '')

  if (!text) {
    return ''
  }

  if (text.length <= 8) {
    return SENSITIVE_TEXT
  }

  return `${text.slice(0, 4)}****${text.slice(-4)}`
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  const normalizedKey = key.toLowerCase()

  if (
    normalizedKey.includes('ck') ||
    normalizedKey.includes('cookie') ||
    normalizedKey.includes('token') ||
    normalizedKey.includes('authorization') ||
    normalizedKey.includes('_mi_') ||
    normalizedKey.includes('password')
  ) {
    return SENSITIVE_TEXT
  }

  if (
    normalizedKey.includes('phone') ||
    normalizedKey.includes('mobile') ||
    normalizedKey.includes('card') ||
    normalizedKey.includes('number')
  ) {
    if (typeof value === 'string' || typeof value === 'number') {
      return maskText(value)
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(key, item))
  }

  if (isRecord(value)) {
    return sanitizeRecord(value)
  }

  return value
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, sanitizeValue(key, value)]))
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function getRequestPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

function isMergePaymentRequest(request: WandaHttpRequest): boolean {
  return getRequestPath(request.url) === WANDA_API_PATHS.ORDER_MERGE_PAYMENT
}

function parseFormBody(body: unknown): Record<string, string> {
  if (typeof body !== 'string') {
    return {}
  }

  return Object.fromEntries(new URLSearchParams(body).entries())
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  try {
    return JSON.parse(value)
  } catch {
    return {
      parseError: true,
      length: value.length
    }
  }
}

function buildDiagnosticFormBody(formBody: Record<string, string>): Record<string, unknown> {
  return {
    ...sanitizeRecord(formBody),
    requestInfo: formBody.requestInfo ? '<parsed-and-masked-below>' : undefined
  }
}

function getHeaderValue(headers: Record<string, unknown> | undefined, name: string): unknown {
  if (!headers) {
    return undefined
  }

  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase())

  return matchedKey ? headers[matchedKey] : undefined
}

function buildDiagnosticHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  const interestingHeaders = [
    'Content-Type',
    'User-Agent',
    'MX-API',
    'MX-CID',
    'X-RY-CHANNEL',
    'X-RY-TIMESTAMP',
    'X-RY-VERSION',
    'X-RY-TOKEN',
    'X-RY-USER',
    'X-RY-CHECK',
    'X-RY-SIGN',
    'X-RY-MODEL',
    'X-RY-SYSTEM-VER',
    'ShumeiBoxId'
  ]
  const result: Record<string, unknown> = {}

  for (const name of interestingHeaders) {
    const value = getHeaderValue(headers, name)

    if (value !== undefined) {
      result[name] = sanitizeValue(name, value)
    }
  }

  const mxApi = getHeaderValue(headers, 'MX-API')

  if (typeof mxApi === 'string') {
    result['MX-API-parsed'] = sanitizeValue('MX-API', parseJsonObject(mxApi))
  }

  return result
}

function buildMergePaymentDiagnostic(
  method: 'GET' | 'POST',
  request: WandaHttpRequest,
  responseStatus: number | null,
  responseData: unknown,
  requestError?: unknown
): Record<string, unknown> {
  const bodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {})
  const formBody = parseFormBody(request.body)
  const requestInfo = parseJsonObject(formBody.requestInfo)
  const parsedUrl = (() => {
    try {
      return new URL(request.url)
    } catch {
      return null
    }
  })()

  return {
    createdAt: new Date().toISOString(),
    method,
    url: parsedUrl
      ? {
          host: parsedUrl.host,
          pathname: parsedUrl.pathname
        }
      : request.url,
    headers: buildDiagnosticHeaders(request.headers),
    body: {
      fieldOrder: [...new URLSearchParams(typeof request.body === 'string' ? request.body : '').keys()],
      length: bodyText.length,
      sha256: hashText(bodyText),
      form: buildDiagnosticFormBody(formBody),
      requestInfoLength: formBody.requestInfo?.length ?? 0,
      requestInfoSha256: formBody.requestInfo ? hashText(formBody.requestInfo) : null,
      requestInfo: sanitizeValue('requestInfo', requestInfo)
    },
    response: {
      status: responseStatus,
      data: sanitizeValue('response', responseData)
    },
    error: requestError instanceof Error ? requestError.message : requestError ? String(requestError) : null
  }
}

async function writeMergePaymentDiagnostic(
  method: 'GET' | 'POST',
  request: WandaHttpRequest,
  responseStatus: number | null,
  responseData: unknown,
  requestError?: unknown
): Promise<void> {
  if (!isMergePaymentRequest(request)) {
    return
  }

  try {
    const dir = join(app.getPath('userData'), 'diagnostics')
    const diagnostic = buildMergePaymentDiagnostic(method, request, responseStatus, responseData, requestError)

    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, MERGE_PAYMENT_DIAGNOSTIC_FILE), JSON.stringify(diagnostic, null, 2), 'utf-8')
  } catch {
    // Diagnostic logging must never block the real ticket flow.
  }
}

function normalizeHeaders(headers?: Record<string, unknown>): AxiosRequestConfig['headers'] {
  if (!headers) {
    return undefined
  }

  const normalizedHeaders: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    if (value !== null && value !== undefined) {
      normalizedHeaders[key] = String(value)
    }
  }

  return normalizedHeaders
}

function buildAxiosConfig(
  method: 'GET' | 'POST',
  request: WandaHttpRequest,
  proxyEndpoint: ProxyEndpoint | null
): AxiosRequestConfig {
  return {
    method,
    url: request.url,
    headers: normalizeHeaders(request.headers),
    params: request.params,
    data: method === 'POST' ? request.body : undefined,
    proxy: proxyEndpoint
      ? {
          protocol: 'http',
          host: proxyEndpoint.host,
          port: proxyEndpoint.port
        }
      : undefined,
    timeout: 30000,
    validateStatus: () => true
  }
}

function formatHttpError(status: number, data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    if ('msg' in data && typeof data.msg === 'string') {
      return data.msg
    }

    if ('message' in data && typeof data.message === 'string') {
      return data.message
    }
  }

  return `万达请求失败，HTTP 状态码 ${status}`
}

function toCloneableWandaData(data: unknown): unknown {
  if (data === undefined) {
    return null
  }

  try {
    return JSON.parse(JSON.stringify(data))
  } catch {
    return String(data)
  }
}

export async function sendWandaRequest(
  method: 'GET' | 'POST',
  request: WandaHttpRequest
): Promise<WandaHttpResult> {
  const validationError = validateWandaRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  try {
    const proxyEndpoint = request.useProxy ? await getProxyEndpoint() : null
    const response = await axios.request(buildAxiosConfig(method, request, proxyEndpoint))

    await writeMergePaymentDiagnostic(method, request, response.status, response.data)

    if (response.status >= 200 && response.status < 300) {
      return {
        ok: true,
        data: toCloneableWandaData(response.data)
      }
    }

    return {
      ok: false,
      error: formatHttpError(response.status, response.data)
    }
  } catch (error) {
    await writeMergePaymentDiagnostic(method, request, null, null, error)

    return {
      ok: false,
      error: error instanceof Error ? error.message : '万达请求发送失败'
    }
  }
}

export function registerWandaHttpHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WANDA_HTTP_GET, (_event, request: WandaHttpRequest) =>
    sendWandaRequest('GET', request)
  )

  ipcMain.handle(IPC_CHANNELS.WANDA_HTTP_POST, (_event, request: WandaHttpRequest) =>
    sendWandaRequest('POST', request)
  )
}
