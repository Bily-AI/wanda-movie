<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Download, Refresh, Search, Tickets } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { fetchCinemaDetail } from '@renderer/services/cinemaApi'
import { cancelTicketOrder, refundTicketOrder } from '@renderer/services/seatApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'
import { useOrdersStore } from '@renderer/stores/orders'
import type { OrderPayInfoResult, OrderRecord } from '@shared/wandaTicketTypes'

const DEFAULT_TEMPLATE = 'default'
const WANDA_TEMPLATE = 'wanda'
const DEFAULT_USER_IDENTIFIER = 'YYDDJDKYHA'
const historyTicketCodePanelSelector = '.ticket-dialog'

interface TicketDetail {
  orderId: string
  showOrderStatus: string
  movieName: string
  movieLanguage: string
  movieVersion: string
  showTimeStr: string
  showEndTimeStr: string
  cinemaName: string
  cinemaAddress: string
  hallName: string
  seats: string
  totalPrice: number
  mobile: string
  electronicCodes: string[]
  electronicQRs: string[]
  ticketTip: string
  moviePoster: string
  createdAtLabel: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function firstListRecord(value: unknown): Record<string, unknown> {
  return asRecord(Array.isArray(value) ? value[0] : value)
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }

  return ''
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatMoney(amount: number): string {
  return `¥${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`
}

function formatMovieTime(value: unknown): string {
  if (!value) {
    return ''
  }

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatShowtimeRange(value: unknown, withSeconds = false): string {
  if (!value) {
    return ''
  }

  let cleanValue = String(value).trim()
  const numMatch = cleanValue.match(/^\d+/)
  let date: Date

  if (numMatch) {
    date = new Date(Number(numMatch[0]))
  } else {
    date = new Date(cleanValue)
  }

  if (Number.isNaN(date.getTime())) {
    return cleanValue
  }

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (withSeconds) {
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  return `${month}月${day}日（周${weekDays[date.getDay()]}） ${hours}:${minutes}`
}

function formatDateTime(value: unknown): string {
  if (!value) {
    return '-'
  }

  let cleanValue = String(value).trim()
  const numMatch = cleanValue.match(/^\d+/)
  let date: Date

  if (numMatch) {
    date = new Date(Number(numMatch[0]))
  } else {
    date = new Date(cleanValue)
  }

  if (Number.isNaN(date.getTime())) {
    return cleanValue
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function maskedMobile(value: string): string {
  if (value.length >= 7) {
    return `${value.slice(0, 3)}****${value.slice(-4)}`
  }

  return value
}

function last4(value: string): string {
  return value.length >= 4 ? value.slice(-4) : value
}

function normalizeTextList(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : []
}

function isImageQrCode(value: string): boolean {
  const text = value.trim()

  if (/^data:image\//.test(text)) {
    return true
  }

  return /^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/.test(text)
}

function formatQrImage(value: string): string {
  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`
}

function getPayInfoRawSource(payInfo: OrderPayInfoResult | null): Record<string, unknown> {
  if (!payInfo) {
    return {}
  }

  const raw = asRecord(payInfo.raw)
  const data = asRecord(raw.data)
  const orderInf = firstListRecord(data.orderInf)
  const subTicket = firstListRecord(orderInf.subTicketOrderInfo)

  return Object.keys(subTicket).length > 0 ? subTicket : data
}

function buildTicketDetail(order: OrderRecord, payInfo: OrderPayInfoResult, phone: string): TicketDetail | null {
  const raw = asRecord(payInfo.raw)
  const data = asRecord(raw.data)
  const orderInfo = firstListRecord(data.orderInf)
  const subTicket = firstListRecord(orderInfo.subTicketOrderInfo)
  const cinemaInfo = asRecord(subTicket.subOrderBasicInfo ?? subTicket.orderInf ?? subTicket)
  const movie = firstListRecord(asRecord(cinemaInfo.movies).movie)
  const seatInfoList = asList(subTicket.seatInfo)
  const qrCodes = payInfo.qrCodes.length > 0 ? payInfo.qrCodes : [firstText(subTicket.electronicQR)].filter(Boolean)
  const ticketCodes = payInfo.ticketCodes.length > 0 ? payInfo.ticketCodes : asList(subTicket.electronicCode).map((item) => firstText(item)).filter(Boolean)
  const seatText = seatInfoList
    .map((seat) => firstText(asRecord(seat).seatName))
    .filter(Boolean)
    .join('、')

  if (qrCodes.length === 0 && ticketCodes.length === 0) {
    return null
  }

  return {
    orderId: firstText(orderInfo.orderId, order.orderId),
    showOrderStatus: firstText(orderInfo.showOrderStatusStr, order.statusText, '出票成功'),
    movieName: firstText(movie.name, order.movieName),
    movieLanguage: firstText(movie.language),
    movieVersion: firstText(movie.version),
    showTimeStr: movie.showTime ? formatShowtimeRange(movie.showTime) : order.showtime,
    showEndTimeStr: cinemaInfo.showEndTime ? formatShowtimeRange(cinemaInfo.showEndTime, true) : '',
    cinemaName: firstText(cinemaInfo.cinemaName, cinemaInfo.cinameName, order.cinema),
    cinemaAddress: firstText(cinemaInfo.address),
    hallName: firstText(cinemaInfo.hallName),
    seats: seatText,
    totalPrice: (toNumber(orderInfo.realPay ?? orderInfo.salesAmount, Math.round(order.amount * 100)) || 0) / 100,
    mobile: phone,
    electronicCodes: ticketCodes,
    electronicQRs: qrCodes,
    ticketTip: '请持取票码至自助机取票',
    moviePoster: firstText(movie.coverUrl, movie.moviePoster),
    createdAtLabel: order.createdAt ? formatDateTime(order.createdAt) : '-',
  }
}

function groupTicketCode(code: string): string {
  return String(code || '').replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const ordersStore = useOrdersStore()

const ticketDialogVisible = ref(false)
const ticketTemplate = ref<string>(DEFAULT_TEMPLATE)
const ticketDetail = ref<TicketDetail | null>(null)
const dialogPosition = ref({ x: 0, y: 24 })
const payInfoDialogVisible = ticketDialogVisible

let dragging = false
let dragState = { x: 0, y: 0, left: 0, top: 0 }

const currentAccount = computed(() => accountsStore.currentAccount)
const ticketMaskedMobile = computed(() => maskedMobile(ticketDetail.value?.mobile || ''))
const ticketMobileLast4 = computed(() => last4(ticketDetail.value?.mobile || ''))
const ticketCodes = computed(() => normalizeTextList(ordersStore.currentPayInfo?.ticketCodes))
const qrCodes = computed(() => normalizeTextList(ordersStore.currentPayInfo?.qrCodes))
const canCaptureHistoryTicketCode = computed(() => ticketDialogVisible.value && (ticketCodes.value.length > 0 || qrCodes.value.length > 0))

function loadTicketTemplate() {
  const saved = localStorage.getItem('setting_ticket_template')
  ticketTemplate.value = saved === WANDA_TEMPLATE ? WANDA_TEMPLATE : DEFAULT_TEMPLATE
}

function resetDialogPosition() {
  const width = 440
  dialogPosition.value = {
    x: Math.max(0, (window.innerWidth - width) / 2),
    y: 24
  }
}

function handleDragStart(event: MouseEvent) {
  dragging = true
  dragState = {
    x: event.clientX,
    y: event.clientY,
    left: dialogPosition.value.x,
    top: dialogPosition.value.y
  }
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
}

function handleDragMove(event: MouseEvent) {
  if (!dragging) {
    return
  }

  dialogPosition.value = {
    x: dragState.left + (event.clientX - dragState.x),
    y: dragState.top + (event.clientY - dragState.y)
  }
}

function handleDragEnd() {
  dragging = false
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
}

function closeTicketDialog() {
  ticketDialogVisible.value = false
  ticketDetail.value = null
}

function handleSearch() {
  ordersStore.pageIndex = 1
  closeTicketDialog()
  void ordersStore.loadOrders()
}

function handleRefresh() {
  closeTicketDialog()
  void ordersStore.loadOrders()
  ElMessage.success('刷新完成')
}

function handleExport() {
  if (ordersStore.loading) {
    return
  }

  if (ordersStore.filteredOrders.length === 0) {
    ElMessage.warning('暂无可导出的订单')
    return
  }

  const csv = ordersStore.exportCurrentOrders()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `历史订单-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

function getOrderStatusTagType(row: OrderRecord): 'success' | 'warning' | 'info' | 'danger' {
  if (row.status === 'completed') {
    return 'success'
  }

  if (row.status === 'pending') {
    return 'warning'
  }

  if (row.status === 'refunded') {
    return 'danger'
  }

  return 'info'
}

async function fillCinemaAddress(detail: TicketDetail, payInfo: OrderPayInfoResult) {
  if (detail.cinemaAddress) {
    return
  }

  const account = currentAccount.value

  if (!account?.ck) {
    return
  }

  const source = getPayInfoRawSource(payInfo)
  const cinemaInfo = asRecord(source.orderInf)
  const cinemaId = firstText(source.cinemaId, cinemaInfo.cinemaId)

  if (!cinemaId) {
    return
  }

  try {
    const result = await fetchCinemaDetail(cinemaId, account.ck, account.userIdentifier || DEFAULT_USER_IDENTIFIER)
    const cinemaDetail = asRecord(asRecord(result).cinemaDetial)
    const address = firstText(cinemaDetail.address)

    if (address && ticketDetail.value?.orderId === detail.orderId) {
      ticketDetail.value = { ...ticketDetail.value, cinemaAddress: address }
    }
  } catch (error) {
    console.warn('[历史订单详情] 获取影院地址失败:', error)
  }
}

async function handleViewOrderDetail(order: OrderRecord) {
  const account = currentAccount.value

  if (!account?.ck) {
    ElMessage.error('请先选择已登录的账号')
    return
  }

  await ordersStore.queryOrderPayInfo(order)

  if (!ordersStore.currentPayInfo) {
    ElMessage.warning(ordersStore.message || '订单尚未出票或取票码暂不可用')
    return
  }

  const detail = buildTicketDetail(order, ordersStore.currentPayInfo, account.phone)

  if (!detail) {
    ElMessage.warning('订单尚未出票或取票码暂不可用')
    return
  }

  ticketDetail.value = detail
  ticketDialogVisible.value = true
  resetDialogPosition()
  void fillCinemaAddress(detail, ordersStore.currentPayInfo)
}

async function handleQueryPayInfo(order: OrderRecord) {
  const account = currentAccount.value

  if (!account?.ck) {
    ElMessage.error('请先选择已登录的账号')
    return
  }

  await ordersStore.queryOrderPayInfo(order)

  if (!ordersStore.currentPayInfo) {
    ElMessage.warning(ordersStore.message || '订单尚未出票或取票码暂不可用')
    return
  }

  const detail = buildTicketDetail(order, ordersStore.currentPayInfo, account.phone)

  if (!detail) {
    ElMessage.warning('订单尚未出票或取票码暂不可用')
    return
  }

  ticketDetail.value = detail
  payInfoDialogVisible.value = true
  resetDialogPosition()
  void fillCinemaAddress(detail, ordersStore.currentPayInfo)
}

async function handleCaptureTicket() {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法截图')
    return
  }

  try {
    const captureResult = await window.wandaApp.captureElement({ selector: historyTicketCodePanelSelector })

    if (!captureResult.ok) {
      ElMessage.error(`截图失败：${captureResult.error || '未知错误'}`)
      return
    }

    try {
      await window.wandaApp.copyElementToClipboard({ selector: historyTicketCodePanelSelector })
    } catch {
      // 忽略复制失败，保留截图成功结果
    }

    ElMessage.success(`截图已保存并复制到剪贴板：${captureResult.data.path}`)
  } catch (error) {
    ElMessage.error(`截图异常：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function handleCaptureHistoryTicketCode() {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法截图')
    return
  }

  await nextTick()

  const result = await window.wandaApp?.captureElement({ selector: historyTicketCodePanelSelector })

  if (result?.ok) {
    ElMessage.success(`截图已保存：${result.data.path}`)
    return
  }

  ElMessage.error(result?.error || '历史订单取票码截图失败')
}

async function handleCopyHistoryTicketCode() {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法复制截图')
    return
  }

  await nextTick()

  const result = await window.wandaApp?.copyElementToClipboard({ selector: historyTicketCodePanelSelector })

  if (result?.ok) {
    ElMessage.success('历史订单取票码截图已复制到剪贴板')
    return
  }

  ElMessage.error(result?.error || '复制历史订单取票码截图失败')
}

async function handleCancelOrder(order: OrderRecord) {
  const account = currentAccount.value

  if (!account?.ck) {
    ElMessage.error('请先选择已登录的账号')
    return
  }

  try {
    await ElMessageBox.confirm(`确定取消订单 ${order.orderNo} 吗？`, '确认取消', {
      confirmButtonText: '确认取消',
      type: 'warning'
    })

    await cancelTicketOrder(order.orderId, account.ck, account.userIdentifier || DEFAULT_USER_IDENTIFIER)
    ElMessage.success('订单已取消')
    logsStore.addLog('历史订单', account.phone, `取消订单成功：${order.orderNo}`)
    closeTicketDialog()
    await ordersStore.loadOrders()
  } catch (error) {
    if (error === 'cancel') {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    ElMessage.error(`取消订单失败：${message}`)
    logsStore.addLog('历史订单', account.phone, `取消订单失败：${message}`)
  }
}

async function handleRefundOrder(order: OrderRecord) {
  const account = currentAccount.value

  if (!account?.ck) {
    ElMessage.error('请先选择已登录的账号')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定退款订单 ${order.orderNo} 吗？金额 ${formatMoney(order.amount)} 将退回原支付方式。`,
      '确认退款',
      {
        confirmButtonText: '确认退款',
        type: 'warning'
      }
    )

    await refundTicketOrder(order.orderId, 0, 1, account.ck, account.userIdentifier || DEFAULT_USER_IDENTIFIER)
    ElMessage.success('退款申请已提交')
    logsStore.addLog('历史订单', account.phone, `退款申请已提交：${order.orderNo}`)
    closeTicketDialog()
    await ordersStore.loadOrders()
  } catch (error) {
    if (error === 'cancel') {
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    ElMessage.error(`退款失败：${message}`)
    logsStore.addLog('历史订单', account.phone, `退款失败：${message}`)
  }
}

watch(
  () => accountsStore.currentAccountId,
  () => {
    closeTicketDialog()
    void ordersStore.loadOrders()
  }
)

watch(ticketDialogVisible, (visible) => {
  if (visible) {
    resetDialogPosition()
  }
})

onMounted(() => {
  loadTicketTemplate()
  void ordersStore.loadOrders()
})

onBeforeUnmount(() => {
  handleDragEnd()
})
</script>

<template>
  <section class="history-order-page">
    <section class="history-summary-grid" aria-label="历史订单摘要">
      <article class="history-summary-card history-summary-card--blue">
        <span class="stat-label">今日订单</span>
        <strong class="stat-value">{{ ordersStore.summary.today }}</strong>
      </article>
      <article class="history-summary-card history-summary-card--orange">
        <span class="stat-label">待处理</span>
        <strong class="stat-value">{{ ordersStore.summary.pending }}</strong>
      </article>
      <article class="history-summary-card history-summary-card--green">
        <span class="stat-label">已完成</span>
        <strong class="stat-value">{{ ordersStore.summary.completed }}</strong>
      </article>
      <article class="history-summary-card history-summary-card--red">
        <span class="stat-label">总金额</span>
        <strong class="stat-value">{{ ordersStore.totalAmountText }}</strong>
      </article>
    </section>

    <section class="history-filter-panel panel">
      <div class="filter-left">
        <el-input
          v-model="ordersStore.filters.keyword"
          placeholder="搜索手机号/订单号/影片..."
          clearable
          :prefix-icon="Search"
          class="history-search-input"
        />
        <el-select v-model="ordersStore.filters.status" placeholder="订单状态" clearable class="history-status-select">
          <el-option label="全部状态" value="" />
          <el-option label="已完成" value="completed" />
          <el-option label="待支付" value="pending" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="已退款" value="refunded" />
        </el-select>
        <el-date-picker
          v-model="ordersStore.filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          class="history-date-range"
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
      </div>

      <div class="filter-right">
        <el-button type="success" :icon="Download" @click="handleExport">导出</el-button>
      </div>
    </section>

    <section class="history-table-panel panel">
      <header class="history-table-header">
        <div class="history-table-title">
          <span>
            <el-icon><Tickets /></el-icon>
            订单列表
          </span>
          <em>{{ ordersStore.filteredOrders.length }} / {{ ordersStore.total }} 条</em>
        </div>
        <span class="history-table-hint">双击订单可查看取票信息</span>
      </header>

      <div class="order-table-wrapper">
        <el-table
          v-loading="ordersStore.loading || ordersStore.detailLoading"
          :data="ordersStore.filteredOrders"
          height="100%"
          highlight-current-row
          :empty-text="ordersStore.message || '暂无数据'"
          @row-dblclick="handleViewOrderDetail"
        >
          <el-table-column prop="phone" label="手机号" width="132" />

          <el-table-column prop="orderNo" label="订单号" width="156">
            <template #default="{ row }">
              <span class="order-no">{{ row.orderNo }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="movieName" label="影片" min-width="170" show-overflow-tooltip>
            <template #default="{ row }">{{ row.movieName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="cinema" label="影院" min-width="190" show-overflow-tooltip>
            <template #default="{ row }">{{ row.cinema || '-' }}</template>
          </el-table-column>
          <el-table-column label="场次" width="230" show-overflow-tooltip>
            <template #default="{ row }">{{ formatShowtimeRange(row.showtime) || '-' }}</template>
          </el-table-column>

          <el-table-column prop="amount" label="金额" width="110" align="right">
            <template #default="{ row }">
              <span class="amount">{{ formatMoney(row.amount) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="104" align="center">
            <template #default="{ row }">
              <el-tag :type="getOrderStatusTagType(row)" size="small">
                {{ row.statusText || row.status }}
              </el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="createdAt" label="创建时间" width="180" show-overflow-tooltip>
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>

          <el-table-column label="操作" width="190" align="right" fixed="right">
            <template #default="{ row }">
              <div class="order-action-group">
                <el-button link type="primary" size="small" @click.stop="handleQueryPayInfo(row)">详情</el-button>
                <el-button
                  v-if="row.status === 'pending'"
                  link
                  type="danger"
                  size="small"
                  @click.stop="handleCancelOrder(row)"
                >
                  取消
                </el-button>
                <el-button
                  v-if="row.status === 'completed'"
                  link
                  type="danger"
                  size="small"
                  @click.stop="handleRefundOrder(row)"
                >
                  退款
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <footer class="order-pagination">
        <el-pagination
          v-model:current-page="ordersStore.pageIndex"
          v-model:page-size="ordersStore.pageSize"
          :page-sizes="[20, 50, 100]"
          :total="ordersStore.total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="ordersStore.loadOrders"
          @current-change="ordersStore.loadOrders"
        />
      </footer>
    </section>

    <Transition name="ticket-fade">
      <div v-if="ticketDialogVisible && ticketDetail" class="ticket-overlay" @click="closeTicketDialog">
        <div
          :class="['ticket-dialog', ticketTemplate === WANDA_TEMPLATE ? 'wanda-dialog' : '']"
          :style="{ left: `${dialogPosition.x}px`, top: `${dialogPosition.y}px` }"
          @click.stop
        >
          <div class="ticket-header" @mousedown="handleDragStart">
            <button class="ticket-back-btn" @click="closeTicketDialog">←</button>
            <span class="ticket-title">取票码</span>
            <button class="ticket-screenshot-btn" @click.stop="handleCaptureTicket">截图</button>
            <button class="ticket-close-btn" @click="closeTicketDialog">✕</button>
          </div>

          <template v-if="ticketTemplate === DEFAULT_TEMPLATE">
            <div class="ticket-card history-ticket-code-dialog">
              <div class="ticket-tip-bar">取票二维码</div>

              <div class="ticket-body history-ticket-code-panel">
                <div class="ticket-code-row">
                  <span class="ticket-code-label">取票码</span>
                  <span class="ticket-code-value">{{ ticketDetail.electronicCodes.join(' ') }}</span>
                </div>

                <div class="ticket-mobile-row">
                  <span class="ticket-mobile-label">手机号：</span>
                  <span>{{ ticketMaskedMobile }}</span>
                </div>

                <div class="ticket-qr-wrapper">
                  <template v-for="(qrCode, index) in ticketDetail.electronicQRs" :key="`default-qr-${index}`">
                    <img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)" class="ticket-qr-img" alt="取票二维码" />
                  </template>
                  <div v-if="ticketDetail.electronicQRs.length === 0" class="ticket-status-stamp-text">
                    {{ ticketDetail.ticketTip }}
                  </div>
                </div>
              </div>

              <div class="ticket-ad-banner">
                <div class="ad-left">
                  <span class="ad-title">W+会员开通赠3张IMAX券</span>
                  <span class="ad-desc">每天1杯免费可乐、会员价购票、优选座席等八大特权</span>
                </div>
                <el-button size="small" type="primary" round>去开通 ›</el-button>
              </div>
            </div>

            <div class="ticket-detail">
              <div class="detail-header">
                <span>订单号：{{ ticketDetail.orderId }}</span>
                <span class="detail-status">{{ ticketDetail.showOrderStatus }}</span>
              </div>

              <div class="movie-info-section">
                <div class="movie-name-line">
                  {{ ticketDetail.movieName }}
                  <span class="movie-version-tag">{{ ticketDetail.movieVersion }} {{ ticketDetail.movieLanguage }}</span>
                </div>

                <div class="info-row">
                  <span class="info-label">时间：</span>
                  <span>{{ ticketDetail.showTimeStr }} - {{ ticketDetail.showEndTimeStr }}</span>
                </div>

                <div class="info-row">
                  <span class="info-label">影院：</span>
                  <span>{{ ticketDetail.cinemaName }}</span>
                </div>

                <div class="info-row">
                  <span class="info-label">影厅：</span>
                  <span>{{ ticketDetail.hallName }}</span>
                </div>

                <div class="info-row">
                  <span class="info-label">座位：</span>
                  <span class="seat-tag">{{ ticketDetail.seats }}</span>
                </div>
              </div>

              <button class="custom-slogan-btn">
                <el-icon><Tickets /></el-icon>
                请到影院现场用万达取票机取票
              </button>
            </div>
          </template>

          <div v-else class="wanda-official-content history-ticket-code-dialog">
            <div class="wo-cinema-card">
              <div class="wo-cinema-name">{{ ticketDetail.cinemaName }}</div>
              <div class="wo-cinema-address">{{ ticketDetail.cinemaAddress || '请到影院现场查看详细地址' }}</div>
            </div>

            <div class="wo-movie-card">
              <div class="wo-movie-main">
                <div class="wo-movie-title">{{ ticketDetail.movieName }}</div>
                <div class="wo-movie-meta">
                  {{ [ticketDetail.movieLanguage, ticketDetail.movieVersion].filter(Boolean).join(' ') }}
                  {{ ticketDetail.electronicCodes.length || 1 }}张
                </div>
                <div class="wo-movie-time">
                  {{ ticketDetail.showTimeStr }}<template v-if="ticketDetail.showEndTimeStr"> ~ {{ ticketDetail.showEndTimeStr }}</template>
                </div>
                <div class="wo-movie-hallseat">
                  <span v-if="ticketDetail.hallName">{{ ticketDetail.hallName }}</span>
                  <span v-if="ticketDetail.seats" class="wo-seat">{{ ticketDetail.seats }}</span>
                </div>
              </div>
              <div class="wo-movie-poster">
                <img v-if="ticketDetail.moviePoster" :src="ticketDetail.moviePoster" alt="电影海报" />
              </div>
            </div>

            <div class="wo-dashed" />

            <div class="wo-voucher history-ticket-code-panel">
              <div class="wo-section-label">取票凭证</div>
              <div class="wo-qr-box">
                <template v-for="(qrCode, index) in ticketDetail.electronicQRs" :key="`wo-qr-${index}`">
                  <img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)" class="wo-qr" alt="取票二维码" />
                </template>
                <div v-if="ticketDetail.electronicQRs.length === 0" class="wo-no-qr">{{ ticketDetail.ticketTip }}</div>
              </div>
              <div v-if="ticketDetail.electronicCodes.length" class="wo-code">
                取票码：{{ groupTicketCode(ticketDetail.electronicCodes.join('')) }}
              </div>
            </div>

            <div class="wo-order-card">
              <div class="wo-order-head">
                <span>影票订单</span>
                <span class="wo-order-status">{{ ticketDetail.showOrderStatus }}</span>
              </div>
              <div class="wo-order-row"><span class="wo-order-label">订单编号</span><span>{{ ticketDetail.orderId }}</span></div>
              <div class="wo-order-row"><span class="wo-order-label">下单时间</span><span>{{ ticketDetail.createdAtLabel }}</span></div>
              <div class="wo-order-row"><span class="wo-order-label">手机号码</span><span>{{ ticketMaskedMobile }}</span></div>
              <div class="wo-order-divider" />
              <div class="wo-order-row wo-order-pay"><span class="wo-order-label">实付金额</span><strong>{{ formatMoney(ticketDetail.totalPrice) }}</strong></div>
            </div>

            <div class="history-ticket-code-dialog__actions">
              <el-button :disabled="!canCaptureHistoryTicketCode" @click="handleCaptureHistoryTicketCode">截图保存</el-button>
              <el-button type="primary" :disabled="!canCaptureHistoryTicketCode" @click="handleCopyHistoryTicketCode">复制截图</el-button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.history-order-page {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 86px auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
}

.panel {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.history-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.history-summary-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 13px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.history-summary-card--blue { border-color: var(--summary-blue-border); background: var(--summary-blue-bg); }
.history-summary-card--green { border-color: var(--summary-green-border); background: var(--summary-green-bg); }
.history-summary-card--orange { border-color: var(--summary-amber-border); background: var(--summary-amber-bg); }
.history-summary-card--red { border-color: var(--summary-red-border); background: var(--summary-red-bg); }

.stat-label {
  color: var(--app-muted);
  font-size: 12px;
}

.stat-value {
  min-width: 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-filter-panel {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.filter-left,
.filter-right {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-left {
  flex: 1;
}

.filter-right {
  flex: 0 0 auto;
}

.history-search-input {
  width: 280px;
}

.history-status-select {
  width: 140px;
}

.history-date-range {
  width: 260px;
}

.history-table-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-table-header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
}

.history-table-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--app-text);
  font-weight: 700;
}

.history-table-title span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.history-table-title :deep(.el-icon) {
  color: var(--app-accent);
}

.history-table-title em,
.history-table-hint {
  color: var(--app-muted);
  font-size: 12px;
  font-style: normal;
  font-weight: 400;
}

.order-table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 12px;
}

.order-table-wrapper :deep(.el-table) {
  --el-table-border-color: var(--app-border);
  color: var(--app-text);
}

.order-table-wrapper :deep(th.el-table__cell) {
  background: #f8fafc;
  color: var(--app-subtle);
  font-weight: 700;
}

.order-table-wrapper :deep(.el-table__body tr) {
  cursor: pointer;
  transition: background-color 160ms ease;
}

.order-no {
  color: var(--app-muted);
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.amount {
  color: #d16b6b;
  font-weight: 700;
}

.order-action-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  white-space: nowrap;
}

.order-pagination {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
  flex-shrink: 0;
}

.ticket-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgb(15 23 42 / 42%);
  backdrop-filter: blur(2px);
}

.ticket-dialog {
  position: fixed;
  width: 440px;
  max-height: 90vh;
  border: 1px solid var(--app-border);
  border-radius: var(--radius-base);
  background: var(--app-bg);
  box-shadow: var(--shadow-panel-strong);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 10000;
}

.ticket-dialog .ticket-card,
.ticket-dialog .ticket-detail,
.wanda-official-content {
  overflow-y: auto;
}

.ticket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--app-surface);
  border-bottom: 1px solid var(--app-border);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.ticket-back-btn,
.ticket-close-btn {
  background: transparent;
  border: none;
  font-size: 16px;
  color: var(--app-subtle);
  cursor: pointer;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  transition: background 0.2s;
}

.ticket-back-btn:hover,
.ticket-close-btn:hover {
  background: var(--app-hover);
}

.ticket-close-btn {
  font-size: 18px;
  color: var(--app-muted);
}

.ticket-screenshot-btn {
  background: transparent;
  border: 1px solid var(--app-border);
  font-size: 12px;
  color: var(--app-accent);
  cursor: pointer;
  padding: 2px 10px;
  border-radius: 4px;
  transition: all 0.2s;
}

.ticket-screenshot-btn:hover {
  background: var(--app-accent);
  color: #fff;
  border-color: var(--app-accent);
}

.ticket-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--app-text);
}

.ticket-card {
  margin: 10px 12px 0;
  border-radius: var(--radius-base);
  overflow: hidden;
  background: transparent;
  flex-shrink: 0;
}

.ticket-tip-bar {
  background: linear-gradient(135deg, #1a4a9e, #2563b8);
  color: #fff;
  text-align: center;
  font-size: 14px;
  padding: 11px 16px;
  letter-spacing: 0.5px;
}

.ticket-body {
  background: var(--app-surface);
  color: var(--app-text);
  padding: 24px 20px 20px;
  position: relative;
}

.ticket-code-row {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 12px;
}

.ticket-code-label {
  font-size: 17px;
  color: var(--app-subtle);
  white-space: nowrap;
}

.ticket-code-value {
  font-size: 40px;
  font-weight: 400;
  letter-spacing: 2px;
  color: #1a56a8;
}

.ticket-mobile-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  font-size: 15px;
  color: var(--app-subtle);
}

.ticket-mobile-label {
  color: var(--app-muted);
}

.ticket-qr-wrapper {
  display: flex;
  justify-content: center;
  padding: 18px 0 8px;
  position: relative;
}

.ticket-qr-img {
  width: 220px !important;
  height: 220px !important;
  object-fit: contain;
  background: var(--app-surface);
}

.ticket-status-stamp-text {
  text-align: center;
  font-size: 28px;
  color: rgb(200 80 80 / 50%);
  font-weight: 700;
  letter-spacing: 4px;
  line-height: 1.4;
}

.ticket-ad-banner {
  background: linear-gradient(135deg, #2c1810 0%, #3d2518 100%);
  border-radius: 0 0 10px 10px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ad-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ad-title {
  font-size: 14px;
  font-weight: 700;
  color: #f5d77a;
}

.ad-desc {
  font-size: 11px;
  color: rgb(255 255 255 / 60%);
}

.ticket-detail {
  margin: 10px 12px 12px;
  background: var(--app-surface);
  border-radius: var(--radius-base);
  overflow: hidden;
  flex-shrink: 0;
}

.history-ticket-code-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 16px 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  font-size: 13px;
  color: var(--app-muted);
  border-bottom: 1px solid var(--app-border);
}

.detail-status {
  color: #67c23a;
  font-weight: 500;
}

.movie-info-section {
  padding: 16px;
}

.movie-name-line {
  font-size: 17px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 12px;
}

.movie-version-tag {
  font-size: 13px;
  font-weight: 400;
  color: var(--app-subtle);
  margin-left: 6px;
}

.info-row {
  font-size: 14px;
  color: var(--app-subtle);
  line-height: 2;
  display: flex;
}

.info-label {
  color: var(--app-muted);
  flex-shrink: 0;
}

.seat-tag {
  display: inline-block;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 13px;
  color: var(--app-text);
  margin-left: 4px;
}

.custom-slogan-btn {
  display: flex;
  width: calc(100% - 32px);
  margin: 0 16px 16px;
  padding: 12px;
  background: var(--app-accent-soft);
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: var(--app-accent);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ticket-fade-enter-active,
.ticket-fade-leave-active {
  transition: opacity 0.3s ease;
}

.ticket-fade-enter-from,
.ticket-fade-leave-to {
  opacity: 0;
}

.wanda-dialog {
  background: var(--app-bg) !important;
}

.wanda-official-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: #f4f5f7;
}

.wo-cinema-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
}

.wo-cinema-name {
  font-size: 15px;
  font-weight: 700;
  color: #1f2329;
}

.wo-cinema-address {
  margin-top: 4px;
  font-size: 12px;
  color: #8a9099;
}

.wo-movie-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 16px;
}

.wo-movie-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wo-movie-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2329;
}

.wo-movie-meta {
  font-size: 12px;
  color: #8a9099;
}

.wo-movie-time {
  font-size: 13px;
  color: #4e5561;
}

.wo-movie-hallseat {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #4e5561;
}

.wo-movie-poster {
  flex: 0 0 auto;
}

.wo-movie-poster img {
  width: 88px;
  height: 118px;
  object-fit: cover;
  border-radius: 8px;
}

.wo-dashed {
  border-top: 1px dashed #e3e5e9;
  margin: 2px 6px;
}

.wo-voucher {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 18px 16px;
}

.wo-section-label {
  align-self: flex-start;
  font-size: 15px;
  font-weight: 700;
  color: #1f2329;
}

.wo-qr-box {
  display: grid;
  place-items: center;
}

.wo-qr {
  width: 200px !important;
  height: 200px !important;
  object-fit: contain;
}

.wo-no-qr {
  min-height: 120px;
  display: grid;
  place-items: center;
  color: #8a9099;
  font-size: 13px;
}

.wo-code {
  padding: 8px 16px;
  border-radius: 8px;
  background: #f4f5f7;
  color: #8a9099;
  font-size: 14px;
  letter-spacing: 1px;
}

.wo-order-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
}

.wo-order-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 15px;
  font-weight: 700;
  color: #1f2329;
}

.wo-order-status {
  font-size: 12px;
  font-weight: 500;
  color: #8a9099;
}

.wo-order-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
  color: #4e5561;
}

.wo-order-label {
  color: #8a9099;
}

.wo-order-divider {
  border-top: 1px solid #f0f1f3;
  margin: 8px 0;
}

.wo-order-pay strong {
  font-size: 17px;
  font-weight: 700;
  color: #1f2329;
}
</style>
