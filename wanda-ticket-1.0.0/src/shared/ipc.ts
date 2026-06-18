import type { LocalDataFileName, LocalDataMap } from './localData'

export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  APP_GET_VERSION: 'app:get-version',
  OLD_PACKAGE_INDEX_READ: 'old-package-index:read',
  LOCAL_DATA_READ: 'local-data:read',
  LOCAL_DATA_WRITE: 'local-data:write',
  WANDA_HTTP_GET: 'wanda-http-get',
  WANDA_HTTP_POST: 'wanda-http-post'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]

export type IpcResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type OldPackageIndexResult = IpcResult<unknown>

export type LocalDataResult<T extends LocalDataFileName> = IpcResult<LocalDataMap[T]>

export type LocalDataWriteResult = IpcResult<boolean>

export interface WandaHttpRequest {
  url: string
  headers?: Record<string, unknown>
  params?: Record<string, unknown>
  body?: Record<string, unknown> | string
}

export type WandaHttpResult = IpcResult<unknown>
