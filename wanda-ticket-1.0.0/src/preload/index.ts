import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  type LocalDataResult,
  type LocalDataWriteResult,
  type OldPackageIndexResult,
  type WandaHttpRequest,
  type WandaHttpResult
} from '../shared/ipc'
import type { LocalDataFileName, LocalDataMap } from '../shared/localData'

export type {
  LocalDataResult,
  LocalDataWriteResult,
  OldPackageIndexResult,
  WandaHttpRequest,
  WandaHttpResult
} from '../shared/ipc'
export type { LocalDataFileName, LocalDataMap } from '../shared/localData'

export interface WandaAppApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  getVersion: () => Promise<string>
  getOldPackageIndex: () => Promise<OldPackageIndexResult>
  readLocalData: <T extends LocalDataFileName>(name: T) => Promise<LocalDataResult<T>>
  writeLocalData: <T extends LocalDataFileName>(
    name: T,
    data: LocalDataMap[T]
  ) => Promise<LocalDataWriteResult>
  wandaHttpGet: (request: WandaHttpRequest) => Promise<WandaHttpResult>
  wandaHttpPost: (request: WandaHttpRequest) => Promise<WandaHttpResult>
}

const wandaApp: WandaAppApi = {
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getOldPackageIndex: () => ipcRenderer.invoke(IPC_CHANNELS.OLD_PACKAGE_INDEX_READ),
  readLocalData: (name) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_DATA_READ, name),
  writeLocalData: (name, data) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_DATA_WRITE, name, data),
  wandaHttpGet: (request) => ipcRenderer.invoke(IPC_CHANNELS.WANDA_HTTP_GET, request),
  wandaHttpPost: (request) => ipcRenderer.invoke(IPC_CHANNELS.WANDA_HTTP_POST, request)
}

contextBridge.exposeInMainWorld('wandaApp', wandaApp)

declare global {
  interface Window {
    wandaApp: WandaAppApi
  }
}
