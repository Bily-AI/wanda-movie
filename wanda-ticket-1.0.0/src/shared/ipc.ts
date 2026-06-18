export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  APP_GET_VERSION: 'app:get-version',
  OLD_PACKAGE_INDEX_READ: 'old-package-index:read'
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
