import { defineStore } from 'pinia'
import { register, login, redeemCard, heartbeat, type AuthConfig } from '@renderer/services/authApi'

const TOKEN_KEY = 'wanda_auth_token'
const DEFAULT_CONFIG: AuthConfig = { deductPerPayment: 1, heartbeatSec: 60, blockWhenExpired: true, blockWhenNoPoints: true }
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    loggedIn: false,
    remainingPoints: 0,
    expireAt: null as string | null,
    config: { ...DEFAULT_CONFIG } as AuthConfig,
    authError: '' as string
  }),
  getters: {
    canPay(state): boolean {
      if (!state.loggedIn) return false
      if (state.config.blockWhenExpired && (!state.expireAt || Date.now() >= new Date(state.expireAt).getTime())) return false
      if (state.config.blockWhenNoPoints && state.remainingPoints < state.config.deductPerPayment) return false
      return true
    }
  },
  actions: {
    async register(username: string, password: string) {
      this.authError = ''
      const fp = await window.wandaApp!.getMachineFingerprint()
      const res = await register(username.trim(), password, fp)
      return this.handleSession(res)
    },
    async login(username: string, password: string) {
      this.authError = ''
      const fp = await window.wandaApp!.getMachineFingerprint()
      const res = await login(username.trim(), password, fp)
      return this.handleSession(res)
    },
    handleSession(res: { ok: boolean; token?: string; remainingPoints?: number; expireAt?: string | null; config?: AuthConfig; code?: string }) {
      if (!res.ok) { this.authError = mapCode(res.code); return false }
      this.applyLogin(res.token!, res.remainingPoints ?? 0, res.expireAt ?? null, res.config!)
      localStorage.setItem(TOKEN_KEY, res.token!)
      this.startHeartbeat()
      return true
    },
    async redeem(cardCode: string) {
      this.authError = ''
      const res = await redeemCard(this.token, cardCode.trim())
      if (!res.ok) { this.authError = mapCode(res.code); return false }
      this.remainingPoints = res.remainingPoints ?? this.remainingPoints
      this.expireAt = res.expireAt ?? this.expireAt
      return true
    },
    async bootstrap() {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return
      try {
        const res = await heartbeat(token)
        if (res.ok) {
          this.applyLogin(token, res.remainingPoints ?? 0, res.expireAt ?? null, res.config!)
          this.startHeartbeat()
        } else { this.logout() }
      } catch { /* 离线冷启动:保留 token,等联网 */ }
    },
    applyLogin(token: string, points: number, expireAt: string | null, config: AuthConfig) {
      this.token = token; this.loggedIn = true
      this.remainingPoints = points; this.expireAt = expireAt; this.config = config
    },
    startHeartbeat() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      const ms = Math.max(15, this.config.heartbeatSec) * 1000
      heartbeatTimer = setInterval(async () => {
        if (!this.token) return
        try {
          const res = await heartbeat(this.token)
          if (res.ok) {
            this.remainingPoints = res.remainingPoints ?? 0; this.expireAt = res.expireAt ?? null; this.config = res.config!
          } else if (res.code) { this.logout() }
        } catch { /* 网络抖动忽略 */ }
      }, ms)
    },
    logout() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      this.token = ''; this.loggedIn = false; this.remainingPoints = 0; this.expireAt = null
      localStorage.removeItem(TOKEN_KEY)
    }
  }
})

function mapCode(code?: string): string {
  switch (code) {
    case 'USERNAME_TAKEN': return '用户名已被占用'
    case 'BAD_LOGIN': return '用户名或密码错误'
    case 'MACHINE_BOUND_OTHER': return '该账号已绑定其他设备'
    case 'USER_DISABLED': return '账号已被禁用'
    case 'CARD_INVALID': return '充值卡无效'
    case 'CARD_USED': return '该卡已被使用'
    case 'CARD_DISABLED': return '该卡已停用'
    default: return '操作失败,请检查网络'
  }
}
