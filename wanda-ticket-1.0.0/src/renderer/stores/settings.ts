import { defineStore } from 'pinia'

import { setWandaRequestParams } from '@renderer/services/wandaRequest'
import { DEFAULT_LOCAL_DATA, type RequestParamsLocalData } from '@shared/localData'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function formatParam(value: string): string {
  return value || '未生成'
}

function generateDeviceUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let value = ''

  for (let index = 0; index < 10; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }

  return value
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    rememberWindow: DEFAULT_LOCAL_DATA.settings.rememberWindow,
    autoClosePaymentWindow: DEFAULT_LOCAL_DATA.settings.autoClosePaymentWindow,
    paymentCardDisplay: DEFAULT_LOCAL_DATA.settings.paymentCardDisplay,
    ticketCodeTemplate: DEFAULT_LOCAL_DATA.settings.ticketCodeTemplate,
    autoPayment: structuredClone(DEFAULT_LOCAL_DATA.settings.autoPayment),
    baiduOcr: structuredClone(DEFAULT_LOCAL_DATA.settings.baiduOcr),
    aiOcr: structuredClone(DEFAULT_LOCAL_DATA.settings.aiOcr),
    requestParams: structuredClone(DEFAULT_LOCAL_DATA.requestParams) as RequestParamsLocalData,
    proxyApi: DEFAULT_LOCAL_DATA.proxy.proxyApiUrl,
    useProxyIp: DEFAULT_LOCAL_DATA.proxy.useProxy,
    activity: {
      city: '',
      cinema: '',
      activityCode: ''
    }
  }),
  getters: {
    requestParamsPreview(state) {
      return [
        `设备指纹：${formatParam(state.requestParams.deviceFingerprint)}`,
        `设备型号：${formatParam(state.requestParams.model)}`,
        `用户标识：${formatParam(state.requestParams.userId)}`,
        `ShumeiBoxId：${formatParam(state.requestParams.shumeiBoxId)}`
      ].join('\n')
    },
    baiduOcrConfigured(state) {
      return Boolean(state.baiduOcr.apiKey.trim() && state.baiduOcr.secretKey.trim())
    },
    aiOcrConfigured(state) {
      return Boolean(
        state.aiOcr.enabled &&
          state.aiOcr.apiKey.trim() &&
          state.aiOcr.baseUrl.trim() &&
          state.aiOcr.model.trim()
      )
    }
  },
  actions: {
    syncRequestParams() {
      setWandaRequestParams(this.requestParams)
    },
    refreshRequestParams() {
      this.requestParams = {
        ...this.requestParams,
        userId: generateDeviceUserId(),
        model: this.requestParams.model || 'M2102J2SC',
        width: this.requestParams.width || '1080',
        height: this.requestParams.height || '2206'
      }
      this.syncRequestParams()
    },
    async loadSettings() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        return
      }

      const [settingsResult, proxyResult, requestParamsResult] = await Promise.all([
        wandaApp.readLocalData('settings'),
        wandaApp.readLocalData('proxy'),
        wandaApp.readLocalData('requestParams')
      ])

      if (settingsResult.ok) {
        this.rememberWindow = settingsResult.data.rememberWindow
        this.autoClosePaymentWindow = settingsResult.data.autoClosePaymentWindow
        this.paymentCardDisplay = settingsResult.data.paymentCardDisplay
        this.ticketCodeTemplate = settingsResult.data.ticketCodeTemplate
        this.autoPayment = settingsResult.data.autoPayment
        this.baiduOcr = settingsResult.data.baiduOcr
        this.aiOcr = settingsResult.data.aiOcr
      }

      if (proxyResult.ok) {
        this.proxyApi = proxyResult.data.proxyApiUrl
        this.useProxyIp = proxyResult.data.useProxy
      }

      if (requestParamsResult.ok) {
        this.requestParams = requestParamsResult.data
      }

      this.syncRequestParams()
    },
    async saveSettings() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        return
      }

      this.syncRequestParams()

      await Promise.all([
        wandaApp.writeLocalData('settings', {
          rememberWindow: this.rememberWindow,
          autoClosePaymentWindow: this.autoClosePaymentWindow,
          paymentCardDisplay: this.paymentCardDisplay,
          ticketCodeTemplate: this.ticketCodeTemplate,
          autoPayment: this.autoPayment,
          baiduOcr: this.baiduOcr,
          aiOcr: this.aiOcr
        }),
        wandaApp.writeLocalData('proxy', {
          proxyApiUrl: this.proxyApi,
          useProxy: this.useProxyIp
        }),
        wandaApp.writeLocalData('requestParams', this.requestParams)
      ])
    },
    async clearCacheData() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        throw new Error('Electron 桥接未就绪')
      }

      const result = await wandaApp.writeLocalData('city', DEFAULT_LOCAL_DATA.city)

      if (!result.ok) {
        throw new Error(result.error || '清除缓存失败')
      }
    }
  }
})
