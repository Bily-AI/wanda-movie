import { BrowserWindow, ipcMain, session } from 'electron'
import crypto from 'node:crypto'
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'

import {
  IPC_CHANNELS,
  type AlipayClearSessionResult,
  type AlipayConvertRequest,
  type AlipayConvertResult,
  type AlipayDeviceFingerprint,
  type AlipaySyncDeviceResult
} from '../shared/ipc'

const ALIPAY_GATEWAY_URL = 'http://mcgw.alipay.com/gateway.do'
const ALIPAY_PARTITION = 'persist:alipay'
const ALIPAY_WINDOW_TITLE = '支付宝支付'
const DES3_KEY = '23h4fhdilenbs741kogue1tl'
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDENksAVqDoz5SMCZq0bsZwE+I3NjrANyTTwUVSf1+ec1PfPB4tiocEpYJFCYju9MIbawR8ivECbUWjpffZq5QllJg+19CB7V5rYGcEnb/M7CS3lFF2sNcRFJUtXUUAqyR3/l7PmpxTwObZ4DLG258dhE2vFlVGXjnuLs+FI2hg4QIDAQAB
-----END PUBLIC KEY-----`
const DEFAULT_FINGERPRINT = {
  model: 'iPhone15,4',
  ios: '17.4',
  screen: '393x852',
  width: 393,
  height: 852,
  build: '619.1.19.11.8'
}
const ALIPAY_SDK_USER_AGENT =
  'Msp/9.1.5 (Android 12;Linux 4.4.146;zh_CN;http;540*960;21.0;WIFI;87699552;32617;1;000000000000000;000000000000000;8efce46e85;GOOGLE;H002;false;00:00:00:00:00:00;-1.0;-1.0;sdk-and-lite;65r7u2pfruicqrn;r2agza5c56pzmev;<unknown ssid>;02:00:00:00:00:00)'

let cachedFingerprint: AlipayDeviceFingerprint | null = null
let alipayPayWindow: BrowserWindow | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : fallback
}

function normalizeFingerprint(fingerprint?: AlipayDeviceFingerprint | null) {
  const source = fingerprint ?? cachedFingerprint ?? DEFAULT_FINGERPRINT

  return {
    model: readText(source.model) || DEFAULT_FINGERPRINT.model,
    ios: readText(source.ios) || DEFAULT_FINGERPRINT.ios,
    screen: readText(source.screen) || DEFAULT_FINGERPRINT.screen,
    width: readPositiveInteger(source.width, DEFAULT_FINGERPRINT.width),
    height: readPositiveInteger(source.height, DEFAULT_FINGERPRINT.height),
    build: readText(source.build) || DEFAULT_FINGERPRINT.build
  }
}

function encrypt3DES(content: string): Buffer {
  const cipher = crypto.createCipheriv('des-ede3', DES3_KEY, Buffer.alloc(0))

  return Buffer.concat([cipher.update(content, 'utf-8'), cipher.final()])
}

function decrypt3DES(content: Buffer): string {
  const decipher = crypto.createDecipheriv('des-ede3', DES3_KEY, Buffer.alloc(0))

  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf-8')
}

function rsaEncrypt(content: string): string {
  return crypto
    .publicEncrypt(
      {
        key: PUBLIC_KEY,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(content, 'utf-8')
    )
    .toString('base64')
}

function buildAlipayUserAgent(fingerprint?: AlipayDeviceFingerprint | null): string {
  const data = normalizeFingerprint(fingerprint)
  const ios = data.ios.replace(/\./g, '_')

  return `Mozilla/5.0 (iPhone; CPU iPhone OS ${ios} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${data.ios} Mobile/15E148 Safari/604.1`
}

function buildGatewayRequest(appPayParam: string): string {
  const requestBody = JSON.stringify({
    tid: 'qwertyuiopasdfghjklzxcvbnm',
    user_agent: ALIPAY_SDK_USER_AGENT,
    has_alipay: false,
    has_msp_app: false,
    external_info: appPayParam,
    app_key: '2021002145675770',
    utdid: 'z1x2c3v4v5v6v78v9',
    new_client_key: '8efcf8b134',
    action: {
      type: 'cashier',
      method: 'main'
    },
    gzip: true
  })
  const encryptedBody = encrypt3DES(requestBody).toString('hex')
  const encryptedKey = rsaEncrypt(DES3_KEY)
  const keyLength = encryptedKey.length.toString(16).padStart(8, '0').toUpperCase()
  const bodyLength = encryptedBody.length.toString(16).padStart(8, '0').toUpperCase()

  return keyLength + encryptedKey + bodyLength + encryptedBody
}

function httpPostRaw(url: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const isHttps = parsedUrl.protocol === 'https:'
    const client = isHttps ? https : http
    const request = client.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers,
        rejectUnauthorized: false
      },
      (response) => {
        const chunks: Buffer[] = []

        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const encoding = response.headers['content-encoding']
          let content = buffer

          if (encoding === 'gzip' || encoding === 'deflate') {
            try {
              content = encoding === 'gzip' ? zlib.gunzipSync(buffer) : zlib.inflateSync(buffer)
            } catch {
              content = buffer
            }
          }

          resolve(content.toString('utf-8'))
        })
      }
    )

    request.on('error', (error) => reject(error))
    request.setTimeout(30000, () => {
      request.destroy()
      reject(new Error('请求超时'))
    })
    request.write(body)
    request.end()
  })
}

async function convertAlipayToH5(appPayParam: string): Promise<string> {
  const requestBody = buildGatewayRequest(appPayParam)
  const payload = JSON.stringify({
    data: {
      device: 'GOOGLE-H002',
      namespace: 'com.alipay.mobilecashier',
      api_name: 'com.alipay.mcpay',
      api_version: '4.0.2',
      params: {
        req_data: requestBody
      }
    }
  })
  const responseText = await httpPostRaw(
    ALIPAY_GATEWAY_URL,
    {
      'Accept-Charset': 'UTF-8',
      Connection: 'Keep-Alive',
      'Content-Type': 'application/octet-stream;binary/octet-stream',
      Cookie: 'zone=RZ43A',
      Cookie2: '$Version=1',
      Host: 'mcgw.alipay.com',
      'Keep-Alive': 'timeout=180, max=100',
      'User-Agent': 'msp'
    },
    payload
  )
  const response = JSON.parse(responseText) as { data?: { params?: { res_data?: string } } }
  const responseData = response.data?.params?.res_data

  if (!responseData) {
    throw new Error('支付宝转换响应缺少 res_data')
  }

  const decodedText = decrypt3DES(Buffer.from(responseData, 'hex'))
  const decoded = JSON.parse(decodedText) as { form?: { onload?: { name?: string } } }
  const onloadName = decoded.form?.onload?.name || ''
  const match = onloadName.match(/https:\/\/[^\s']+/)

  if (!match) {
    throw new Error('支付宝转换未提取到支付链接')
  }

  return match[0]
}

function buildAutoPaymentScript(request: AlipayConvertRequest): string {
  const phone = request.autoPayment?.enabled ? readText(request.autoPayment.phone) : ''
  const password = request.autoPayment?.enabled ? readText(request.autoPayment.password) : ''

  if (!phone && !password) {
    return ''
  }

  return `
    (() => {
      const doneKey = '__wanda_alipay_auto_done'
      if (window[doneKey]) return

      const clickButton = (keywords) => {
        const buttons = document.querySelectorAll('button, [role="button"], a, div[class*="btn"], span[class*="btn"], input[type="submit"]')
        for (const button of buttons) {
          const text = (button.textContent || button.value || button.getAttribute('data-text') || '').trim()
          if (keywords.some((keyword) => text.includes(keyword))) {
            button.click()
            return true
          }
        }
        return false
      }
      const fillInput = (type, value) => {
        if (!value) return false
        const inputs = document.querySelectorAll('input')
        for (const input of inputs) {
          const name = [input.type, input.name, input.id, input.placeholder, input.getAttribute('aria-label')].join(' ')
          const matched = type === 'phone'
            ? /tel|phone|mobile|account|login|手机号|账号/i.test(name)
            : /password|pay|pwd|密码/i.test(name)
          if (matched && !input.value) {
            input.focus()
            input.value = value
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            return true
          }
        }
        return false
      }

      fillInput('phone', ${JSON.stringify(phone)})
      fillInput('password', ${JSON.stringify(password)})
      setTimeout(() => clickButton(['下一步', '登录', '确认付款', '立即付款', '支付', 'Next']), 800)
      setTimeout(() => {
        fillInput('password', ${JSON.stringify(password)})
        clickButton(['确认付款', '立即付款', '支付'])
      }, 2500)
      setTimeout(() => {
        fillInput('password', ${JSON.stringify(password)})
        clickButton(['确认付款', '立即付款', '支付'])
      }, 4500)
      window[doneKey] = true
    })()
  `
}

async function runAutoPaymentScript(window: BrowserWindow, request: AlipayConvertRequest): Promise<void> {
  const script = buildAutoPaymentScript(request)

  if (!script) {
    return
  }

  try {
    await window.webContents.executeJavaScript(script, true)
  } catch (error) {
    console.error('[支付宝自动填表] 执行注入脚本失败:', error)
  }
}

async function openAlipayWindow(url: string, request: AlipayConvertRequest): Promise<boolean> {
  const fingerprint = normalizeFingerprint(request.deviceFingerprint)
  const existingWindow = alipayPayWindow && !alipayPayWindow.isDestroyed() ? alipayPayWindow : null
  const reusedWindow = Boolean(existingWindow)
  const window =
    existingWindow ??
    new BrowserWindow({
      width: fingerprint.width,
      height: fingerprint.height,
      title: ALIPAY_WINDOW_TITLE,
      webPreferences: {
        session: session.fromPartition(ALIPAY_PARTITION),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

  alipayPayWindow = window
  window.setMenuBarVisibility(false)
  window.webContents.setUserAgent(buildAlipayUserAgent(fingerprint))
  window.setSize(fingerprint.width, fingerprint.height)
  window.show()
  window.focus()

  window.webContents.once('did-finish-load', () => {
    void runAutoPaymentScript(window, request)
  })
  window.webContents.on('did-navigate-in-page', () => {
    void runAutoPaymentScript(window, request)
  })

  await window.loadURL(url)

  return reusedWindow
}

function validateConvertRequest(request: AlipayConvertRequest): string | null {
  if (!isRecord(request)) {
    return '支付宝转换请求参数必须是对象'
  }

  if (!readText(request.appPayParam)) {
    return '缺少 appPayParam'
  }

  return null
}

async function convertAndOpenAlipay(request: AlipayConvertRequest): Promise<AlipayConvertResult> {
  const validationError = validateConvertRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  try {
    if (request.deviceFingerprint) {
      cachedFingerprint = request.deviceFingerprint
    }

    const url = await convertAlipayToH5(request.appPayParam.trim())
    const reusedWindow = await openAlipayWindow(url, request)

    return {
      ok: true,
      data: {
        url,
        reusedWindow
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '支付宝转换失败'
    }
  }
}

function syncAlipayDevice(fingerprint: AlipayDeviceFingerprint): AlipaySyncDeviceResult {
  cachedFingerprint = normalizeFingerprint(fingerprint)

  return {
    ok: true,
    data: true
  }
}

async function clearAlipaySession(): Promise<AlipayClearSessionResult> {
  try {
    await session.fromPartition(ALIPAY_PARTITION).clearStorageData({
      storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers']
    })
    cachedFingerprint = null

    if (alipayPayWindow && !alipayPayWindow.isDestroyed()) {
      alipayPayWindow.destroy()
    }

    alipayPayWindow = null

    return {
      ok: true,
      data: true
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '清理支付宝会话失败'
    }
  }
}

export function registerAlipayHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ALIPAY_CLEAR_SESSION, () => clearAlipaySession())
  ipcMain.handle(IPC_CHANNELS.ALIPAY_SYNC_DEVICE, (_event, fingerprint: AlipayDeviceFingerprint) =>
    syncAlipayDevice(fingerprint)
  )
  ipcMain.handle(IPC_CHANNELS.ALIPAY_CONVERT, (_event, request: AlipayConvertRequest) => convertAndOpenAlipay(request))
}
