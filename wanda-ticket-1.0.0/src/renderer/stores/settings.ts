import { defineStore } from 'pinia'

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

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    rememberWindow: DEFAULT_LOCAL_DATA.settings.rememberWindow,
    autoClosePaymentWindow: DEFAULT_LOCAL_DATA.settings.autoClosePaymentWindow,
    paymentCardDisplay: DEFAULT_LOCAL_DATA.settings.paymentCardDisplay,
    ticketCodeTemplate: DEFAULT_LOCAL_DATA.settings.ticketCodeTemplate,
    autoPayment: structuredClone(DEFAULT_LOCAL_DATA.settings.autoPayment),
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
    }
  },
  actions: {
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
      }

      if (proxyResult.ok) {
        this.proxyApi = proxyResult.data.proxyApiUrl
        this.useProxyIp = proxyResult.data.useProxy
      }

      if (requestParamsResult.ok) {
        this.requestParams = requestParamsResult.data
      }
    },
    async saveSettings() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        return
      }

      await Promise.all([
        wandaApp.writeLocalData('settings', {
          rememberWindow: this.rememberWindow,
          autoClosePaymentWindow: this.autoClosePaymentWindow,
          paymentCardDisplay: this.paymentCardDisplay,
          ticketCodeTemplate: this.ticketCodeTemplate,
          autoPayment: this.autoPayment
        }),
        wandaApp.writeLocalData('proxy', {
          proxyApiUrl: this.proxyApi,
          useProxy: this.useProxyIp
        }),
        wandaApp.writeLocalData('requestParams', this.requestParams)
      ])
    }
  }
})
