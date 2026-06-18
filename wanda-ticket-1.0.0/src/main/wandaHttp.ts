import { ipcMain } from 'electron'
import axios, { type AxiosRequestConfig } from 'axios'

import { IPC_CHANNELS, type WandaHttpRequest, type WandaHttpResult } from '../shared/ipc'
import { validateWandaRequest } from '../shared/wandaCore'

function buildAxiosConfig(method: 'GET' | 'POST', request: WandaHttpRequest): AxiosRequestConfig {
  return {
    method,
    url: request.url,
    headers: request.headers,
    params: request.params,
    data: method === 'POST' ? request.body : undefined,
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
    const response = await axios.request(buildAxiosConfig(method, request))

    if (response.status >= 200 && response.status < 300) {
      return {
        ok: true,
        data: response.data
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
