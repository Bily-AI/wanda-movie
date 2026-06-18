import { defineStore } from 'pinia'

type OldPackageIndexStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'unavailable'

const fallbackVersion = '1.0.0'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

export const useAppStore = defineStore('app', {
  state: () => ({
    version: fallbackVersion,
    oldPackageIndexStatus: 'idle' as OldPackageIndexStatus,
    oldPackageIndexError: '',
    oldPackageIndex: null as unknown | null
  }),
  actions: {
    async initialize() {
      await Promise.all([this.loadVersion(), this.loadOldPackageIndex()])
    },
    async loadVersion() {
      const wandaApp = getWandaApp()

      if (!wandaApp?.getVersion) {
        this.version = fallbackVersion
        return
      }

      try {
        this.version = (await wandaApp.getVersion()) || fallbackVersion
      } catch {
        this.version = fallbackVersion
      }
    },
    async loadOldPackageIndex() {
      const wandaApp = getWandaApp()

      if (!wandaApp?.getOldPackageIndex) {
        this.oldPackageIndexStatus = 'unavailable'
        this.oldPackageIndexError = ''
        this.oldPackageIndex = null
        return
      }

      this.oldPackageIndexStatus = 'loading'
      this.oldPackageIndexError = ''

      try {
        const result = await wandaApp.getOldPackageIndex()

        if (result.ok) {
          this.oldPackageIndexStatus = 'loaded'
          this.oldPackageIndex = result.data
          this.oldPackageIndexError = ''
          return
        }

        this.oldPackageIndexStatus = 'error'
        this.oldPackageIndexError = result.error
        this.oldPackageIndex = null
      } catch (error) {
        this.oldPackageIndexStatus = 'error'
        this.oldPackageIndexError = error instanceof Error ? error.message : '旧索引读取失败'
        this.oldPackageIndex = null
      }
    }
  }
})
