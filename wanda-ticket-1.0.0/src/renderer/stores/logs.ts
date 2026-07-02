import { defineStore } from 'pinia'

import { DEFAULT_LOCAL_DATA, type LogRecord, type LogsLocalData } from '@shared/localData'

export type LogDateRange = [Date, Date] | []

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function toPlainLogsData(data: LogsLocalData): LogsLocalData {
  return structuredClone({
    records: data.records.map((record) => ({
      id: String(record.id || ''),
      time: String(record.time || ''),
      type: String(record.type || ''),
      account: String(record.account || ''),
      detail: String(record.detail || '')
    }))
  })
}

export const useLogsStore = defineStore('logs', {
  state: () => ({
    filters: {
      type: '',
      keyword: '',
      dateRange: [] as LogDateRange
    },
    records: [] as LogRecord[]
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
    async loadLogs() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        this.records = structuredClone(DEFAULT_LOCAL_DATA.logs.records)
        return
      }

      const result = await wandaApp.readLocalData('logs')

      if (!result?.ok) {
        this.records = structuredClone(DEFAULT_LOCAL_DATA.logs.records)
        return
      }

      this.records = toPlainLogsData(result.data).records
    },
    async saveLogs() {
      const wandaApp = getWandaApp()

      if (!wandaApp) {
        return
      }

      const result = await wandaApp.writeLocalData(
        'logs',
        toPlainLogsData({
          records: this.records
        })
      )

      if (!result?.ok) {
        throw new Error(result?.error || '日志保存失败')
      }
    },
    addLog(type: string, account: string, detail: string) {
      this.records.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        type,
        account: this.maskAccount(account),
        detail
      })
      void this.saveLogs()
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
      void this.saveLogs()
    }
  }
})
