import { ipcMain } from 'electron'
import axios, { type AxiosRequestConfig } from 'axios'

import { IPC_CHANNELS, type ProxyEndpoint, type WandaHttpRequest, type WandaHttpResult } from '../shared/ipc'
import { validateWandaRequest } from '../shared/wandaCore'
import { getProxyEndpoint } from './proxy'

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
