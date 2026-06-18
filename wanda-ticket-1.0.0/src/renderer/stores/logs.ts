import { defineStore } from 'pinia'

export type LogDateRange = [Date, Date] | []

export const useLogsStore = defineStore('logs', {
  state: () => ({
    filters: {
      type: '',
      keyword: '',
      dateRange: [] as LogDateRange
    },
    records: [] as Array<{
      id: string
      time: string
      type: string
      account: string
      detail: string
    }>
  }),
  getters: {
    recordCount(state) {
      return state.records.length
    }
  },
  actions: {
    addLog(type: string, account: string, detail: string) {
      this.records.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        type,
        account: this.maskAccount(account),
        detail
      })
    },
    maskAccount(account: string) {
      if (account.length < 7) {
        return account
      }

      return `${account.slice(0, 3)}****${account.slice(-4)}`
    },
    clearFilters() {
      this.filters.type = ''
      this.filters.keyword = ''
      this.filters.dateRange = []
    }
  }
})
