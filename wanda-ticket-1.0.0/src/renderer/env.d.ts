import type {
  AiOcrParseRequest,
  AiOcrParseResult,
  AlipayClearSessionResult,
  AlipayConvertRequest,
  AlipayConvertResult,
  AlipayDeviceFingerprint,
  AlipaySyncDeviceResult,
  AutoOrderOpenWindowResult,
  AutoOrderProcessTicketResult,
  AutoOrderReportResult,
  AutoOrderTicketRequest,
  AutoOrderTicketResult,
  LocalDataResult,
  LocalDataWriteResult,
  OldPackageIndexResult,
  BaiduOcrRequest,
  BaiduOcrResult,
  ClipboardImageResult,
  ClipboardTextResult,
  ElementCaptureRequest,
  ElementCaptureResult,
  ElementCopyResult,
  WandaH5OpenWindowRequest,
  WandaH5OpenWindowResult,
  WandaHttpRequest,
  WandaHttpResult
} from '@shared/ipc'
import type { LocalDataFileName, LocalDataMap } from '@shared/localData'

export {}

declare global {
  interface Window {
    wandaApp?: {
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
      alipayConvert: (
        appPayParam: string,
        phone?: string,
        autoPayment?: AlipayConvertRequest['autoPayment']
      ) => Promise<AlipayConvertResult>
      alipaySyncDevice: (request: AlipayDeviceFingerprint) => Promise<AlipaySyncDeviceResult>
      alipayClearSession: () => Promise<AlipayClearSessionResult>
      captureElement: (request: ElementCaptureRequest) => Promise<ElementCaptureResult>
      copyElementToClipboard: (request: ElementCaptureRequest) => Promise<ElementCopyResult>
      openWandaH5Window: (request: WandaH5OpenWindowRequest) => Promise<WandaH5OpenWindowResult>
      openAutoOrderWindow: () => Promise<AutoOrderOpenWindowResult>
      sendAutoOrderTicket: (request: AutoOrderTicketRequest) => Promise<AutoOrderProcessTicketResult>
      reportAutoOrderResult: (result: AutoOrderTicketResult) => Promise<AutoOrderReportResult>
      onAutoOrderProcessTicket: (listener: (request: AutoOrderTicketRequest) => void) => () => void
      onAutoOrderProcessResult: (listener: (result: AutoOrderTicketResult) => void) => () => void
    }
  }
}
