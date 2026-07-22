import { app, ipcMain } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IPC_CHANNELS, type LocalDataWriteResult } from '../shared/ipc'
import {
  cloneDefaultLocalData,
  isLocalDataFileName,
  type LocalDataFileName,
  type LocalDataMap
} from '../shared/localData'

function localDataDir(): string {
  // 便携版:本地数据(账号/设置/日志)放到 exe 同目录的 data/,数据跟着 exe 走。
  // 只放我们自己的数据,不动 Chromium 的缓存(那些仍在系统默认 userData,避免 data/ 里一堆缓存垃圾)。
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) {
    return join(portableDir, 'data')
  }
  return join(app.getPath('userData'), 'local-data')
}

function localDataPath(name: LocalDataFileName): string {
  return join(localDataDir(), `${name}.json`)
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeWithDefault<T>(defaults: T, value: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(value) ? value : defaults) as T
  }

  if (!isPlainObject(defaults)) {
    return (value ?? defaults) as T
  }

  if (!isPlainObject(value)) {
    return defaults
  }

  const merged: Record<string, unknown> = { ...defaults }

  for (const [key, defaultValue] of Object.entries(defaults)) {
    merged[key] = mergeWithDefault(defaultValue, value[key])
  }

  return merged as T
}

async function ensureLocalDataDir(): Promise<void> {
  await mkdir(localDataDir(), { recursive: true })
}

async function backupBrokenFile(name: LocalDataFileName): Promise<void> {
  const source = localDataPath(name)
  const target = join(localDataDir(), `${name}.json.bak.${Date.now()}`)

  try {
    await rename(source, target)
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error
    }
  }
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function normalizeSeedCityData(city: unknown[]): LocalDataMap['city'] {
  const cities: unknown[] = []
  const cinemas: unknown[] = []

  for (const item of city) {
    if (!isPlainObject(item)) {
      continue
    }

    const id = toText(item.CityID)
    const name = toText(item.CityName)

    if (!id || !name) {
      continue
    }

    cities.push({ id, name, cityId: id, cityName: name, raw: item })

    const cmList = Array.isArray(item.CmList) ? item.CmList : []

    for (const cinema of cmList) {
      if (!isPlainObject(cinema)) {
        continue
      }

      const cinemaId = toText(cinema.CmID)
      const cinemaName = toText(cinema.MyCmName) || toText(cinema.CmName)

      if (!cinemaId || !cinemaName) {
        continue
      }

      cinemas.push({
        id: cinemaId,
        cinemaId,
        cityId: id,
        name: cinemaName,
        cinemaName,
        address: toText(cinema.CmAdd),
        raw: cinema
      })
    }
  }

  return {
    cities,
    cinemas,
    city,
    updatedAt: new Date().toISOString()
  }
}

function isEmptyCityData(data: LocalDataMap['city']): boolean {
  return data.cities.length === 0 && data.cinemas.length === 0 && data.city.length === 0
}

async function readSeedCityData(): Promise<LocalDataMap['city'] | null> {
  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : ''
  const candidatePaths = [
    // 打包版:electron-builder extraResources 放到 resources/config/city.json
    resourcesPath ? join(resourcesPath, 'config', 'city.json') : '',
    join(app.getAppPath(), 'config', 'city.json'),
    join(app.getAppPath(), '..', 'config', 'city.json'),
    resourcesPath ? join(resourcesPath, 'app', 'config', 'city.json') : '',
    resourcesPath ? join(resourcesPath, '..', 'config', 'city.json') : '',
    join(process.cwd(), '..', 'win-ia32-unpacked', 'config', 'city.json'),
    join(process.cwd(), '..', 'win-ia32-unpacked', 'resources', 'app', 'config', 'city.json'),
    join(app.getAppPath(), '..', 'win-ia32-unpacked', 'config', 'city.json'),
    join(app.getAppPath(), '..', 'win-ia32-unpacked', 'resources', 'app', 'config', 'city.json')
  ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)

  for (const cityPath of candidatePaths) {
    try {
      const content = await readFile(cityPath, 'utf-8')
      const parsed = JSON.parse(content) as { city?: unknown[] }
      const city = Array.isArray(parsed.city) ? parsed.city : []

      return normalizeSeedCityData(city)
    } catch (error) {
      if (isMissingFileError(error)) {
        continue
      }

      continue
    }
  }

  return null
}

async function defaultLocalData<T extends LocalDataFileName>(name: T): Promise<LocalDataMap[T]> {
  if (name === 'city') {
    const seeded = await readSeedCityData()

    if (seeded) {
      return seeded as LocalDataMap[T]
    }
  }

  return cloneDefaultLocalData(name)
}

export async function writeLocalDataFile<T extends LocalDataFileName>(
  name: T,
  data: LocalDataMap[T]
): Promise<void> {
  await ensureLocalDataDir()
  await writeFile(localDataPath(name), `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

export async function readLocalDataFile<T extends LocalDataFileName>(name: T): Promise<LocalDataMap[T]> {
  await ensureLocalDataDir()

  try {
    const content = await readFile(localDataPath(name), 'utf-8')
    const parsed = JSON.parse(content) as unknown
    const merged = mergeWithDefault(cloneDefaultLocalData(name), parsed)

    if (name === 'city' && isEmptyCityData(merged as LocalDataMap['city'])) {
      const seeded = await readSeedCityData()

      if (seeded) {
        await writeLocalDataFile(name, seeded as LocalDataMap[T])
        return seeded as LocalDataMap[T]
      }
    }

    return merged
  } catch (error) {
    const defaults = await defaultLocalData(name)

    if (!isMissingFileError(error)) {
      await backupBrokenFile(name)
    }

    await writeLocalDataFile(name, defaults)
    return defaults
  }
}

export function registerLocalDataHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.LOCAL_DATA_READ, async (_event, name: unknown) => {
    if (!isLocalDataFileName(name)) {
      return {
        ok: false,
        error: '未知本地数据文件'
      }
    }

    try {
      return {
        ok: true,
        data: await readLocalDataFile(name)
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '读取本地数据失败'
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.LOCAL_DATA_WRITE,
    async (_event, name: unknown, data: unknown): Promise<LocalDataWriteResult> => {
      if (!isLocalDataFileName(name)) {
        return {
          ok: false,
          error: '未知本地数据文件'
        }
      }

      try {
        await writeLocalDataFile(name, mergeWithDefault(cloneDefaultLocalData(name), data))
        return {
          ok: true,
          data: true
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : '写入本地数据失败'
        }
      }
    }
  )
}
