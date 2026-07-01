import { contextBridge, ipcRenderer } from 'electron'

import {
  IPC_CHANNELS,
  type AlipayClearSessionResult,
  type AlipayConvertRequest,
  type AlipayConvertResult,
  type AlipayDeviceFingerprint,
  type AlipaySyncDeviceResult,
  type AiOcrParseRequest,
  type AiOcrParseResult,
  type AutoOrderOpenWindowResult,
  type AutoOrderProcessTicketResult,
  type AutoOrderReportResult,
  type AutoOrderTicketRequest,
  type AutoOrderTicketResult,
  type BaiduOcrRequest,
  type BaiduOcrResult,
  type ClipboardImageResult,
  type ClipboardTextResult,
  type ElementCaptureRequest,
  type ElementCaptureResult,
  type ElementCopyResult,
  type LocalDataResult,
  type LocalDataWriteResult,
  type OldPackageIndexResult,
  type ProxyClearResult,
  type ProxyFetchResult,
  type ProxyUsedResult,
  type WandaH5OpenWindowRequest,
  type WandaH5OpenWindowResult,
  type WandaHttpRequest,
  type WandaHttpResult
} from '../shared/ipc'
import type { LocalDataFileName, LocalDataMap } from '../shared/localData'

export type {
  AiOcrParseRequest,
  AiOcrParseResult,
  BaiduOcrRequest,
  BaiduOcrResult,
  ClipboardImageResult,
  ClipboardTextResult,
  ElementCaptureRequest,
  ElementCaptureResult,
  ElementCopyResult,
  AlipayClearSessionResult,
  AlipayConvertRequest,
  AlipayConvertResult,
  AlipayDeviceFingerprint,
  AlipaySyncDeviceResult,
  LocalDataResult,
  LocalDataWriteResult,
  AutoOrderOpenWindowResult,
  AutoOrderProcessTicketResult,
  AutoOrderReportResult,
  AutoOrderTicketRequest,
  AutoOrderTicketResult,
  OldPackageIndexResult,
  ProxyClearResult,
  ProxyFetchResult,
  ProxyUsedResult,
  WandaH5OpenWindowRequest,
  WandaH5OpenWindowResult,
  WandaHttpRequest,
  WandaHttpResult
} from '../shared/ipc'
export type { LocalDataFileName, LocalDataMap } from '../shared/localData'

export interface WandaAppApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  getVersion: () => Promise<string>
  getLocalIp: () => Promise<string>
  getOldPackageIndex: () => Promise<OldPackageIndexResult>
  readLocalData: <T extends LocalDataFileName>(name: T) => Promise<LocalDataResult<T>>
  writeLocalData: <T extends LocalDataFileName>(
    name: T,
    data: LocalDataMap[T]
  ) => Promise<LocalDataWriteResult>
  wandaHttpGet: (request: WandaHttpRequest) => Promise<WandaHttpResult>
  wandaHttpPost: (request: WandaHttpRequest) => Promise<WandaHttpResult>
  readClipboardText: () => Promise<ClipboardTextResult>
  readClipboardImage: () => Promise<ClipboardImageResult>
  ocrRecognize: (request: BaiduOcrRequest) => Promise<BaiduOcrResult>
  aiParseOcr: (request: AiOcrParseRequest) => Promise<AiOcrParseResult>
  captureElement: (request: ElementCaptureRequest) => Promise<ElementCaptureResult>
  copyElementToClipboard: (request: ElementCaptureRequest) => Promise<ElementCopyResult>
  fetchProxy: () => Promise<ProxyFetchResult>
  getUsedProxy: () => Promise<ProxyUsedResult>
  clearProxyCache: () => Promise<ProxyClearResult>
  openAutoOrderWindow: () => Promise<AutoOrderOpenWindowResult>
  sendAutoOrderTicket: (request: AutoOrderTicketRequest) => Promise<AutoOrderProcessTicketResult>
  reportAutoOrderResult: (result: AutoOrderTicketResult) => Promise<AutoOrderReportResult>
  openWandaH5Window: (request: WandaH5OpenWindowRequest) => Promise<WandaH5OpenWindowResult>
  onAutoOrderProcessTicket: (listener: (request: AutoOrderTicketRequest) => void) => () => void
  onAutoOrderProcessResult: (listener: (result: AutoOrderTicketResult) => void) => () => void
  alipayConvert: (
    appPayParam: string,
    phone?: string,
    autoPayment?: AlipayConvertRequest['autoPayment']
  ) => Promise<AlipayConvertResult>
  alipaySyncDevice: (request: AlipayDeviceFingerprint) => Promise<AlipaySyncDeviceResult>
  alipayClearSession: () => Promise<AlipayClearSessionResult>
}

const wandaApp: WandaAppApi = {
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getLocalIp: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_LOCAL_IP),
  getOldPackageIndex: () => ipcRenderer.invoke(IPC_CHANNELS.OLD_PACKAGE_INDEX_READ),
  readLocalData: (name) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_DATA_READ, name),
  writeLocalData: (name, data) => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_DATA_WRITE, name, data),
  wandaHttpGet: (request) => ipcRenderer.invoke(IPC_CHANNELS.WANDA_HTTP_GET, request),
  wandaHttpPost: (request) => ipcRenderer.invoke(IPC_CHANNELS.WANDA_HTTP_POST, request),
  readClipboardText: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_READ_TEXT),
  readClipboardImage: () => ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_READ_IMAGE),
  ocrRecognize: (request) => ipcRenderer.invoke(IPC_CHANNELS.OCR_RECOGNIZE, request),
  aiParseOcr: (request) => ipcRenderer.invoke(IPC_CHANNELS.AI_OCR_PARSE, request),
  captureElement: (request) => ipcRenderer.invoke(IPC_CHANNELS.ELEMENT_CAPTURE, request),
  copyElementToClipboard: (request) => ipcRenderer.invoke(IPC_CHANNELS.ELEMENT_COPY_TO_CLIPBOARD, request),
  fetchProxy: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_FETCH),
  getUsedProxy: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_GET_USED),
  clearProxyCache: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_CLEAR_CACHE),
  openAutoOrderWindow: () => ipcRenderer.invoke(IPC_CHANNELS.AUTO_ORDER_OPEN_WINDOW),
  sendAutoOrderTicket: (request) => ipcRenderer.invoke(IPC_CHANNELS.AUTO_ORDER_PROCESS_TICKET, request),
  reportAutoOrderResult: (result) => ipcRenderer.invoke(IPC_CHANNELS.AUTO_ORDER_REPORT_RESULT, result),
  openWandaH5Window: (request) => ipcRenderer.invoke(IPC_CHANNELS.WANDA_H5_OPEN_WINDOW, request),
  onAutoOrderProcessTicket: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: AutoOrderTicketRequest) => listener(request)
    ipcRenderer.on(IPC_CHANNELS.AUTO_ORDER_PROCESS_EVENT, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTO_ORDER_PROCESS_EVENT, wrapped)
  },
  onAutoOrderProcessResult: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, result: AutoOrderTicketResult) => listener(result)
    ipcRenderer.on(IPC_CHANNELS.AUTO_ORDER_PROCESS_RESULT_EVENT, wrapped)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUTO_ORDER_PROCESS_RESULT_EVENT, wrapped)
  },
  alipayConvert: (appPayParam, phone, autoPayment) =>
    ipcRenderer.invoke(IPC_CHANNELS.ALIPAY_CONVERT, appPayParam, phone, autoPayment),
  alipaySyncDevice: (request) => ipcRenderer.invoke(IPC_CHANNELS.ALIPAY_SYNC_DEVICE, request),
  alipayClearSession: () => ipcRenderer.invoke(IPC_CHANNELS.ALIPAY_CLEAR_SESSION)
}

contextBridge.exposeInMainWorld('wandaApp', wandaApp)
contextBridge.exposeInMainWorld('api', {
  openAutoOrderWindow: async () => {
    const result = await wandaApp.openAutoOrderWindow()
    return { success: result.ok, error: result.ok ? undefined : result.error }
  },
  sendAutoOrderTicket: async (request: AutoOrderTicketRequest) => {
    const result = await wandaApp.sendAutoOrderTicket(request)
    return { success: result.ok, error: result.ok ? undefined : result.error }
  },
  reportAutoOrderResult: async (result: AutoOrderTicketResult) => {
    const response = await wandaApp.reportAutoOrderResult(result)
    return { success: response.ok, error: response.ok ? undefined : response.error }
  },
  onAutoOrderProcessTicket: wandaApp.onAutoOrderProcessTicket,
  onAutoOrderProcessResult: wandaApp.onAutoOrderProcessResult
})

declare global {
  interface Window {
    wandaApp: WandaAppApi
    api: {
      openAutoOrderWindow: () => Promise<{ success: boolean; error?: string }>
      sendAutoOrderTicket: (request: AutoOrderTicketRequest) => Promise<{ success: boolean; error?: string }>
      reportAutoOrderResult: (result: AutoOrderTicketResult) => Promise<{ success: boolean; error?: string }>
      onAutoOrderProcessTicket: (listener: (request: AutoOrderTicketRequest) => void) => () => void
      onAutoOrderProcessResult: (listener: (result: AutoOrderTicketResult) => void) => () => void
    }
  }
}
