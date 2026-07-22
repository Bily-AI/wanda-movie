import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface AuthConfig {
  deductPerPayment: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}
export interface SessionResult {
  ok: boolean; token?: string; remainingPoints?: number; expireAt?: string | null
  subscriptionUntil?: string | null; plan?: string | null; config?: AuthConfig; code?: string
}
export interface HeartbeatResult {
  ok: boolean; remainingPoints?: number; expireAt?: string | null
  subscriptionUntil?: string | null; plan?: string | null; config?: AuthConfig; code?: string
}
export interface RedeemResult {
  ok: boolean; remainingPoints?: number; expireAt?: string | null
  subscriptionUntil?: string | null; plan?: string | null; code?: string
}
export interface DeductResult { ok: boolean; remainingPoints?: number; free?: boolean; code?: string }

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 10000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })

export async function register(username: string, password: string, fingerprint: string, cardCode: string): Promise<SessionResult> {
  const { data } = await http.post('/auth/register', { username, password, fingerprint, cardCode }, { validateStatus: () => true })
  return data as SessionResult
}
export async function login(username: string, password: string, fingerprint: string): Promise<SessionResult> {
  const { data } = await http.post('/auth/login', { username, password, fingerprint }, { validateStatus: () => true })
  return data as SessionResult
}
export async function redeemCard(token: string, cardCode: string): Promise<RedeemResult> {
  const { data } = await http.post('/cards/redeem', { cardCode }, auth(token))
  return data as RedeemResult
}
export async function heartbeat(token: string): Promise<HeartbeatResult> {
  const { data } = await http.post('/auth/heartbeat', {}, auth(token))
  return data as HeartbeatResult
}
export async function deductPoint(token: string, orderId: string): Promise<DeductResult> {
  const { data } = await http.post('/points/deduct', { orderId }, auth(token))
  return data as DeductResult
}

export interface RemoteAiConfig {
  baiduApiKey: string
  baiduSecretKey: string
  deepseekApiKey: string
  deepseekBaseUrl: string
  deepseekModel: string
  deepseekEnabled: boolean
}
// 从后台拉取百度OCR/DeepSeek配置(登录用户),客户端本地使用
export async function fetchAiConfig(token: string): Promise<RemoteAiConfig | null> {
  const { data } = await http.get('/config/ai', auth(token))
  return (data as { ok?: boolean; config?: RemoteAiConfig })?.ok ? (data as { config: RemoteAiConfig }).config : null
}
