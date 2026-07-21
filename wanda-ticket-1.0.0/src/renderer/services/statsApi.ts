import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 10000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })

// 上报储值卡快照(名下所有账号合计):总数 + 禁用数
export async function reportStoredCards(token: string, total: number, disabled: number): Promise<void> {
  if (!token) return
  try {
    await http.post('/stats/stored-cards', { total, disabled }, auth(token))
  } catch {
    /* 上报失败静默,不影响主流程 */
  }
}

// 上报「付款成功购买储值卡」事件(轮询检测到新增才调用)
export async function reportStoredCardPurchase(token: string, count = 1): Promise<void> {
  if (!token) return
  try {
    await http.post('/stats/stored-card-purchase', { count }, auth(token))
  } catch {
    /* 上报失败静默 */
  }
}
