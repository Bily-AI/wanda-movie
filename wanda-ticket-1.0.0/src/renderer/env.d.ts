import type { OldPackageIndexResult } from '@shared/ipc'

export {}

declare global {
  interface Window {
    wandaApp?: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      getVersion: () => Promise<string>
      getOldPackageIndex: () => Promise<OldPackageIndexResult>
    }
  }
}
