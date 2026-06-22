import { ipcMain } from 'electron'
import axios from 'axios'

import {
  IPC_CHANNELS,
  type ProxyClearResult,
  type ProxyEndpoint,
  type ProxyFetchResult,
  type ProxyUsedResult
} from '../shared/ipc'
import { readLocalDataFile } from './localData'

const PROXY_CACHE_MS = 60_000

let cachedProxy: (ProxyEndpoint & { expireAt: number }) | null = null
let lastProxyAddress = ''

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function readPort(value: unknown): number {
  const port = Number(value)
  return Number.isFinite(port) && port > 0 ? port : 0
}

function parseProxyRecord(record: Record<string, unknown>): ProxyEndpoint | null {
  const host = readText(record.ip) || readText(record.host) || readText(record.proxy_ip)
  const port = readPort(record.port) || readPort(record.proxy_port)

  if (!host || !port) {
    return null
  }

  return { host, port }
}

function parseProxyText(text: string): ProxyEndpoint | null {
  const compactText = text.replace(/[\r\n\t\s]/g, '')
  const [host, portText] = compactText.split(':')
  const port = readPort(portText)

  if (!host || !port) {
    return null
  }

  return { host, port }
}

export function parseProxyResponse(response: unknown): ProxyEndpoint | null {
  if (typeof response === 'string') {
    try {
      return parseProxyResponse(JSON.parse(response))
    } catch {
      return parseProxyText(response)
    }
  }

  if (!isRecord(response)) {
    return null
  }

  const candidates = [response, response.data]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (isRecord(item)) {
          const proxy = parseProxyRecord(item)

          if (proxy) {
            return proxy
          }
        }
      }
    }

    if (isRecord(candidate)) {
      const proxy = parseProxyRecord(candidate)

      if (proxy) {
        return proxy
      }
    }
  }

  return null
}

function rememberProxy(proxy: ProxyEndpoint): ProxyEndpoint {
  cachedProxy = {
    ...proxy,
    expireAt: Date.now() + PROXY_CACHE_MS
  }
  lastProxyAddress = `${proxy.host}:${proxy.port}`
  return proxy
}

async function fetchProxy(): Promise<ProxyFetchResult> {
  if (cachedProxy && cachedProxy.expireAt > Date.now()) {
    return {
      ok: true,
      data: {
        host: cachedProxy.host,
        port: cachedProxy.port
      }
    }
  }

  const proxyConfig = await readLocalDataFile('proxy')
  const proxyApiUrl = proxyConfig.proxyApiUrl.trim()

  if (!proxyApiUrl) {
    return {
      ok: false,
      error: '缺少代理提取 API'
    }
  }

  try {
    const response = await axios.get(proxyApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000,
      validateStatus: () => true
    })

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        error: `代理 API 请求失败：HTTP ${response.status}`
      }
    }

    const proxy = parseProxyResponse(response.data)

    if (!proxy) {
      return {
        ok: false,
        error: `无法解析代理地址：${String(response.data).slice(0, 100)}`
      }
    }

    return {
      ok: true,
      data: rememberProxy(proxy)
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '代理 API 请求失败'
    }
  }
}

export async function getProxyEndpoint(): Promise<ProxyEndpoint | null> {
  const result = await fetchProxy()

  return result.ok ? result.data : null
}

function getUsedProxy(): ProxyUsedResult {
  return {
    ok: true,
    data: {
      proxy: lastProxyAddress
    }
  }
}

function clearProxyCache(): ProxyClearResult {
  cachedProxy = null
  lastProxyAddress = ''

  return {
    ok: true,
    data: true
  }
}

export function registerProxyHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PROXY_FETCH, () => fetchProxy())
  ipcMain.handle(IPC_CHANNELS.PROXY_GET_USED, () => getUsedProxy())
  ipcMain.handle(IPC_CHANNELS.PROXY_CLEAR_CACHE, () => clearProxyCache())
}
