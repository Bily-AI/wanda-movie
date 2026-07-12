import { app, BrowserWindow, clipboard, dialog, ipcMain, type IpcMainInvokeEvent, type NativeImage, type Rectangle } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  IPC_CHANNELS,
  type ElementCaptureRequest,
  type ElementCaptureResult,
  type ElementCopyResult,
  type IpcResult
} from '../shared/ipc'

interface ElementRect {
  x: number
  y: number
  width: number
  height: number
}

interface CapturedElementImage {
  image: NativeImage
  png: Buffer
}

function validateElementCaptureRequest(request: ElementCaptureRequest): string | null {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return '截图请求参数必须是对象'
  }

  if (typeof request.selector !== 'string' || !request.selector.trim()) {
    return '缺少截图元素选择器'
  }

  return null
}

function toCaptureRect(rect: ElementRect): Rectangle {
  return {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.max(1, Math.ceil(rect.width)),
    height: Math.max(1, Math.ceil(rect.height))
  }
}

function getWindowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

function imageFileName(): string {
  return `取票码-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
}

async function saveCapturedImage(png: Buffer, window: BrowserWindow | null): Promise<string | null> {
  const dir = join(app.getPath('pictures'), '万达快速出票')

  await mkdir(dir, { recursive: true })

  const result = window
    ? await dialog.showSaveDialog(window, {
        title: '保存取票码截图',
        defaultPath: join(dir, imageFileName()),
        filters: [{ name: 'PNG 图片', extensions: ['png'] }]
      })
    : { canceled: false, filePath: join(dir, imageFileName()) }

  if (result.canceled || !result.filePath) {
    return null
  }

  await writeFile(result.filePath, png)

  return result.filePath
}

async function queryElementRect(event: IpcMainInvokeEvent, selector: string): Promise<ElementRect | null> {
  const safeSelector = JSON.stringify(selector)

  return event.sender.executeJavaScript(
    `
      (() => {
        const element = document.querySelector(${safeSelector})

        if (!element) {
          return null
        }

        const rect = element.getBoundingClientRect()

        if (rect.width <= 0 || rect.height <= 0) {
          return null
        }

        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      })()
    `,
    true
  ) as Promise<ElementRect | null>
}

async function captureElementImage(
  event: IpcMainInvokeEvent,
  request: ElementCaptureRequest
): Promise<IpcResult<CapturedElementImage>> {
  const validationError = validateElementCaptureRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  const window = getWindowFromEvent(event)

  if (!window) {
    return {
      ok: false,
      error: '未找到当前窗口'
    }
  }

  try {
    const rect = await queryElementRect(event, request.selector.trim())

    if (!rect) {
      return {
        ok: false,
        error: '未找到可截图的元素'
      }
    }

    const image = await window.webContents.capturePage(toCaptureRect(rect))
    const png = image.toPNG()

    return {
      ok: true,
      data: {
        image,
        png
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '截图失败'
    }
  }
}

export async function captureElement(
  event: IpcMainInvokeEvent,
  request: ElementCaptureRequest
): Promise<ElementCaptureResult> {
  const validationError = validateElementCaptureRequest(request)

  if (validationError) {
    return {
      ok: false,
      error: validationError
    }
  }

  const window = getWindowFromEvent(event)

  if (!window) {
    return {
      ok: false,
      error: '未找到当前窗口'
    }
  }

  try {
    const rect = await queryElementRect(event, request.selector.trim())

    if (!rect) {
      return {
        ok: false,
        error: '未找到可截图的元素'
      }
    }

    const image = await window.webContents.capturePage(toCaptureRect(rect))
    const png = image.toPNG()
    const filePath = await saveCapturedImage(png, window)

    if (!filePath) {
      return {
        ok: false,
        error: '已取消保存'
      }
    }

    return {
      ok: true,
      data: {
        base64: image.toDataURL(),
        path: filePath,
        size: png.length,
        width: image.getSize().width,
        height: image.getSize().height
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '截图失败'
    }
  }
}

export async function copyElementToClipboard(
  event: IpcMainInvokeEvent,
  request: ElementCaptureRequest
): Promise<ElementCopyResult> {
  const result = await captureElementImage(event, request)

  if (!result.ok) {
    return result
  }

  try {
    if (result.data.image.isEmpty()) {
      return {
        ok: false,
        error: '截图内容为空，无法复制'
      }
    }

    clipboard.writeImage(result.data.image)

    return {
      ok: true,
      data: true
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : '复制截图失败'
    }
  }
}

export function registerElementCaptureHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ELEMENT_CAPTURE, (event, request: ElementCaptureRequest) => captureElement(event, request))

  ipcMain.handle(IPC_CHANNELS.ELEMENT_COPY_TO_CLIPBOARD, (event, request: ElementCaptureRequest) =>
    copyElementToClipboard(event, request)
  )
}
