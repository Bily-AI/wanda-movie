import type { AlipayAutoPaymentOptions, AlipayDeviceFingerprint } from '@shared/ipc'
import type { RequestParamsLocalData } from '@shared/localData'

interface AlipayOpenOptions {
  requestParams: RequestParamsLocalData
  autoPayment: AlipayAutoPaymentOptions
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function pickAppPayParam(value: unknown, depth = 0): string {
  if (depth > 6) {
    return ''
  }

  if (typeof value === 'string') {
    const text = value.trim()

    return text.includes('appPayParam') || text.includes('alipay_sdk') || text.includes('biz_content') ? text : ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = pickAppPayParam(item, depth + 1)

      if (text) {
        return text
      }
    }

    return ''
  }

  if (!isRecord(value)) {
    return ''
  }

  for (const key of ['appPayParam', 'app_pay_param', 'payParam', 'payParams']) {
    const text = readText(value[key])

    if (text) {
      return text
    }
  }

  for (const item of Object.values(value)) {
    const text = pickAppPayParam(item, depth + 1)

    if (text) {
      return text
    }
  }

  return ''
}

export function extractAppPayParam(value: unknown): string {
  return pickAppPayParam(value)
}

export function buildAlipayDeviceFingerprint(requestParams: RequestParamsLocalData): AlipayDeviceFingerprint {
  return {
    model: requestParams.model,
    ios: requestParams.ios,
    screen: requestParams.screen,
    width: requestParams.width,
    height: requestParams.height,
    build: requestParams.build
  }
}

export async function openAlipayPayment(appPayParam: string, options: AlipayOpenOptions) {
  const wandaApp = window.wandaApp

  if (!wandaApp) {
    throw new Error('Electron 桥接未就绪，无法打开支付宝支付')
  }

  const result = await wandaApp.alipayConvert({
    appPayParam,
    deviceFingerprint: buildAlipayDeviceFingerprint(options.requestParams),
    autoPayment: options.autoPayment
  })

  if (!result.ok) {
    throw new Error(result.error || '打开支付宝支付失败')
  }

  return result.data
}
