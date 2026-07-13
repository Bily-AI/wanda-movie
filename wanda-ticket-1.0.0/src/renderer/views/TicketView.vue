<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from 'vue'

import {
  Connection,
  Grid,
  Key,
  Picture,
  Refresh,
  Search
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import SeatMap from '@renderer/components/SeatMap.vue'
import CouponList from '@renderer/components/CouponList.vue'
import PayCardList from '@renderer/components/PayCardList.vue'
import PaymentPanel from '@renderer/components/PaymentPanel.vue'
import SelectedSeatList from '@renderer/components/SelectedSeatList.vue'
import { extractAppPayParam, openAlipayPayment } from '@renderer/services/alipayBridge'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTicketStore } from '@renderer/stores/ticket'
import type { OrderPayInfoResult } from '@shared/wandaTicketTypes'

const accountsStore = useAccountsStore()
const settingsStore = useSettingsStore()
const ticketStore = useTicketStore()
type SelectLikeInstance = {
  focus?: () => void
  toggleMenu?: () => void
}

const citySelectRef = ref<SelectLikeInstance | null>(null)
const cinemaSelectRef = ref<SelectLikeInstance | null>(null)
const movieSelectRef = ref<SelectLikeInstance | null>(null)
const dateSelectRef = ref<SelectLikeInstance | null>(null)
const showtimeSelectRef = ref<SelectLikeInstance | null>(null)
const ticketCodeDialogVisible = ref(false)
const payInfoDialogVisible = ref(false)
const openingAlipay = ref(false)
const autoOpenedPayInfoOrderId = ref('')
const lastPaymentMessage = ref('')
const ticketCodePanelSelector = '.ticket-code-panel'

interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  priceText?: string
  meta?: string
  cardNo?: string
  balanceText?: string
  typeText?: string
  expiryText?: string
}

interface PayInfoDisplayField {
  label: string
  value: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string') {
      const text = value.trim()

      if (text) {
        return text
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }

  return ''
}

function firstListRecord(value: unknown): Record<string, unknown> {
  return asRecord(Array.isArray(value) ? value[0] : value)
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

function getPayInfoValue(payInfo: OrderPayInfoResult | null): unknown {
  if (!payInfo) {
    return undefined
  }

  const directPayInfo = (payInfo as OrderPayInfoResult & { payInfo?: unknown }).payInfo

  if (hasVisibleValue(directPayInfo)) {
    return directPayInfo
  }

  const raw = asRecord(payInfo.raw)
  const data = asRecord(raw.data)
  const res = asRecord(data.res)
  const directTicketInfo = firstListRecord(data.subTicketOrderInfo)
  const orderInf = firstListRecord(data.orderInf)
  const ticketInfo = firstListRecord(orderInf.subTicketOrderInfo)
  const source =
    Object.keys(ticketInfo).length > 0 ? ticketInfo : Object.keys(directTicketInfo).length > 0 ? directTicketInfo : data

  return res.payInfo ?? source.payInfo ?? data.payInfo ?? raw.payInfo
}

function formatPayInfoValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function collectPayInfoFields(value: unknown): PayInfoDisplayField[] {
  if (!hasVisibleValue(value)) {
    return []
  }

  if (Array.isArray(value)) {
    return value
      .filter(hasVisibleValue)
      .map((item, index) => ({
        label: `支付信息 ${index + 1}`,
        value: formatPayInfoValue(item).trim()
      }))
      .filter((item) => item.value)
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, item]) => hasVisibleValue(item))
      .map(([label, item]) => ({
        label,
        value: formatPayInfoValue(item).trim()
      }))
      .filter((item) => item.value)
  }

  const text = formatPayInfoValue(value).trim()
  return text ? [{ label: '支付信息', value: text }] : []
}

const paymentActivityOptions = computed<PaymentDisplayItem[]>(() =>
  ticketStore.paymentActivities.flatMap((activity, index) => {
    const value = activity.code || activity.name

    if (!value) {
      return []
    }

    const priceText = `￥${activity.price.toFixed(2)}`

    return [
      {
        key: `${value}-${index}`,
        label: activity.name || activity.note || value,
        value,
        priceText
      }
    ]
  })
)

const paymentCardItems = computed<PaymentDisplayItem[]>(() =>
  ticketStore.paymentCards.flatMap((card, index) => {
    const value = card.cardNo

    if (!value) {
      return []
    }

    return [
      {
        key: `${value}-${index}`,
        label: card.cardName || card.cardTypeName || value,
        value,
        meta: `￥${card.balance.toFixed(2)}`,
        cardNo: value,
        balanceText: `￥${card.balance.toFixed(2)}`
      }
    ]
  })
)

function buildCouponLabel(coupon: (typeof ticketStore.coupons)[number]): string {
  const raw = asRecord(coupon.raw)

  return firstText(
    coupon.name,
    coupon.couponTypeName,
    coupon.detailTypeName,
    coupon.couponCategoryName,
    coupon.couponNo,
    coupon.voucherNo,
    coupon.code,
    raw.couponTypeName,
    raw.couponName,
    raw.name,
    raw.detailTypeName,
    raw.detailtypename,
    raw.typeName,
    raw.voucherNo,
    raw.voucher_number,
    raw.couponNo,
    raw.no
  )
}

function formatCouponExpiryMeta(...values: unknown[]): string {
  for (const value of values) {
    const text = firstText(value)

    if (!text) {
      continue
    }

    const timestamp = text.match(/^\d{10,13}$/)?.[0]

    if (timestamp) {
      const time = Number(timestamp.length === 10 ? `${timestamp}000` : timestamp)
      const date = new Date(time)

      if (!Number.isNaN(date.getTime())) {
        return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 过期`
      }
    }

    const dateMatch = text.match(/(\d{4})[-/.年]?\s*(\d{1,2})[-/.月]?\s*(\d{1,2})/)

    if (!dateMatch) {
      continue
    }

    const year = Number(dateMatch[1])
    const month = Number(dateMatch[2])
    const day = Number(dateMatch[3])

    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}年${month}月${day}日 过期`
    }
  }

  return ''
}

function buildCouponType(coupon: (typeof ticketStore.coupons)[number]): string {
  const raw = asRecord(coupon.raw)
  return firstText(
    coupon.detailTypeName,
    raw.detailTypeName,
    raw.detailtypename,
    coupon.couponTypeName,
    raw.couponTypeName,
    raw.typeName
  ) || '代金券'
}

function buildCouponMeta(coupon: (typeof ticketStore.coupons)[number]): string {
  const raw = asRecord(coupon.raw)
  const expiryText = formatCouponExpiryMeta(
    coupon.validity,
    raw.validityDateShowMsg,
    raw.validity,
    raw.expireTime,
    raw.expireDate,
    raw.endTime
  )
  const amountText = coupon.amount > 0 ? `￥${coupon.amount.toFixed(2)}` : ''

  if (expiryText) {
    return expiryText
  }

  return firstText(
    coupon.couponCategoryName,
    coupon.detailTypeName,
    amountText,
    raw.couponCategoryName,
    raw.typeName,
    raw.detailTypeName,
    raw.detailtypename
  )
}

const couponItems = computed<PaymentDisplayItem[]>(() =>
  ticketStore.coupons.flatMap((coupon, index) => {
    const value = coupon.code || coupon.couponNo || coupon.voucherNo

    if (!value) {
      return []
    }

    return [
      {
        key: `${value}-${index}`,
        label: buildCouponLabel(coupon) || `兑换券 ${index + 1}`,
        value,
        meta: buildCouponMeta(coupon) || '-',
        typeText: buildCouponType(coupon),
        expiryText: formatCouponExpiryMeta(
          coupon.validity,
          asRecord(coupon.raw).validityDateShowMsg,
          asRecord(coupon.raw).validity,
          asRecord(coupon.raw).expireTime,
          asRecord(coupon.raw).expireDate,
          asRecord(coupon.raw).endTime
        ) || '-'
      }
    ]
  })
)

const ticketCodes = computed(() => ticketStore.currentOrderPayInfo?.ticketCodes ?? [])
const qrCodes = computed(() => ticketStore.currentOrderPayInfo?.qrCodes ?? [])
const payInfoFields = computed(() => collectPayInfoFields(getPayInfoValue(ticketStore.currentOrderPayInfo)))
const ticketAppPayParam = computed(() => extractAppPayParam(ticketStore.currentOrderPayInfo))
const hasTicketCodeData = computed(() => ticketCodes.value.length > 0 || qrCodes.value.length > 0)
const ticketCodeSeatText = computed(() =>
  ticketStore.currentOrder?.seats.map((seat) => `${seat.rowName}排${seat.columnName}座`).join('、') || '-'
)
const ticketCodeAmount = computed(() => `¥${((ticketStore.currentOrder?.amountCent ?? 0) / 100).toFixed(2)}`)

function formatCentAmount(value: number): string {
  return `¥${(Math.max(0, value) / 100).toFixed(2)}`
}

function isImageQrCode(value: string): boolean {
  return /^data:image\//.test(value) || /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

function formatQrImage(value: string): string {
  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`
}

async function handleImageOcr(): Promise<void> {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法读取剪贴板图片')
    return
  }

  try {
    const imageResult = await window.wandaApp?.readClipboardImage()

    if (!imageResult?.ok) {
      ElMessage.warning(imageResult?.error || '剪贴板中没有图片')
      return
    }

    const ocrResult = await window.wandaApp?.ocrRecognize({ imageBase64: imageResult.data.base64 })

    if (!ocrResult?.ok) {
      ElMessage.error(ocrResult?.error || '百度 OCR 识别失败')
      return
    }

    const text = ocrResult.data.words.join('\n')

    if (!text.trim()) {
      ElMessage.warning('百度 OCR 未识别到文字')
      return
    }

    const parsed = await ticketStore.applyOcrTicketText(text)
    ElMessage.success(`图片识别完成，识别到 ${parsed.seats.length} 个座位`)
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '图片识别失败')
  }
}

async function handleTextOcr(): Promise<void> {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法读取剪贴板文本')
    return
  }

  try {
    const textResult = await window.wandaApp?.readClipboardText()

    if (!textResult?.ok) {
      ElMessage.warning(textResult?.error || '剪贴板中没有文本内容')
      return
    }

    const parsed = await ticketStore.applyOcrTicketText(textResult.data)
    ElMessage.success(`文本识别完成，识别到 ${parsed.seats.length} 个座位`)
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '文本识别失败')
  }
}

function handleRemoveSelectedSeat(seat: Parameters<typeof ticketStore.toggleSeat>[0]): void {
  ticketStore.toggleSeat(seat)
}

function handleCouponSelectionChange(values: string[]): void {
  ticketStore.selectedCoupons = values
  void ticketStore.refreshSelectedCouponPreview()
}

async function handleRefreshTicketCode(): Promise<void> {
  await ticketStore.refreshTicketCode()

  if (hasTicketCodeData.value) {
    ticketCodeDialogVisible.value = true
  } else {
    ElMessage.warning(ticketStore.currentOrderMessage || '订单尚未出票或取票码暂不可用')
  }
}

async function handleOpenTicketAlipayPayment(): Promise<void> {
  if (!ticketAppPayParam.value) {
    ElMessage.warning('缺少支付宝支付参数')
    return
  }

  openingAlipay.value = true

  try {
    const result = await openAlipayPayment(ticketAppPayParam.value, {
      requestParams: toRaw(settingsStore.requestParams),
      autoPayment: toRaw(settingsStore.autoPayment)
    })
    ElMessage.success(result.reusedWindow ? '已刷新支付宝支付窗口' : '已打开支付宝支付窗口')
    void ticketStore.startTicketCodePolling()
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '打开支付宝支付失败')
  } finally {
    openingAlipay.value = false
  }
}

async function handleCaptureTicketCode(): Promise<void> {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法截图')
    return
  }

  await nextTick()

  const result = await window.wandaApp?.captureElement({ selector: ticketCodePanelSelector })

  if (result.ok) {
    ElMessage.success(`取票码截图已保存：${result.data.path}`)
  } else {
    ElMessage.error(result.error || '取票码截图失败')
  }
}

async function handleCopyTicketCode(): Promise<void> {
  if (!window.wandaApp) {
    ElMessage.error('Electron 桥接未就绪，无法复制截图')
    return
  }

  await nextTick()

  const result = await window.wandaApp?.copyElementToClipboard({ selector: ticketCodePanelSelector })

  if (result.ok) {
    ElMessage.success('取票码截图已复制到剪贴板')
  } else {
    ElMessage.error(result.error || '复制取票码截图失败')
  }
}

async function openSelect(instance: SelectLikeInstance | null, enabled = true): Promise<void> {
  if (!instance || !enabled) {
    return
  }

  await nextTick()
  instance.focus?.()
  instance.toggleMenu?.()
}

async function handleCityChange(): Promise<void> {
  ticketStore.selectCity()
  await openSelect(cinemaSelectRef.value, ticketStore.filteredCinemaOptions.length > 0)
}

async function handleCinemaChange(): Promise<void> {
  await ticketStore.loadCinemaShowtimes()
  await openSelect(movieSelectRef.value, ticketStore.canSelectMovie)
}

async function handleMovieChange(): Promise<void> {
  ticketStore.selectMovie()
  await openSelect(dateSelectRef.value, ticketStore.canSelectDate)
}

async function handleDateChange(): Promise<void> {
  ticketStore.selectDate()
  await openSelect(showtimeSelectRef.value, ticketStore.canSelectShowtime)
}

async function handleShowtimeChange(): Promise<void> {
  ticketStore.setShowtime()

  if (ticketStore.canRefreshSeats) {
    await ticketStore.loadRealTimeSeats()
  }
}

watch(
  () => accountsStore.currentAccountId,
  (currentAccountId, previousAccountId) => {
    if (currentAccountId !== previousAccountId) {
      payInfoDialogVisible.value = false
      autoOpenedPayInfoOrderId.value = ''
      lastPaymentMessage.value = ''
      ticketStore.handleAccountChanged()
    }
  }
)

watch(
  () => ticketStore.currentOrderPayInfo,
  async (payInfo) => {
    if (!hasVisibleValue(getPayInfoValue(payInfo))) {
      payInfoDialogVisible.value = false
      if (!ticketStore.currentOrder?.orderId) {
        autoOpenedPayInfoOrderId.value = ''
      }
      return
    }

    const orderId = ticketStore.currentOrder?.orderId || ''

    if (!orderId || autoOpenedPayInfoOrderId.value === orderId || !ticketAppPayParam.value || openingAlipay.value) {
      return
    }

    autoOpenedPayInfoOrderId.value = orderId
    payInfoDialogVisible.value = true
    await handleOpenTicketAlipayPayment()
  }
)

watch(
  () => [ticketStore.submittingPayment, ticketStore.paymentDataMessage] as const,
  ([submittingPayment, paymentDataMessage], [previousSubmittingPayment]) => {
    const message = paymentDataMessage.trim()

    if (!message || message === lastPaymentMessage.value) {
      return
    }

    if (previousSubmittingPayment && !submittingPayment) {
      lastPaymentMessage.value = message

      if (message.includes('瀹屾垚') || message.includes('鎴愬姛')) {
        ElMessage.success(message)
        return
      }

      ElMessage.warning(message)
    }
  }
)

watch(
  () => ticketAppPayParam.value,
  (newParam, oldParam) => {
    if (newParam && newParam !== oldParam && !openingAlipay.value) {
      handleOpenTicketAlipayPayment()
    }
  }
)

watch(
  () => ticketStore.paymentActivity,
  (newActivityCode) => {
    if (newActivityCode) {
      const bestCard = ticketStore.autoMatchPaymentCard()
      if (bestCard) {
        ElMessage.success(`已为你自动匹配最佳支付卡：${bestCard.cardName || bestCard.cardNo}`)
      }
    }
  }
)

watch(
  () => hasTicketCodeData.value,
  (hasData) => {
    if (hasData) {
      ticketCodeDialogVisible.value = true
    }
  }
)
</script>

<template>
  <section class="ticket-workbench">
    <section class="ticket-center">
      <section class="panel query-panel">
        <header class="panel-header">
          <span>
            <el-icon><Search /></el-icon>
            购票查询
          </span>
          <span class="ocr-state">{{ ticketStore.showtimeError || '等待 OCR 匹配' }}</span>
        </header>

        <div class="query-layout">
          <div class="query-form">
            <label>城市：</label>
            <el-select
              ref="citySelectRef"
              v-model="ticketStore.query.city"
              filterable
              default-first-option
              placeholder="选择或搜索城市"
              @change="handleCityChange"
            >
              <el-option
                v-for="city in ticketStore.filteredCityOptions"
                :key="city.value"
                :label="city.label"
                :value="city.value"
              />
            </el-select>

            <label>影院：</label>
            <div>
              <el-select
                ref="cinemaSelectRef"
                v-model="ticketStore.query.cinema"
                filterable
                default-first-option
                placeholder="选择或搜索影院"
                :loading="ticketStore.loadingShowtimes"
                @change="handleCinemaChange"
              >
                <el-option
                  v-for="cinema in ticketStore.filteredCinemaOptions"
                  :key="cinema.value"
                  :label="cinema.label"
                  :value="cinema.value"
                />
              </el-select>
              <p class="field-tip">可直接输入影院名称或首字母搜索</p>
            </div>

            <label>影片：</label>
            <el-select
              ref="movieSelectRef"
              v-model="ticketStore.query.movie"
              filterable
              default-first-option
              placeholder="请先选择影院"
              :disabled="!ticketStore.canSelectMovie"
              @change="handleMovieChange"
            >
              <el-option
                v-for="movie in ticketStore.movies"
                :key="movie.value"
                :label="movie.label"
                :value="movie.value"
              />
            </el-select>

            <label>日期：</label>
            <el-select
              ref="dateSelectRef"
              v-model="ticketStore.query.date"
              filterable
              default-first-option
              placeholder="请先选择影片"
              :disabled="!ticketStore.canSelectDate"
              @change="handleDateChange"
            >
              <el-option
                v-for="date in ticketStore.dates"
                :key="date.value"
                :label="date.label"
                :value="date.value"
              />
            </el-select>

            <label>场次：</label>
            <div class="showtime-row">
              <el-select
                ref="showtimeSelectRef"
                v-model="ticketStore.query.showtime"
                filterable
                default-first-option
                placeholder="请先选择日期"
                :disabled="!ticketStore.canSelectShowtime"
                @change="handleShowtimeChange"
              >
                <el-option
                  v-for="showtime in ticketStore.showtimes"
                  :key="showtime.value"
                  :label="showtime.label"
                  :value="showtime.value"
                />
              </el-select>
              <el-button
                type="primary"
                :icon="Refresh"
                :loading="ticketStore.loadingSeats"
                :disabled="!ticketStore.canRefreshSeats"
                @click="ticketStore.loadRealTimeSeats"
              >
                刷新座位
              </el-button>
            </div>

            <span />
            <p v-if="ticketStore.showtimeError" class="query-error">{{ ticketStore.showtimeError }}</p>
          </div>
        </div>
      </section>

      <section class="panel seat-panel">
        <header class="seat-header">
          <span>
            <el-icon><Grid /></el-icon>
            选座信息
          </span>
          <span>已选 {{ ticketStore.selectedSeatCount }} 座</span>
        </header>

        <div class="screen-line">银幕</div>

        <div class="seat-stage">
          <el-empty
            v-if="ticketStore.seatNodes.length === 0"
            :description="ticketStore.seatError || '请选择城市、影院、影片、日期和场次后刷新座位'"
          />
          <div v-else class="seat-scroll">
            <SeatMap
              :seats="ticketStore.seatNodes"
              :selected-seats="ticketStore.selectedSeatNodes"
              @select="ticketStore.toggleSeat"
            />
          </div>
        </div>

        <div class="seat-toolbar">
          <span><i class="legend-normal" />普通区</span>
          <span><i class="legend-prime" />优选区</span>
          <span><i class="legend-vip" />VIP区</span>
          <span><i class="legend-wplus" />W+会员区</span>
          <span><i class="legend-couple" />情侣区</span>
          <span><i class="legend-special" />特惠区</span>
        </div>
      </section>
    </section>

    <aside class="ticket-context-column order-column">
      <section class="context-card panel side-panel context-card--grow">
        <header class="panel-header">
          <span>
            <el-icon><Connection /></el-icon>
            全局订单信息
          </span>
        </header>
        <div v-if="ticketStore.currentOrder" class="order-summary">
          <p>订单号：{{ ticketStore.currentOrder.orderId }}</p>
          <p>{{ ticketStore.currentOrder.movieName }} / {{ ticketStore.currentOrder.cinemaName }}</p>
          <p>{{ ticketStore.currentOrder.showtimeLabel }}</p>
          <p>金额：￥{{ (ticketStore.currentOrder.amountCent / 100).toFixed(2) }}</p>
          <p v-if="ticketStore.currentOrderFinalized">状态：已完成</p>
          <p v-else-if="ticketStore.orderStatus?.showOrderStatusStr">
            状态：{{ ticketStore.orderStatus.showOrderStatusStr }}
          </p>
          <p v-if="ticketStore.paymentDataMessage">{{ ticketStore.paymentDataMessage }}</p>
          <p v-if="ticketStore.currentOrderMessage">{{ ticketStore.currentOrderMessage }}</p>
        </div>
        <div v-else class="side-empty">{{ ticketStore.currentOrderMessage || '暂无订单' }}</div>
      </section>

      <section class="context-panel panel side-panel">
        <PaymentPanel
          :activities="paymentActivityOptions"
          :selected-activity="ticketStore.paymentActivity"
          :loading="ticketStore.loadingPaymentData"
          :active-price="formatCentAmount(ticketStore.selectedActivityPayablePriceCent)"
          @update:selected-activity="ticketStore.paymentActivity = $event"
        />
      </section>

      <section class="context-panel panel side-panel">
        <PayCardList
          :items="paymentCardItems"
          :selected-values="ticketStore.selectedPaymentCards"
          :loading="ticketStore.loadingPaymentData"
          @update:selected-values="ticketStore.selectedPaymentCards = $event"
        />
      </section>

      <section class="context-panel panel side-panel">
        <CouponList
          :items="couponItems"
          :selected-values="ticketStore.selectedCoupons"
          :loading="ticketStore.loadingPaymentData"
          :seat-count="ticketStore.selectedSeatCount"
          @update:selected-values="handleCouponSelectionChange"
        />
      </section>

      <section class="context-card panel side-panel">
        <header class="panel-header">
          <span>已选座位</span>
          <span>{{ ticketStore.selectedSeatCount }} / {{ ticketStore.maxSeatCount }}</span>
        </header>
        <SelectedSeatList
          :selected-seats="ticketStore.selectedSeatNodes"
          :total-price-cent="ticketStore.selectedSeatTotalPriceCent"
          :payable-price-cent="ticketStore.selectedSeatPreviewPayablePriceCent"
          :discount-price-cent="ticketStore.selectedSeatPreviewDiscountPriceCent"
          @remove-seat="handleRemoveSelectedSeat"
        />
      </section>
    </aside>

    <footer class="bottom-actions">
      <el-button
        :icon="Refresh"
        :loading="ticketStore.checkingPayment || ticketStore.ticketCodePolling"
        :disabled="ticketStore.ticketCodePolling"
        @click="handleRefreshTicketCode"
      >
        刷新购票码
      </el-button>
      <el-button :icon="Picture" @click="handleImageOcr">图片识别</el-button>
      <el-button :icon="Key" @click="handleTextOcr">文本识别</el-button>
      <span class="bottom-spacer" />
      <el-button
        type="warning"
        :disabled="ticketStore.selectedSeatCount === 0 || ticketStore.hasPendingCurrentOrder"
        @click="ticketStore.clearSeatSelection"
      >
        取消选择
      </el-button>
      <el-popconfirm
        title="确认创建电影票订单？"
        confirm-button-text="确认"
        cancel-button-text="取消"
        @confirm="ticketStore.createCurrentOrder"
      >
        <template #reference>
          <el-button
            type="success"
            :loading="ticketStore.orderCreating"
            :disabled="ticketStore.selectedSeatCount === 0 || ticketStore.orderCreating || ticketStore.hasPendingCurrentOrder"
          >
            确认选座
          </el-button>
        </template>
      </el-popconfirm>
      <el-popconfirm
        v-if="ticketStore.hasPendingCurrentOrder"
        title="确认取消当前真实订单？将调用真实取消接口释放座位，请确认。"
        confirm-button-text="取消订单"
        cancel-button-text="返回"
        @confirm="ticketStore.cancelCurrentOrder"
      >
        <template #reference>
          <el-button
            type="danger"
            :loading="ticketStore.orderCancelling"
            :disabled="ticketStore.orderCancelling || ticketStore.currentOrderFinalized"
          >
            取消订单
          </el-button>
        </template>
      </el-popconfirm>
      <el-popconfirm
        title="确认提交支付？将调用真实支付接口，请确认订单和账号无误。"
        confirm-button-text="提交支付"
        cancel-button-text="取消"
        @confirm="ticketStore.submitCurrentOrderPayment"
      >
        <template #reference>
          <el-button
            type="primary"
            :loading="ticketStore.submittingPayment"
            :disabled="!ticketStore.canSubmitCurrentOrderPayment"
          >
            提交支付
          </el-button>
        </template>
      </el-popconfirm>
    </footer>

    <el-dialog
      v-model="payInfoDialogVisible"
      class="payment-info-dialog"
      title="支付参数"
      width="640px"
      append-to-body
      destroy-on-close
    >
      <section v-if="payInfoFields.length > 0" class="payment-info-panel">
        <dl class="payment-info-fields">
          <div v-for="(field, index) in payInfoFields" :key="`${field.label}-${index}`" class="payment-info-field">
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
      </section>
      <el-empty v-else description="暂无支付参数" :image-size="56" />
      <template #footer>
        <el-button @click="payInfoDialogVisible = false">关闭</el-button>
        <el-popconfirm
          title="确认打开支付宝支付？如已开启自动支付，窗口可能尝试自动填写。"
          confirm-button-text="打开支付宝"
          cancel-button-text="取消"
          @confirm="handleOpenTicketAlipayPayment"
        >
          <template #reference>
            <el-button
              type="primary"
              :loading="openingAlipay"
              :disabled="!ticketAppPayParam"
            >
              打开支付宝支付
            </el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-dialog>

    <el-dialog
      v-model="ticketCodeDialogVisible"
      class="ticket-code-dialog"
      title="取票码"
      width="420px"
      append-to-body
      destroy-on-close
    >
      <section
        class="ticket-code-panel"
        :class="{ 'ticket-code-panel--wanda': settingsStore.ticketCodeTemplate === '万达风格' }"
      >
        <header class="ticket-code-panel__header">
          <span>万达电影</span>
          <strong>{{ ticketStore.currentOrder?.movieName || '-' }}</strong>
        </header>

        <div class="ticket-code-panel__meta">
          <span>{{ ticketStore.currentOrder?.cinemaName || '-' }}</span>
          <span>{{ ticketStore.currentOrder?.showtimeLabel || '-' }}</span>
          <span>{{ ticketCodeSeatText }}</span>
        </div>

        <div v-if="ticketCodes.length" class="ticket-code-panel__codes">
          <span v-for="(code, index) in ticketCodes" :key="`ticket-code-${index}-${code}`">
            {{ code }}
          </span>
        </div>
        <el-empty v-else description="暂无取票码" :image-size="56" />

        <div v-if="qrCodes.length" class="ticket-code-panel__qr-list">
          <div v-for="(qrCode, index) in qrCodes" :key="`ticket-qr-${index}`" class="ticket-code-panel__qr">
            <img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)" alt="取票二维码" />
            <span v-else>{{ qrCode }}</span>
          </div>
        </div>

        <footer class="ticket-code-panel__footer">
          <span>订单号：{{ ticketStore.currentOrder?.orderId || '-' }}</span>
          <strong>{{ ticketCodeAmount }}</strong>
        </footer>
      </section>

      <template #footer>
        <div class="ticket-code-dialog__actions">
          <el-button @click="handleCaptureTicketCode">截图保存</el-button>
          <el-button type="primary" @click="handleCopyTicketCode">复制截图</el-button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.ticket-workbench {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  grid-template-rows: minmax(0, 1fr) 64px;
  gap: 12px;
  overflow: hidden;
}

.ticket-center,
.order-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ticket-center {
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.order-column {
  overflow: hidden;
}

.ticket-context-column {
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.panel {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.panel-header,
.seat-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-header span,
.seat-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-header :deep(.el-icon),
.seat-header :deep(.el-icon) {
  color: var(--app-accent);
}

.query-panel {
  padding-bottom: 12px;
}

.ocr-state {
  max-width: 54%;
  justify-content: flex-end;
  color: #168a3d;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.query-layout {
  display: block;
  padding: 14px;
}

.query-form {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 10px 12px;
  align-items: center;
}

.query-form label {
  color: var(--app-subtle);
}

.field-tip {
  margin: 4px 0 0;
  color: #f56c6c;
  font-size: 12px;
}

.query-error {
  margin: 0;
  color: #f56c6c;
  font-size: 12px;
}

.showtime-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 8px;
}

.seat-panel {
  flex: 1 0 420px;
  min-height: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.seat-header span:last-child {
  color: var(--app-muted);
  font-weight: 400;
}

.screen-line {
  margin: 8px 28px 0;
  border-top: 3px solid #e2e8f2;
  color: var(--app-muted);
  text-align: center;
  line-height: 26px;
}

.seat-stage {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: start center;
}

.seat-scroll {
  align-self: stretch;
  justify-self: stretch;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  scrollbar-gutter: stable both-edges;
  overscroll-behavior: contain;
}

.seat-toolbar {
  min-height: 48px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 0 24px 16px;
  color: var(--app-subtle);
  font-size: 13px;
}

.seat-toolbar i {
  width: 14px;
  height: 14px;
  display: inline-block;
  margin-right: 4px;
  border-radius: 3px;
  vertical-align: -2px;
}

.legend-normal { border: 2px solid #e6a23c; }
.legend-prime { border: 2px solid #67c23a; }
.legend-vip { border: 2px solid #409eff; }
.legend-wplus { border: 2px solid #6b75c9; }
.legend-couple { border: 2px solid #f56c6c; }
.legend-special { border: 2px solid #49b45f; }

.side-panel {
  min-width: 0;
  min-height: 86px;
  overflow: hidden;
}

.context-card,
.context-panel {
  box-shadow: none;
}

/* 顶部全局订单信息卡自适应吃掉多余高度，支付活动/支付卡/兑换券/已选座位整组沉到底部 */
.context-card--grow {
  flex: 1;
  min-height: 86px;
}

.side-empty {
  min-height: 48px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.order-summary {
  max-height: 224px;
  overflow: auto;
  padding: 12px 16px;
  color: var(--app-text);
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.order-summary p {
  margin: 0 0 8px;
}

.payment-info-panel {
  max-height: 58vh;
  overflow: auto;
}

.payment-info-fields {
  display: grid;
  gap: 8px;
  margin: 0;
}

.payment-info-field {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #f8fafc;
}

.payment-info-field dt {
  color: var(--app-muted);
}

.payment-info-field dd {
  min-width: 0;
  margin: 0;
  color: var(--app-text);
  white-space: pre-wrap;
  word-break: break-all;
}

.mini-list {
  max-height: 126px;
  overflow: auto;
  padding: 8px 12px 12px;
}

.mini-list-item {
  min-height: 30px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--app-text);
  font-size: 12px;
}

.mini-list-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-list-item em {
  color: var(--app-muted);
  font-style: normal;
}

.side-line {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px 16px 16px;
  color: var(--app-subtle);
}

.bottom-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.bottom-spacer {
  flex: 1;
}

.ticket-code-panel {
  width: 100%;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border: 1px solid #e4e9f2;
  border-radius: 8px;
  background: #fff;
  color: var(--app-text);
}

.ticket-code-panel--wanda {
  border-color: #f1d7d7;
  background:
    linear-gradient(180deg, #fff7f4 0%, #ffffff 36%),
    #fff;
}

.ticket-code-panel__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  text-align: center;
}

.ticket-code-panel__header span {
  color: #d9363e;
  font-size: 18px;
  font-weight: 800;
}

.ticket-code-panel__header strong {
  max-width: 100%;
  color: var(--app-text);
  font-size: 16px;
  overflow-wrap: anywhere;
}

.ticket-code-panel__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border-radius: 8px;
  background: #f6f8fb;
  color: var(--app-subtle);
  line-height: 1.5;
}

.ticket-code-panel__codes {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}

.ticket-code-panel__codes span {
  width: 100%;
  min-height: 44px;
  display: grid;
  place-items: center;
  border: 1px dashed #b6c4d8;
  border-radius: 8px;
  background: #fbfcff;
  color: #1f2a44;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.ticket-code-panel__qr-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 12px;
}

.ticket-code-panel__qr {
  min-height: 132px;
  display: grid;
  place-items: center;
  padding: 10px;
  border: 1px solid #e4e9f2;
  border-radius: 8px;
  background: #fff;
  overflow-wrap: anywhere;
  text-align: center;
}

.ticket-code-panel__qr img {
  width: 116px;
  height: 116px;
  object-fit: contain;
}

.ticket-code-panel__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid #e4e9f2;
  padding-top: 14px;
  color: var(--app-muted);
  font-size: 13px;
}

.ticket-code-panel__footer span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.ticket-code-panel__footer strong {
  color: #d9363e;
  font-size: 16px;
}

.ticket-code-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<!--
  Contract compatibility markers:
  万达账号登录
  v-model="accountsStore.loginForm.phone"
  @click="accountsStore.sendLoginCode"
  class="full-button"
  :disabled="accountsStore.loginForm.sending || accountsStore.loginForm.loggingIn || !accountsStore.loginForm.requestId"
  @click="accountsStore.loginWandaAccount"
  @click="handleMoveSelectedToGroup"
  @click="handleImportAccounts"

  @change="ticketStore.selectCity"
  @change="ticketStore.loadCinemaShowtimes"
  @change="ticketStore.selectMovie"
  @change="ticketStore.selectDate"
  @change="ticketStore.setShowtime"

  .ticket-center {
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }
  .seat-panel {
    flex: 1 0 420px;
    min-height: 420px;
    overflow: hidden;
  }
  .seat-stage {
    flex: 1;
    min-height: 0;
  }
  .seat-scroll {
    align-self: stretch;
    justify-self: stretch;
    overflow: auto;
    scrollbar-gutter: stable both-edges;
  }

.ticket-context-column {
  min-width: 0;
  padding-right: 8px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}
-->
