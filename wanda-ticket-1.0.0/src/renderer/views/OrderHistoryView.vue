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

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    return ''
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
  const cinemaInfo = asRecord(subTicket.orderInf)
  const movie = firstListRecord(asRecord(cinemaInfo.movies).movie)
  const seatInfoList = asList(subTicket.seatInfo)
  const qrCodes = payInfo.qrCodes.length > 0 ? payInfo.qrCodes : [firstText(subTicket.electronicQR)].filter(Boolean)
  const ticketCodes = payInfo.ticketCodes.length > 0 ? payInfo.ticketCodes : asList(subTicket.electronicCode).map((item) => firstText(item)).filter(Boolean)
  const seatText = seatInfoList
    .map((seat) => firstText(asRecord(seat).seatName))
    .filter(Boolean)
    .join('、')

  const payStatus = toNumber(orderInfo.payStatus)

  if (payStatus !== 3 || qrCodes.length === 0) {
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
  }
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
  <section class="page-container">
    <div class="order-filter-bar">
      <div class="filter-left">
        <el-input
          v-model="ordersStore.filters.keyword"
          placeholder="搜索手机号/订单号/影片..."
          clearable
          :prefix-icon="Search"
          style="width: 280px"
        />
        <el-select v-model="ordersStore.filters.status" placeholder="订单状态" clearable style="width: 140px">
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
          style="width: 260px"
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
      </div>

      <div class="filter-right">
        <el-button type="success" :icon="Download" @click="handleExport">导出</el-button>
      </div>
    </div>

    <div class="order-stats">
      <div class="stat-card">
        <span class="stat-label">今日订单</span>
        <span class="stat-value primary">{{ ordersStore.summary.today }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">待处理</span>
        <span class="stat-value warning">{{ ordersStore.summary.pending }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">已完成</span>
        <span class="stat-value success">{{ ordersStore.summary.completed }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">总金额</span>
        <span class="stat-value danger">{{ ordersStore.totalAmountText }}</span>
      </div>
    </div>

    <div class="order-table-wrapper">
      <el-table
        v-loading="ordersStore.loading || ordersStore.detailLoading"
        :data="ordersStore.filteredOrders"
        stripe
        height="100%"
        highlight-current-row
        :empty-text="ordersStore.message || '暂无数据'"
      >
        <el-table-column prop="phone" label="手机号" width="140" />

        <el-table-column prop="orderNo" label="订单号" width="150">
          <template #default="{ row }">
            <span class="order-no">{{ row.orderNo }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="movieName" label="影片" min-width="140" />
        <el-table-column prop="cinema" label="影院" min-width="160" />
        <el-table-column prop="showtime" label="场次" width="120" />

        <el-table-column prop="amount" label="金额" width="100" align="center">
          <template #default="{ row }">
            <span class="amount">{{ formatMoney(row.amount) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'completed'
                  ? 'success'
                  : row.status === 'pending'
                    ? 'warning'
                    : row.status === 'cancelled'
                      ? 'info'
                      : row.status === 'refunded'
                        ? 'danger'
                        : 'info'
              "
              size="small"
            >
              {{ row.statusText || row.status }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="160" />

        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="{ row }">
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
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="order-pagination">
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
    </div>

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

          <div v-else class="wanda-official-content">
            <div class="wanda-cinema-card">
              <div class="wanda-cinema-name">{{ ticketDetail.cinemaName }}</div>
              <div class="wanda-cinema-address">{{ ticketDetail.cinemaAddress || '请到影院现场查看详细地址' }}</div>
            </div>

            <div class="wanda-movie-section">
              <div class="wanda-movie-left">
                <div class="wanda-movie-title">{{ ticketDetail.movieName }}</div>
                <div class="wanda-movie-meta">{{ ticketDetail.movieLanguage }}/{{ ticketDetail.movieVersion }}/1张</div>
                <div class="wanda-show-time">{{ ticketDetail.showTimeStr }} ~ {{ ticketDetail.showEndTimeStr }}</div>
                <div class="wanda-mobile-last4">{{ ticketMobileLast4 }}</div>
              </div>

              <div class="wanda-movie-poster">
                <img :src="ticketDetail.moviePoster || '/default-poster.png'" alt="电影海报" />
              </div>
            </div>

            <div class="wanda-divider" />

            <div class="wanda-hall-seat-row">
              <div class="wanda-hall-item">
                <div class="wanda-item-label">影厅</div>
                <div class="wanda-item-value">{{ ticketDetail.hallName }}</div>
              </div>

              <div class="wanda-seat-item">
                <div class="wanda-item-label">座位</div>
                <div class="wanda-item-value">{{ ticketDetail.seats }}</div>
              </div>
            </div>

            <div class="wanda-qr-area history-ticket-code-panel">
              <template v-for="(qrCode, index) in ticketDetail.electronicQRs" :key="`wanda-qr-${index}`">
                <img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)" class="wanda-qr-code" alt="取票二维码" />
              </template>
              <div v-if="ticketDetail.electronicQRs.length === 0" class="wanda-no-qr">
                {{ ticketDetail.ticketTip }}
              </div>
            </div>

            <div class="wanda-code-area">
              <span class="wanda-code-label">取票码：</span>
              <span class="wanda-code-number">{{ ticketDetail.electronicCodes.join(' ') }}</span>
            </div>

            <div class="wanda-bottom-tip">请到影院内万达电影取票机取票</div>
            <div class="history-ticket-code-dialog__actions">
              <el-button :disabled="!canCaptureHistoryTicketCode" @click="handleCaptureHistoryTicketCode">截图保存</el-button>
              <el-button type="primary" :disabled="!canCaptureHistoryTicketCode" @click="handleCopyHistoryTicketCode">
                复制截图
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.page-container {
  min-width: 980px;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.order-filter-bar {
  height: 56px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
  gap: var(--spacing-md);
  flex-shrink: 0;
}

.filter-left,
.filter-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.order-stats {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  flex-shrink: 0;
}

.stat-card {
  flex: 1;
  background: var(--bg-secondary);
  border-radius: var(--radius-base);
  border: 1px solid var(--border-light);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--shadow-light);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--font-size-xxl);
  font-weight: 700;
}

.stat-value.primary {
  color: var(--wanda-primary);
}

.stat-value.success {
  color: var(--wanda-success);
}

.stat-value.warning {
  color: var(--wanda-warning);
}

.stat-value.danger {
  color: var(--wanda-danger);
}

.order-table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 var(--spacing-md);
}

.order-table-wrapper :deep(.el-table) {
  --el-table-border-color: var(--border-light);
}

.order-table-wrapper :deep(th.el-table__cell) {
  background: #fafbfc;
  font-weight: 600;
  color: var(--text-primary);
}

.order-table-wrapper :deep(.el-table__body tr) {
  cursor: pointer;
  transition: background 0.15s;
}

.order-no {
  font-family: 'Courier New', monospace;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.amount {
  font-weight: 600;
  color: var(--wanda-danger);
}

.order-pagination {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 var(--spacing-md);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.ticket-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgb(0 0 0 / 45%);
  backdrop-filter: blur(2px);
}

.ticket-dialog {
  position: fixed;
  width: 440px;
  max-height: 90vh;
  background: #f5f5f5;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgb(0 0 0 / 25%);
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
  background: #fff;
  border-bottom: 1px solid #eee;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.ticket-back-btn,
.ticket-close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
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
  background: #f0f0f0;
}

.ticket-close-btn {
  font-size: 18px;
  color: #999;
}

.ticket-screenshot-btn {
  background: none;
  border: 1px solid #dcdfe6;
  font-size: 12px;
  color: #409eff;
  cursor: pointer;
  padding: 2px 10px;
  border-radius: 4px;
  transition: all 0.2s;
}

.ticket-screenshot-btn:hover {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.ticket-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.ticket-card {
  margin: 10px 12px 0;
  border-radius: 10px;
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
  background: #fff;
  color: #333;
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
  color: #555;
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
  color: #555;
}

.ticket-mobile-label {
  color: #666;
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
  background: #fff;
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
  background: #fff;
  border-radius: 12px;
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
  color: #999;
  border-bottom: 1px solid #f0f0f0;
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
  color: #333;
  margin-bottom: 12px;
}

.movie-version-tag {
  font-size: 13px;
  font-weight: 400;
  color: #666;
  margin-left: 6px;
}

.info-row {
  font-size: 14px;
  color: #555;
  line-height: 2;
  display: flex;
}

.info-label {
  color: #999;
  flex-shrink: 0;
}

.seat-tag {
  display: inline-block;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 13px;
  color: #333;
  margin-left: 4px;
}

.custom-slogan-btn {
  display: flex;
  width: calc(100% - 32px);
  margin: 0 16px 16px;
  padding: 12px;
  background: #eaf2fe;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  color: #409eff;
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
  background: #f0f2f5 !important;
}

.wanda-official-content {
  background: #fff;
  margin: 10px 12px 12px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
}

.wanda-cinema-card {
  background: linear-gradient(135deg, #1b6fd4, #2196f3);
  color: #fff;
  padding: 18px 20px;
}

.wanda-cinema-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.wanda-cinema-address {
  font-size: 12px;
  opacity: 0.8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wanda-movie-section {
  display: flex;
  padding: 16px 20px;
  align-items: flex-start;
  gap: 16px;
}

.wanda-movie-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wanda-movie-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a1a1a;
}

.wanda-movie-meta {
  font-size: 13px;
  color: #888;
}

.wanda-show-time {
  font-size: 14px;
  color: #555;
}

.wanda-mobile-last4 {
  font-size: 13px;
  color: #888;
  margin-top: 2px;
}

.wanda-movie-poster {
  width: 72px;
  height: 96px;
  border-radius: 6px;
  overflow: hidden;
  background: #eee;
  flex-shrink: 0;
}

.wanda-movie-poster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wanda-divider {
  height: 1px;
  background: #e8e8e8;
  margin: 0 20px;
}

.wanda-hall-seat-row {
  display: flex;
  padding: 16px 20px;
  gap: 40px;
}

.wanda-hall-item,
.wanda-seat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wanda-item-label {
  font-size: 13px;
  color: #999;
}

.wanda-item-value {
  font-size: 15px;
  color: #333;
  font-weight: 500;
}

.wanda-qr-area {
  display: flex;
  justify-content: center;
  padding: 8px 20px 16px;
}

.wanda-qr-code {
  width: 160px !important;
  height: 160px !important;
  object-fit: contain;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 4px;
}

.wanda-no-qr {
  font-size: 24px;
  color: rgb(200 80 80 / 50%);
  font-weight: 700;
  letter-spacing: 4px;
}

.wanda-code-area {
  display: flex;
  justify-content: center;
  align-items: baseline;
  padding: 4px 20px 20px;
  gap: 8px;
}

.wanda-code-label {
  font-size: 15px;
  color: #555;
}

.wanda-code-number {
  font-size: 28px;
  font-weight: 700;
  color: #e67e22;
  letter-spacing: 2px;
}

.wanda-bottom-tip {
  background: #f7f8fa;
  text-align: center;
  padding: 14px 20px;
  font-size: 13px;
  color: #888;
  border-top: 1px solid #eee;
}
</style>
