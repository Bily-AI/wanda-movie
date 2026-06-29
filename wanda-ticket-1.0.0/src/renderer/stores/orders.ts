import { defineStore } from 'pinia'

import { queryOrderByUserId, queryOrderList } from '@renderer/services/seatApi'
import type { OrderPayInfoResult, OrderRecord } from '@shared/wandaTicketTypes'
import { useAccountsStore } from './accounts'
import { useLogsStore } from './logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

export type OrderDateRange = [Date, Date] | []

interface OrderSummary {
  today: number
  pending: number
  completed: number
  totalAmount: number
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function parseOrderDate(value: string): Date | null {
  const text = value.trim()

  if (!text) {
    return null
  }

  const date = new Date(text)

  if (!Number.isNaN(date.getTime())) {
    return date
  }

  const fallbackDate = new Date(text.replace(/-/g, '/'))
  return Number.isNaN(fallbackDate.getTime()) ? null : fallbackDate
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function hasCompleteDateRange(dateRange: OrderDateRange): dateRange is [Date, Date] {
  return dateRange.length === 2
}

function csvCell(value: string | number): string {
  const rawText = String(value)
  const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const EMPTY_PAY_INFO_MESSAGE = '订单尚未出票或取票码暂不可用'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function firstListRecord(value: unknown): Record<string, unknown> {
  return asRecord(Array.isArray(value) ? value[0] : value)
}

function hasTextList(value: string[]): boolean {
  return Array.isArray(value) && value.some((item) => String(item ?? '').trim())
}

function hasVisibleValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasVisibleValue)
  }

  if (isRecord(value)) {
    return Object.values(value).some(hasVisibleValue)
  }

  if (typeof value === 'string') {
    return value.trim().length > 0
  }

  return value !== undefined && value !== null && value !== false
}

function getPayInfoValue(result: OrderPayInfoResult): unknown {
  const directPayInfo = (result as OrderPayInfoResult & { payInfo?: unknown }).payInfo

  if (hasVisibleValue(directPayInfo)) {
    return directPayInfo
  }

  const raw = asRecord(result.raw)
  const data = asRecord(raw.data)
  const directTicketInfo = firstListRecord(data.subTicketOrderInfo)
  const orderInf = firstListRecord(data.orderInf)
  const ticketInfo = firstListRecord(orderInf.subTicketOrderInfo)
  const source =
    Object.keys(ticketInfo).length > 0 ? ticketInfo : Object.keys(directTicketInfo).length > 0 ? directTicketInfo : data

  return source.payInfo ?? data.payInfo ?? raw.payInfo
}

function hasVisibleOrderPayInfo(result: OrderPayInfoResult): boolean {
  return hasTextList(result.ticketCodes) || hasTextList(result.qrCodes) || hasVisibleValue(getPayInfoValue(result))
}

export const useOrdersStore = defineStore('orders', {
  state: () => ({
    filters: {
      keyword: '',
      status: '',
      dateRange: [] as OrderDateRange
    },
    orders: [] as OrderRecord[],
    total: 0,
    pageIndex: 1,
    pageSize: 20,
    loading: false,
    detailLoading: false,
    ordersRequestSerial: 0,
    detailRequestSerial: 0,
    message: '',
    currentPayInfo: null as OrderPayInfoResult | null
  }),
  getters: {
    filteredOrders(state): OrderRecord[] {
      const keyword = String(state.filters.keyword ?? '').trim().toLowerCase()
      const status = String(state.filters.status ?? '').trim()
      const dateRange: OrderDateRange = Array.isArray(state.filters.dateRange) ? state.filters.dateRange : []
      const hasDateRange = hasCompleteDateRange(dateRange)
      const startTime = hasDateRange ? new Date(dateRange[0]).setHours(0, 0, 0, 0) : 0
      const endTime = hasDateRange ? new Date(dateRange[1]).setHours(23, 59, 59, 999) : 0

      return state.orders.filter((order) => {
        if (keyword) {
          const searchText = [order.phone, order.orderNo, order.movieName, order.cinema].join(' ').toLowerCase()

          if (!searchText.includes(keyword)) {
            return false
          }
        }

        if (status && order.status !== status && order.statusText !== status) {
          return false
        }

        if (hasDateRange) {
          const orderDate = parseOrderDate(order.createdAt)

          if (!orderDate) {
            return false
          }

          const orderTime = orderDate.getTime()

          if (orderTime < startTime || orderTime > endTime) {
            return false
          }
        }

        return true
      })
    },
    summary(): OrderSummary {
      const today = new Date()

      return this.filteredOrders.reduce<OrderSummary>(
        (summary, order) => {
          const createdAt = parseOrderDate(order.createdAt)

          if (createdAt && isSameDay(createdAt, today)) {
            summary.today += 1
          }

          if (order.status === 'pending') {
            summary.pending += 1
          }

          if (order.status === 'completed') {
            summary.completed += 1
          }

          summary.totalAmount += Number.isFinite(order.amount) ? order.amount : 0
          return summary
        },
        {
          today: 0,
          pending: 0,
          completed: 0,
          totalAmount: 0
        }
      )
    },
    totalAmountText(): string {
      return `￥${this.summary.totalAmount.toFixed(2)}`
    }
  },
  actions: {
    resetFilters() {
      this.filters.keyword = ''
      this.filters.status = ''
      this.filters.dateRange = []
    },
    async loadOrders() {
      const account = useAccountsStore().currentAccount
      const requestSerial = ++this.ordersRequestSerial
      this.currentPayInfo = null
      ++this.detailRequestSerial
      this.detailLoading = false

      if (!account?.phone || !account.ck) {
        this.orders = []
        this.total = 0
        this.loading = false
        this.message = '请选择已登录的万达账号'
        useLogsStore().addLog('历史订单', account?.phone ?? '', '历史订单查询失败：请选择已登录的万达账号')
        return
      }

      const accountId = account.id
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const pageIndex = this.pageIndex
      const pageSize = this.pageSize
      this.orders = []
      this.total = 0
      this.loading = true
      this.message = ''

      try {
        const result = await queryOrderList(pageIndex, pageSize, account.phone, account.ck, userIdentifier)

        if (
          requestSerial !== this.ordersRequestSerial ||
          useAccountsStore().currentAccount?.id !== accountId ||
          this.pageIndex !== pageIndex ||
          this.pageSize !== pageSize
        ) {
          return
        }

        this.orders = result.records
        this.total = result.total
        this.message = ''
        useLogsStore().addLog('历史订单', account.phone, `历史订单查询成功：${result.records.length}/${result.total}`)
      } catch (error) {
        if (
          requestSerial !== this.ordersRequestSerial ||
          useAccountsStore().currentAccount?.id !== accountId ||
          this.pageIndex !== pageIndex ||
          this.pageSize !== pageSize
        ) {
          return
        }

        const message = getErrorMessage(error, '历史订单查询失败')
        this.orders = []
        this.total = 0
        this.currentPayInfo = null
        this.message = message
        useLogsStore().addLog('历史订单', account.phone, `历史订单查询失败：${message}`)
      } finally {
        if (
          requestSerial === this.ordersRequestSerial &&
          useAccountsStore().currentAccount?.id === accountId &&
          this.pageIndex === pageIndex &&
          this.pageSize === pageSize
        ) {
          this.loading = false
        }
      }
    },
    async queryOrderPayInfo(order: OrderRecord) {
      const account = useAccountsStore().currentAccount
      this.currentPayInfo = null

      if (!account?.ck) {
        ++this.detailRequestSerial
        this.detailLoading = false
        this.message = '请选择已登录的万达账号'
        useLogsStore().addLog('历史订单', account?.phone ?? '', '订单详情查询失败：请选择已登录的万达账号')
        return
      }

      if (!order.orderId) {
        ++this.detailRequestSerial
        this.detailLoading = false
        this.message = '订单 ID 为空，无法查询详情'
        useLogsStore().addLog('历史订单', account.phone, '订单详情查询失败：订单 ID 为空')
        return
      }

      const accountId = account.id
      const orderId = order.orderId
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
      const detailSerial = ++this.detailRequestSerial
      this.detailLoading = true
      this.message = ''

      try {
        const result = await queryOrderByUserId(orderId, account.ck, userIdentifier)

        if (detailSerial !== this.detailRequestSerial || useAccountsStore().currentAccount?.id !== accountId) {
          return
        }

        this.currentPayInfo = result
        this.message = hasVisibleOrderPayInfo(result) ? '订单详情查询成功' : EMPTY_PAY_INFO_MESSAGE
        useLogsStore().addLog('历史订单', account.phone, `${this.message}：${order.orderNo || orderId}`)
      } catch (error) {
        if (detailSerial !== this.detailRequestSerial || useAccountsStore().currentAccount?.id !== accountId) {
          return
        }

        const message = getErrorMessage(error, '订单详情查询失败')
        this.currentPayInfo = null
        this.message = message
        useLogsStore().addLog('历史订单', account.phone, `订单详情查询失败：${message}`)
      } finally {
        if (detailSerial === this.detailRequestSerial) {
          this.detailLoading = false
        }
      }
    },
    exportCurrentOrders() {
      const headers = ['手机号', '订单号', '影片', '影院', '场次', '金额', '状态', '创建时间']
      const rows = this.filteredOrders.map((order) => [
        order.phone,
        order.orderNo,
        order.movieName,
        order.cinema,
        order.showtime,
        Number.isFinite(order.amount) ? order.amount.toFixed(2) : '0.00',
        order.statusText || order.status,
        order.createdAt
      ])
      const content = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

      return `\uFEFF${content}`
    }
  }
})
