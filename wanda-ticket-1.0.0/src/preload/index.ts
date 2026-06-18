import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type OldPackageIndexResult } from '../shared/ipc'

export type { OldPackageIndexResult } from '../shared/ipc'

export interface WandaAppApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  getVersion: () => Promise<string>
  getOldPackageIndex: () => Promise<OldPackageIndexResult>
}

const wandaApp: WandaAppApi = {
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getOldPackageIndex: () => ipcRenderer.invoke(IPC_CHANNELS.OLD_PACKAGE_INDEX_READ)
}

contextBridge.exposeInMainWorld('wandaApp', wandaApp)

declare global {
  interface Window {
    wandaApp: WandaAppApi
  }
}
