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
  ELEMENT_COPY_TO_CLIPBOARD: 'copy-element-to-clipboard'
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
