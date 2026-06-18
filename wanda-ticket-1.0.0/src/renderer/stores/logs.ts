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
    clearFilters() {
      this.filters.type = ''
      this.filters.keyword = ''
      this.filters.dateRange = []
    }
  }
})
