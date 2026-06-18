import { WANDA_HOSTS } from '@shared/wandaCore'
import type { WandaApiResponse } from '@shared/wandaTicketTypes'

export type WandaQuery = Record<string, string | number | boolean | undefined>
export type WandaBody = Record<string, string | number | boolean | undefined>

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
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

  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-RY-TIMESTAMP': timestamp,
    'X-RY-TOKEN': ck,
    'X-RY-USER': userIdentifier,
    'X-RY-PATH': path,
    'X-RY-BODY': body
  }
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
