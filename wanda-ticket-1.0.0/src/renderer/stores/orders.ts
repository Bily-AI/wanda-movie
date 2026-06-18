import { defineStore } from 'pinia'

export type OrderDateRange = [Date, Date] | []

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    filters: {
      keyword: '',
      status: '',
      dateRange: [] as OrderDateRange
    },
    summary: {
      today: 0,
      pending: 0,
      completed: 0,
      totalAmount: 0
    }
  }),
  getters: {
    totalAmountText(state) {
      return `¥${state.summary.totalAmount.toFixed(2)}`
    }
  },
  actions: {
    resetFilters() {
      this.filters.keyword = ''
      this.filters.status = ''
      this.filters.dateRange = []
    }
  }
})
