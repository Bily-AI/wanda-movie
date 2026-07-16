import { defineStore } from 'pinia'
import { activate, heartbeat, type AuthConfig } from '@renderer/services/authApi'

const TOKEN_KEY = 'wanda_auth_token'
const DEFAULT_CONFIG: AuthConfig = { deductPerPayment: 1, heartbeatSec: 60, blockWhenExpired: true, blockWhenNoPoints: true }

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    loggedIn: false,
    remainingPoints: 0,
    expireAt: '' as string,
    config: { ...DEFAULT_CONFIG } as AuthConfig,
    loginError: '' as string
  }),
  getters: {
    canPay(state): boolean {
      if (!state.loggedIn) return false
      if (state.config.blockWhenExpired && state.expireAt && Date.now() >= new Date(state.expireAt).getTime()) return false
      if (state.config.blockWhenNoPoints && state.remainingPoints < state.config.deductPerPayment) return false
      return true
    }
  },
  actions: {
    async activateCard(code: string) {
      this.loginError = ''
      const fingerprint = await window.wandaApp!.getMachineFingerprint()
      const res = await activate(code.trim(), fingerprint)
      if (!res.ok) {
        this.loginError = mapCode(res.code)
        return false
      }
      this.applyLogin(res.token!, res.remainingPoints!, res.expireAt!, res.config!)
      localStorage.setItem(TOKEN_KEY, res.token!)
      this.startHeartbeat()
      return true
    },
    async bootstrap() {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return
      const res = await heartbeat(token)
      if (res.ok) {
        this.applyLogin(token, res.remainingPoints!, res.expireAt!, res.config!)
        this.startHeartbeat()
      } else {
        this.logout()
      }
    },
    applyLogin(token: string, points: number, expireAt: string, config: AuthConfig) {
      this.token = token; this.loggedIn = true
      this.remainingPoints = points; this.expireAt = expireAt; this.config = config
    },
    startHeartbeat() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      const ms = Math.max(15, this.config.heartbeatSec) * 1000
      heartbeatTimer = setInterval(async () => {
        if (!this.token) return
        const res = await heartbeat(this.token)
        if (res.ok) {
          this.remainingPoints = res.remainingPoints!; this.expireAt = res.expireAt!; this.config = res.config!
        } else if (res.code) {
          this.logout()
        }
      }, ms)
    },
    logout() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      this.token = ''; this.loggedIn = false; this.remainingPoints = 0; this.expireAt = ''
      localStorage.removeItem(TOKEN_KEY)
    }
  }
})

function mapCode(code?: string): string {
  switch (code) {
    case 'CARD_INVALID': return '卡密无效'
    case 'CARD_DISABLED': return '卡密已停用'
    case 'CARD_BOUND_OTHER': return '卡密已在其他设备激活'
    case 'DEVICE_DISABLED': return '设备已被禁用'
    default: return '激活失败,请检查网络'
  }
}
