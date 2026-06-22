import type {
  AiOcrParseRequest,
  AiOcrParseResult,
  AlipayClearSessionResult,
  AlipayConvertRequest,
  AlipayConvertResult,
  AlipayDeviceFingerprint,
  AlipaySyncDeviceResult,
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
      alipayConvert: (request: AlipayConvertRequest) => Promise<AlipayConvertResult>
      alipaySyncDevice: (request: AlipayDeviceFingerprint) => Promise<AlipaySyncDeviceResult>
      alipayClearSession: () => Promise<AlipayClearSessionResult>
      captureElement: (request: ElementCaptureRequest) => Promise<ElementCaptureResult>
      copyElementToClipboard: (request: ElementCaptureRequest) => Promise<ElementCopyResult>
    }
  }
}
