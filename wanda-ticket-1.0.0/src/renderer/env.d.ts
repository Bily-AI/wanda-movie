import type {
  LocalDataResult,
  LocalDataWriteResult,
  OldPackageIndexResult,
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
      getOldPackageIndex: () => Promise<OldPackageIndexResult>
      readLocalData: <T extends LocalDataFileName>(name: T) => Promise<LocalDataResult<T>>
      writeLocalData: <T extends LocalDataFileName>(
        name: T,
        data: LocalDataMap[T]
      ) => Promise<LocalDataWriteResult>
      wandaHttpGet: (request: WandaHttpRequest) => Promise<WandaHttpResult>
      wandaHttpPost: (request: WandaHttpRequest) => Promise<WandaHttpResult>
    }
  }
}
