import { prisma } from './db.js'

export interface AppConfigValues {
  deductPerPayment: number
  maxDevicesPerCard: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}

const DEFAULTS: AppConfigValues = {
  deductPerPayment: 1,
  maxDevicesPerCard: 1,
  heartbeatSec: 60,
  blockWhenExpired: true,
  blockWhenNoPoints: true
}

export async function loadConfig(): Promise<AppConfigValues> {
  const rows = await prisma.appConfig.findMany()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (k: keyof AppConfigValues) =>
    map.has(k) ? Number(map.get(k)) : (DEFAULTS[k] as number)
  const bool = (k: keyof AppConfigValues) =>
    map.has(k) ? map.get(k) === 'true' : (DEFAULTS[k] as boolean)
  return {
    deductPerPayment: num('deductPerPayment'),
    maxDevicesPerCard: num('maxDevicesPerCard'),
    heartbeatSec: num('heartbeatSec'),
    blockWhenExpired: bool('blockWhenExpired'),
    blockWhenNoPoints: bool('blockWhenNoPoints')
  }
}
