import { app, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { IPC_CHANNELS, type LocalDataWriteResult } from '../shared/ipc'
import {
  cloneDefaultLocalData,
  isLocalDataFileName,
  type LocalDataFileName,
  type LocalDataMap
} from '../shared/localData'

let cachedDataDir: string | null = null

// 目录里是否已有账号数据(用来判断"真正存数据的那个目录")
function hasAccountData(dir: string): boolean {
  try {
    return existsSync(join(dir, 'accounts.json'))
  } catch {
    return false
  }
}

// 稳定指针文件:记录上次真正存数据的目录路径(放 userData,不随便携目录/环境变量变动)
function dataDirPointerPath(): string {
  return join(app.getPath('userData'), 'data-dir.txt')
}

export function localDataDir(): string {
  if (cachedDataDir) {
    return cachedDataDir
  }

  // 便携版:数据放 exe 同目录 data/,跟着 exe 走;非便携:userData/local-data。
  // 关键:热更新重启后 PORTABLE_EXECUTABLE_DIR 可能失效,导致读到空目录 → 误判"账号全没了"。
  // 所以按候选顺序找"已有账号数据"的目录,即使环境变量丢了也能找回原数据。
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE
  const userLocal = join(app.getPath('userData'), 'local-data')
  const primary = portableDir ? join(portableDir, 'data') : userLocal

  const candidates: string[] = []
  if (portableDir) candidates.push(join(portableDir, 'data'))
  if (portableFile) candidates.push(join(dirname(portableFile), 'data'))
  candidates.push(userLocal)
  try {
    const saved = readFileSync(dataDirPointerPath(), 'utf-8').trim()
    if (saved) candidates.push(saved)
  } catch {
    /* 无指针则忽略 */
  }

  const chosen = candidates.find((dir) => hasAccountData(dir)) ?? primary
  cachedDataDir = chosen

  // 记录选定目录,便于日后即使环境变量丢失也能找回
  try {
    writeFileSync(dataDirPointerPath(), chosen, 'utf-8')
  } catch {
    /* 忽略写入失败 */
  }

  return chosen
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

    // 文件缺失(首次运行/空目录):返回默认,但不写入(避免在错误目录里造空文件)
    if (isMissingFileError(error)) {
      return defaults
    }

    // 文件损坏(JSON 解析失败):备份坏文件后重建默认,原数据留在 .bak 可恢复
    if (error instanceof SyntaxError) {
      await backupBrokenFile(name)
      await writeLocalDataFile(name, defaults)
      return defaults
    }

    // 其它错误(文件被占用/IO 抖动等):绝不覆盖!仅本次返回默认,原文件原样保留,下次重启即可恢复
    // —— 这是之前"更新后账号全没了"的元凶:读失败就把空默认写回,把真数据覆盖掉。
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
