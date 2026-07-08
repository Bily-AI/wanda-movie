import { defineStore } from 'pinia'
import { toRaw } from 'vue'

import { setWandaRequestParams } from '@renderer/services/wandaRequest'
import {
  DEFAULT_LOCAL_DATA,
  type ProxyLocalData,
  type RequestParamsLocalData,
  type SettingsLocalData
} from '@shared/localData'

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

function generateRequestFingerprint(): string {
  const chars = '0123456789abcdef'
  let value = ''

  for (let index = 0; index < 32; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }

  return value
}

function generateShumeiBoxId(): string {
  const chars = '0123456789abcdef'
  let value = ''

  for (let index = 0; index < 32; index += 1) {
    value += chars[Math.floor(Math.random() * chars.length)]
  }

  return value
}

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

function randomDeviceProfile() {
  const models = [
    'iPhone13,3',
    'iPhone14,5',
    'iPhone14,7',
    'iPhone15,3',
    'iPhone15,4',
    'iPhone16,1',
    'iPhone16,2'
  ]
  const versions = ['17.4', '17.5.1', '17.6.1', '18.0', '18.1', '18.2']
  const screens = ['390x844', '393x852', '430x932', '375x812', '414x896']
  const builds = ['619.1.19.11.8', '619.2.5.10.1', '620.1.16.10.11', '620.2.4.10.7']
  const screen = pickRandom(screens)
  const [width, height] = screen.split('x')

  return {
    model: pickRandom(models),
    ios: pickRandom(versions),
    screen,
    width,
    height,
    build: pickRandom(builds)
  }
}

function toPlainSettingsData(data: SettingsLocalData): SettingsLocalData {
  return structuredClone({
    themeMode: data.themeMode,
    rememberWindow: data.rememberWindow,
    autoClosePaymentWindow: data.autoClosePaymentWindow,
    paymentCardDisplay: data.paymentCardDisplay,
    ticketCodeTemplate: data.ticketCodeTemplate,
    autoPayment: { ...toRaw(data.autoPayment) },
    baiduOcr: { ...toRaw(data.baiduOcr) },
    aiOcr: { ...toRaw(data.aiOcr) }
  })
}

function toPlainProxyData(data: ProxyLocalData): ProxyLocalData {
  return structuredClone({
    proxyApiUrl: data.proxyApiUrl,
    useProxy: data.useProxy
  })
}

function toPlainRequestParamsData(data: RequestParamsLocalData): RequestParamsLocalData {
  return structuredClone({ ...toRaw(data) })
}

function hasUsableRequestParams(data: RequestParamsLocalData): boolean {
  return Boolean(data.shumeiBoxId && data.userId && data.model)
}

function normalizeRequestParams(data: RequestParamsLocalData): RequestParamsLocalData {
  const screen = String(data.screen || '').trim()
  const [screenWidth = '', screenHeight = ''] = screen.split('x')

  return {
    ...data,
    deviceFingerprint: String(data.deviceFingerprint || '').trim(),
    userId: String(data.userId || '').trim(),
    model: String(data.model || '').trim(),
    ios: String(data.ios || '').trim(),
    screen,
    width: String(data.width || screenWidth || '').trim(),
    height: String(data.height || screenHeight || '').trim(),
    build: String(data.build || '').trim(),
    shumeiBoxId: String(data.shumeiBoxId || '').trim(),
    languageType: String(data.languageType || '').trim()
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    themeMode: DEFAULT_LOCAL_DATA.settings.themeMode,
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
      setWandaRequestParams(toPlainRequestParamsData(this.requestParams))
    },
    refreshRequestParams() {
      const deviceProfile = randomDeviceProfile()
      const fingerprint = generateRequestFingerprint()
      const shumeiBoxId = generateShumeiBoxId()

      this.requestParams = {
        ...this.requestParams,
        deviceFingerprint: fingerprint,
        shumeiBoxId,
        userId: generateDeviceUserId(),
        model: deviceProfile.model,
        ios: deviceProfile.ios,
        screen: deviceProfile.screen,
        width: deviceProfile.width,
        height: deviceProfile.height,
        build: deviceProfile.build
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
        this.themeMode = settingsResult.data.themeMode || DEFAULT_LOCAL_DATA.settings.themeMode
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
        this.requestParams = normalizeRequestParams(requestParamsResult.data)
      }

      if (!hasUsableRequestParams(this.requestParams)) {
        this.refreshRequestParams()
        await wandaApp.writeLocalData('requestParams', toPlainRequestParamsData(this.requestParams))
      }

      this.syncRequestParams()
    },
    async saveSettings() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        return
      }

      const requestParamsData = toPlainRequestParamsData(this.requestParams)
      const settingsData = toPlainSettingsData({
        themeMode: this.themeMode,
        rememberWindow: this.rememberWindow,
        autoClosePaymentWindow: this.autoClosePaymentWindow,
        paymentCardDisplay: this.paymentCardDisplay,
        ticketCodeTemplate: this.ticketCodeTemplate,
        autoPayment: this.autoPayment,
        baiduOcr: this.baiduOcr,
        aiOcr: this.aiOcr
      })
      const proxyData = toPlainProxyData({
        proxyApiUrl: this.proxyApi,
        useProxy: this.useProxyIp
      })

      setWandaRequestParams(requestParamsData)

      await Promise.all([
        wandaApp.writeLocalData('settings', settingsData),
        wandaApp.writeLocalData('proxy', proxyData),
        wandaApp.writeLocalData('requestParams', requestParamsData)
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
