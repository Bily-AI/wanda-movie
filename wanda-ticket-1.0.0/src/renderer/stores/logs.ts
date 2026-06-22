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
    },
    filteredRecords(state) {
      const type = state.filters.type.trim()
      const keyword = state.filters.keyword.trim().toLowerCase()
      const dateRange = Array.isArray(state.filters.dateRange) ? state.filters.dateRange : []
      const hasDateRange = dateRange.length === 2
      const startTime = hasDateRange ? new Date(dateRange[0]).setHours(0, 0, 0, 0) : 0
      const endTime = hasDateRange ? new Date(dateRange[1]).setHours(23, 59, 59, 999) : 0

      return state.records.filter((record) => {
        if (type && record.type !== type) {
          return false
        }

        if (keyword) {
          const text = [record.type, record.account, record.detail].join(' ').toLowerCase()

          if (!text.includes(keyword)) {
            return false
          }
        }

        if (hasDateRange) {
          const recordTime = new Date(record.time.replace(/-/g, '/')).getTime()

          if (!Number.isFinite(recordTime) || recordTime < startTime || recordTime > endTime) {
            return false
          }
        }

        return true
      })
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
    },
    clearRecords() {
      this.records = []
    }
  }
})
