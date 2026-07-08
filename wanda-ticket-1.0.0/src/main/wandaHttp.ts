import { createHash } from 'node:crypto'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'

import { app, ipcMain } from 'electron'
import axios, { type AxiosRequestConfig } from 'axios'

import { IPC_CHANNELS, type ProxyEndpoint, type WandaHttpRequest, type WandaHttpResult } from '../shared/ipc'
import { WANDA_API_PATHS, validateWandaRequest } from '../shared/wandaCore'
import { getProxyEndpoint } from './proxy'

const MERGE_PAYMENT_DIAGNOSTIC_FILE = 'merge-payment-last.json'
const MERGE_PAYMENT_TRACE_FILE = 'merge-payment-trace.jsonl'
const ORDER_STATUS_DIAGNOSTIC_FILE = 'order-status-last.json'
const QUERY_PAY_INFO_DIAGNOSTIC_FILE = 'query-pay-info-upgrade-last.json'
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

function getDiagnosticFileName(request: WandaHttpRequest): string | null {
  const path = getRequestPath(request.url)

  if (path === WANDA_API_PATHS.ORDER_MERGE_PAYMENT) {
    return MERGE_PAYMENT_DIAGNOSTIC_FILE
  }

  if (path === WANDA_API_PATHS.ORDER_STATUS) {
    return ORDER_STATUS_DIAGNOSTIC_FILE
  }

  if (path === WANDA_API_PATHS.ORDER_QUERY_PAY_INFO) {
    return QUERY_PAY_INFO_DIAGNOSTIC_FILE
  }

  return null
}

function getDiagnosticTraceFileName(request: WandaHttpRequest): string | null {
  const path = getRequestPath(request.url)

  if (path === WANDA_API_PATHS.ORDER_MERGE_PAYMENT) {
    return MERGE_PAYMENT_TRACE_FILE
  }

  return null
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

function buildRequestDiagnostic(
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

function safeSerialize(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return JSON.stringify({
      serializeError: error instanceof Error ? error.message : String(error)
    })
  }
}

function buildLightweightTrace(
  method: 'GET' | 'POST',
  request: WandaHttpRequest,
  responseStatus: number | null,
  responseData: unknown,
  requestError?: unknown
): Record<string, unknown> {
  const bodyText = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {})
  const formBody = parseFormBody(request.body)
  const requestInfoRaw = formBody.requestInfo ?? null
  const headers = request.headers ?? {}

  return {
    createdAt: new Date().toISOString(),
    method,
    url: request.url,
    pathname: getRequestPath(request.url),
    useProxy: Boolean(request.useProxy),
    headerSnapshot: {
      Host: getHeaderValue(headers, 'Host'),
      'Content-Length': getHeaderValue(headers, 'Content-Length'),
      'Content-Type': getHeaderValue(headers, 'Content-Type'),
      'MX-API': getHeaderValue(headers, 'MX-API'),
      'X-RY-USER': getHeaderValue(headers, 'X-RY-USER'),
      'X-RY-TIMESTAMP': getHeaderValue(headers, 'X-RY-TIMESTAMP'),
      'X-RY-CHECK': getHeaderValue(headers, 'X-RY-CHECK'),
      'X-RY-SIGN': getHeaderValue(headers, 'X-RY-SIGN'),
      'X-RY-MODEL': getHeaderValue(headers, 'X-RY-MODEL'),
      ShumeiBoxId: getHeaderValue(headers, 'ShumeiBoxId')
    },
    bodySnapshot: {
      fieldOrder: [...new URLSearchParams(typeof request.body === 'string' ? request.body : '').keys()],
      bodyLength: bodyText.length,
      bodySha256: hashText(bodyText),
      bodyRaw: bodyText,
      requestInfoLength: requestInfoRaw?.length ?? 0,
      requestInfoSha256: requestInfoRaw ? hashText(requestInfoRaw) : null,
      requestInfoRaw,
      parsedForm: formBody
    },
    responseStatus,
    responseData,
    responseSerialized: safeSerialize(responseData),
    error: requestError instanceof Error ? requestError.message : requestError ? String(requestError) : null
  }
}

async function writeRequestDiagnostic(
  method: 'GET' | 'POST',
  request: WandaHttpRequest,
  responseStatus: number | null,
  responseData: unknown,
  requestError?: unknown
): Promise<void> {
  const fileName = getDiagnosticFileName(request)
  const traceFileName = getDiagnosticTraceFileName(request)

  if (!fileName && !traceFileName) {
    return
  }

  try {
    const dir = join(app.getPath('userData'), 'diagnostics')
    const tempDir = join(app.getPath('temp'), 'wanda-ticket-tool')

    await mkdir(dir, { recursive: true })
    await mkdir(tempDir, { recursive: true })

    if (traceFileName) {
      const trace = buildLightweightTrace(method, request, responseStatus, responseData, requestError)
      await appendFile(join(dir, traceFileName), `${safeSerialize(trace)}\n`, 'utf-8')
      await appendFile(join(tempDir, traceFileName), `${safeSerialize(trace)}\n`, 'utf-8')
    }

    if (fileName) {
      const diagnostic = buildRequestDiagnostic(method, request, responseStatus, responseData, requestError)
      await writeFile(join(dir, fileName), JSON.stringify(diagnostic, null, 2), 'utf-8')
      await writeFile(join(tempDir, fileName), JSON.stringify(diagnostic, null, 2), 'utf-8')
    }
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

function buildRawRequestBody(body: unknown): string {
  if (typeof body === 'string') {
    return body
  }

  if (body === undefined || body === null) {
    return ''
  }

  return JSON.stringify(body)
}

function shouldUseRawWandaRequest(method: 'GET' | 'POST', request: WandaHttpRequest): boolean {
  if (request.useProxy) {
    return false
  }

  if (method !== 'POST') {
    return false
  }

  return getRequestPath(request.url) === WANDA_API_PATHS.ORDER_MERGE_PAYMENT
}

function parseRawResponseData(contentType: string | undefined, responseText: string): unknown {
  if (!responseText) {
    return null
  }

  const normalizedType = String(contentType || '').toLowerCase()

  if (normalizedType.includes('application/json') || responseText.startsWith('{') || responseText.startsWith('[')) {
    try {
      return JSON.parse(responseText)
    } catch {
      return responseText
    }
  }

  return responseText
}

async function sendRawWandaRequest(method: 'GET' | 'POST', request: WandaHttpRequest): Promise<WandaHttpResult> {
  const parsedUrl = new URL(request.url)
  const isHttpsRequest = parsedUrl.protocol === 'https:'
  const client = isHttpsRequest ? https : http
  const body = method === 'POST' ? buildRawRequestBody(request.body) : ''
  const requestHeaders = normalizeHeaders(request.headers) as Record<string, string> | undefined
  const headers: Record<string, string> = { ...(requestHeaders || {}) }

  if (method === 'POST') {
    headers['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'))
  }

  const response = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttpsRequest ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers,
        rejectUnauthorized: false
      },
      (res) => {
        const chunks: Buffer[] = []

        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })

        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks)
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase()

          try {
            const decodedBuffer =
              encoding === 'gzip'
                ? zlib.gunzipSync(rawBuffer)
                : encoding === 'deflate'
                  ? zlib.inflateSync(rawBuffer)
                  : rawBuffer

            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: decodedBuffer.toString('utf-8')
            })
          } catch {
            resolve({
              status: res.statusCode || 0,
              headers: res.headers,
              body: rawBuffer.toString('utf-8')
            })
          }
        })
      }
    )

    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy(new Error('请求超时'))
    })

    if (method === 'POST' && body) {
      req.write(body)
    }

    req.end()
  })

  const parsedData = parseRawResponseData(
    Array.isArray(response.headers['content-type']) ? response.headers['content-type'][0] : response.headers['content-type'],
    response.body
  )

  await writeRequestDiagnostic(method, request, response.status, parsedData)

  if (response.status >= 200 && response.status < 300) {
    return {
      ok: true,
      data: toCloneableWandaData(parsedData)
    }
  }

  return {
    ok: false,
    error: formatHttpError(response.status, parsedData)
  }
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
    if (shouldUseRawWandaRequest(method, request)) {
      return await sendRawWandaRequest(method, request)
    }

    const proxyEndpoint = request.useProxy ? await getProxyEndpoint() : null
    const response = await axios.request(buildAxiosConfig(method, request, proxyEndpoint))

    await writeRequestDiagnostic(method, request, response.status, response.data)

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
    await writeRequestDiagnostic(method, request, null, null, error)

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
