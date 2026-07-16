import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface AuthConfig {
  deductPerPayment: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}
export interface ActivateResult {
  ok: boolean; token?: string; remainingPoints?: number; expireAt?: string; config?: AuthConfig; code?: string
}
export interface HeartbeatResult {
  ok: boolean; remainingPoints?: number; expireAt?: string; config?: AuthConfig; code?: string
}
export interface DeductResult { ok: boolean; remainingPoints?: number; code?: string }

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 10000 })

export async function activate(cardCode: string, fingerprint: string): Promise<ActivateResult> {
  const { data } = await http.post('/auth/activate', { cardCode, fingerprint })
  return data as ActivateResult
}
export async function heartbeat(token: string): Promise<HeartbeatResult> {
  const { data } = await http.post('/auth/heartbeat', {}, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })
  return data as HeartbeatResult
}
export async function deductPoint(token: string, orderId: string): Promise<DeductResult> {
  const { data } = await http.post('/points/deduct', { orderId }, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })
  return data as DeductResult
}
