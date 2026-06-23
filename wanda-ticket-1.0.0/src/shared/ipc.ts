import type { LocalDataFileName, LocalDataMap } from './localData'
import type { ParsedOcrSeat } from './ocrParser'

export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  APP_GET_VERSION: 'app:get-version',
  APP_GET_LOCAL_IP: 'app:get-local-ip',
  OLD_PACKAGE_INDEX_READ: 'old-package-index:read',
  LOCAL_DATA_READ: 'local-data:read',
  LOCAL_DATA_WRITE: 'local-data:write',
  WANDA_HTTP_GET: 'wanda-http-get',
  WANDA_HTTP_POST: 'wanda-http-post',
  CLIPBOARD_READ_TEXT: 'read-clipboard-text',
  CLIPBOARD_READ_IMAGE: 'read-clipboard-image',
  OCR_RECOGNIZE: 'ocr-recognize',
  AI_OCR_PARSE: 'ai-parse-ocr',
  ELEMENT_CAPTURE: 'capture-element',
  ELEMENT_COPY_TO_CLIPBOARD: 'copy-element-to-clipboard',
  PROXY_FETCH: 'fetch-proxy',
  PROXY_GET_USED: 'proxy-get-used',
  PROXY_CLEAR_CACHE: 'proxy-clear-cache',
  AUTO_ORDER_OPEN_WINDOW: 'open-auto-order-window',
  AUTO_ORDER_PROCESS_TICKET: 'auto-order-process-ticket',
  AUTO_ORDER_REPORT_RESULT: 'auto-order-report-result',
  AUTO_ORDER_PROCESS_EVENT: 'auto-order:process-ticket',
  AUTO_ORDER_PROCESS_RESULT_EVENT: 'auto-order:process-result',
  ALIPAY_CLEAR_SESSION: 'alipay-clear-session',
  ALIPAY_SYNC_DEVICE: 'alipay-sync-device',
  ALIPAY_CONVERT: 'alipay-convert'
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
  useProxy?: boolean
}

export type WandaHttpResult = IpcResult<unknown>

export interface ClipboardImageData {
  base64: string
  size: number
}

export interface BaiduOcrRequest {
  imageBase64: string
  accurate?: boolean
}

export interface BaiduOcrData {
  words: string[]
  wordsNum: number
  raw: unknown
}

export interface AiOcrParseRequest {
  text: string
  words?: string[]
}

export interface AiOcrParsedTicket {
  rawText?: string
  words?: string[]
  cinemaName?: string
  movieName?: string
  date?: string
  time?: string
  hallName?: string
  language?: string
  price?: string
  seats?: ParsedOcrSeat[]
}

export interface ElementCaptureRequest {
  selector: string
}

export interface ElementCaptureData {
  base64: string
  path: string
  size: number
  width: number
  height: number
}

export type ClipboardTextResult = IpcResult<string>

export type ClipboardImageResult = IpcResult<ClipboardImageData>

export type BaiduOcrResult = IpcResult<BaiduOcrData>

export type AiOcrParseResult = IpcResult<AiOcrParsedTicket>

export type ElementCaptureResult = IpcResult<ElementCaptureData>

export type ElementCopyResult = IpcResult<boolean>

export interface ProxyEndpoint {
  host: string
  port: number
}

export interface UsedProxyData {
  proxy: string
}

export type ProxyFetchResult = IpcResult<ProxyEndpoint>

export type ProxyUsedResult = IpcResult<UsedProxyData>

export type ProxyClearResult = IpcResult<boolean>

export interface AutoOrderTicketRequest {
  orderId: string
  platform: string
  ticketText: string
  raw?: unknown
}

export interface AutoOrderTicketResult {
  orderId: string
  platform?: string
  status: 'success' | 'failed'
  remark?: string
  ticketCode?: string
}

export type AutoOrderOpenWindowResult = IpcResult<boolean>

export type AutoOrderProcessTicketResult = IpcResult<boolean>

export type AutoOrderReportResult = IpcResult<boolean>

export interface AlipayDeviceFingerprint {
  model?: string
  ios?: string
  screen?: string
  width?: string | number
  height?: string | number
  build?: string
}

export interface AlipayAutoPaymentOptions {
  enabled?: boolean
  phone?: string
  password?: string
}

export interface AlipayConvertRequest {
  appPayParam: string
  deviceFingerprint?: AlipayDeviceFingerprint
  autoPayment?: AlipayAutoPaymentOptions
}

export interface AlipayConvertData {
  url: string
  reusedWindow: boolean
}

export type AlipayConvertResult = IpcResult<AlipayConvertData>

export type AlipaySyncDeviceResult = IpcResult<boolean>

export type AlipayClearSessionResult = IpcResult<boolean>
