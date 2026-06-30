<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Connection, Refresh, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import type { AutoOrderTicketResult, WandaHttpResult } from '@shared/ipc'

type AutoOrderPlatform = '麻花' | '哈哈'
type AutoOrderStep = '待出票' | '确认中' | '确认完成' | '发送中' | '已发送' | '购票成功' | '购票失败'

interface AutoOrderItem {
  orderId: string
  platform: AutoOrderPlatform
  movieName: string
  cinemaName: string
  city: string
  showDate: string
  showTime: string
  seats: string
  price?: string
  createTime?: string
  processTime?: string
  step?: AutoOrderStep
  status?: 'success' | 'failed'
  remark?: string
  raw: unknown
}

interface PlatformConfig {
  enabled: boolean
  token: string
  cookie: string
}

const MAHUA_BASE_URL = 'https://mhdyp.com/api/movie-server/movie'
const HAHA_BASE_URL = 'https://hahapiao.cn/api'
const pollIntervalMs = ref(10000)
const running = ref(false)
const loading = ref(false)
const processingOrderId = ref('')
const lastQueryTime = ref('')
const biddingOrders = ref<AutoOrderItem[]>([])
const pendingOrders = ref<AutoOrderItem[]>([])
const finishedOrders = ref<AutoOrderItem[]>([])
const sentOrderIds = new Set<string>()
const queue: AutoOrderItem[] = []
let pollTimer: ReturnType<typeof setInterval> | undefined
let stopResultListener: (() => void) | undefined

const mahuaConfig = ref<PlatformConfig>({
  enabled: localStorage.getItem('auto_order_mahua_enabled') === 'true',
  token: localStorage.getItem('auto_order_mahua_token') || '',
  cookie: localStorage.getItem('auto_order_mahua_cookie') || ''
})
const hahaConfig = ref<PlatformConfig>({
  enabled: localStorage.getItem('auto_order_haha_enabled') === 'true',
  token: localStorage.getItem('auto_order_haha_token') || '',
  cookie: localStorage.getItem('auto_order_haha_cookie') || ''
})

const enabledPlatforms = computed(() => {
  const platforms: AutoOrderPlatform[] = []

  if (isPlatformReady(mahuaConfig.value)) {
    platforms.push('麻花')
  }

  if (isPlatformReady(hahaConfig.value)) {
    platforms.push('哈哈')
  }

  return platforms
})

const enabledPlatformText = computed(() => (enabledPlatforms.value.length > 0 ? enabledPlatforms.value.join('、') : '未配置'))
const serviceStateText = computed(() => (running.value ? (loading.value ? '刷新中' : '运行中') : '已停止'))

function saveConfig(): void {
  localStorage.setItem('auto_order_mahua_enabled', String(mahuaConfig.value.enabled))
  localStorage.setItem('auto_order_mahua_token', mahuaConfig.value.token)
  localStorage.setItem('auto_order_mahua_cookie', mahuaConfig.value.cookie)
  localStorage.setItem('auto_order_haha_enabled', String(hahaConfig.value.enabled))
  localStorage.setItem('auto_order_haha_token', hahaConfig.value.token)
  localStorage.setItem('auto_order_haha_cookie', hahaConfig.value.cookie)
}

function isPlatformReady(config: PlatformConfig): boolean {
  return Boolean(config.enabled && config.token.trim() && config.cookie.trim())
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function firstText(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const text = toText(record[key]).trim()

    if (text) {
      return text
    }
  }

  return ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function collectList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  const record = asRecord(value)

  return [
    ...asArray(record.rtnData),
    ...asArray(record.data),
    ...asArray(record.list),
    ...asArray(record.rows)
  ]
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function formatUnixTime(value: unknown): string {
  const timestamp = Number(value)

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return ''
  }

  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
}

function extractDate(value: string): string {
  const matched = value.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)
  return matched?.[0] || value.split(' ')[0] || ''
}

function extractTime(value: string): string {
  return value.match(/\d{1,2}:\d{2}/)?.[0] || ''
}

function unwrapWandaResult(result: WandaHttpResult | undefined, fallback: string): unknown {
  if (!result?.ok) {
    throw new Error(result?.error || fallback)
  }

  return result.data
}

async function postPlatform(url: string, headers: Record<string, string>, body: string): Promise<unknown> {
  const result = await window.wandaApp?.wandaHttpPost({ url, headers, body })
  return unwrapWandaResult(result, '平台接口请求失败')
}

function buildMahuaHeaders(config: PlatformConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://mhdyp.com',
    Referer: 'https://mhdyp.com/',
    Channelid: 'C00001',
    Token: config.token,
    Sign: '',
    Txntime: String(Date.now()),
    cookie: config.cookie,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
  }
}

async function mahuaPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  return postPlatform(`${MAHUA_BASE_URL}${path}`, buildMahuaHeaders(mahuaConfig.value), JSON.stringify(body))
}

function buildHahaHeaders(config: PlatformConfig): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://hahapiao.cn',
    Referer: 'https://hahapiao.cn/pc/',
    token: config.token,
    cookie: config.cookie,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'
  }
}

async function hahaPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const formBody = new URLSearchParams()

  for (const [key, value] of Object.entries(body)) {
    formBody.append(key, String(value ?? ''))
  }

  return postPlatform(`${HAHA_BASE_URL}${path}`, buildHahaHeaders(hahaConfig.value), formBody.toString())
}

function normalizeHahaBidding(item: unknown): AutoOrderItem {
  const record = asRecord(item)
  const cinema = asRecord(record.cinema)
  const showTime = firstText(record, 'time') || firstText(cinema, 'time')
  const orderNumber = firstText(record, 'orderNumber')

  return {
    orderId: `哈哈_${orderNumber}`,
    platform: '哈哈',
    movieName: firstText(record, 'movie') || firstText(cinema, 'movie'),
    cinemaName: firstText(record, 'cinemaName') || firstText(cinema, 'cinema'),
    city: firstText(record, 'city') || firstText(cinema, 'city'),
    showDate: extractDate(showTime),
    showTime: extractTime(showTime),
    seats: firstText(record, 'seatInfo') || firstText(cinema, 'seatInfo'),
    price: firstText(record, 'price') || firstText(cinema, 'price', 'cost'),
    createTime: formatUnixTime(record.create_time),
    raw: item
  }
}

function normalizeHahaPending(item: unknown): AutoOrderItem {
  const record = asRecord(item)
  const cinema = asRecord(record.cinema)
  const showTime = firstText(record, 'time') || firstText(cinema, 'time')
  const orderNumber = firstText(record, 'orderNumber')

  return {
    orderId: `哈哈_${orderNumber}`,
    platform: '哈哈',
    movieName: firstText(record, 'movie') || firstText(cinema, 'movie'),
    cinemaName: firstText(record, 'cinemaName') || firstText(cinema, 'cinema'),
    city: firstText(record, 'city') || firstText(cinema, 'city'),
    showDate: extractDate(showTime),
    showTime: extractTime(showTime),
    seats: firstText(record, 'seatInfo') || firstText(cinema, 'seatInfo'),
    price: firstText(record, 'price') || firstText(cinema, 'price', 'cost'),
    createTime: formatUnixTime(record.create_time),
    step: String(record.is_confirm || '') === '1' ? '确认完成' : '确认中',
    raw: item
  }
}

function normalizeMahuaBidding(item: unknown): AutoOrderItem {
  const record = asRecord(item)
  const showTime = firstText(record, 'movieShowTime')

  return {
    orderId: `麻花_${firstText(record, 'id')}`,
    platform: '麻花',
    movieName: firstText(record, 'movieName'),
    cinemaName: firstText(record, 'movieCinemaName', 'cinemaName'),
    city: firstText(record, 'movieCityName', 'cityName'),
    showDate: extractDate(showTime),
    showTime: extractTime(showTime),
    seats: firstText(record, 'buySeats', 'buyNum'),
    price: `¥${firstText(record, 'biddingPrice', 'salePrice')}`,
    createTime: firstText(record, 'addtime'),
    raw: item
  }
}

function normalizeMahuaPending(item: unknown): AutoOrderItem {
  const record = asRecord(item)
  const showTime = firstText(record, 'movieShowTime')

  return {
    orderId: `麻花_${firstText(record, 'id')}`,
    platform: '麻花',
    movieName: firstText(record, 'movieName'),
    cinemaName: firstText(record, 'movieCinemaName', 'cinemaName'),
    city: firstText(record, 'movieCityName', 'cityName'),
    showDate: extractDate(showTime),
    showTime: extractTime(showTime),
    seats: firstText(record, 'buySeats', 'buyNum'),
    price: `¥${firstText(record, 'biddingPrice', 'salePrice')}`,
    createTime: firstText(record, 'addtime'),
    step: Number(record.getOrderStatus) === 0 ? '确认完成' : '确认中',
    raw: item
  }
}

function normalizeFinished(item: unknown, platform: AutoOrderPlatform, remark: string): AutoOrderItem {
  const record = asRecord(item)
  const showTime = firstText(record, 'movieShowTime', 'showTime', 'time')
  const id = firstText(record, 'orderNumber', 'orderId', 'id')

  return {
    orderId: `${platform}_${id}`,
    platform,
    movieName: firstText(record, 'movieName', 'movie'),
    cinemaName: firstText(record, 'movieCinemaName', 'cinemaName', 'cinema'),
    city: firstText(record, 'movieCityName', 'cityName', 'city'),
    showDate: extractDate(showTime),
    showTime: extractTime(showTime) || showTime,
    seats: firstText(record, 'buySeats', 'seatInfo', 'seats'),
    processTime: firstText(record, 'finishTime', 'createTime', 'addtime'),
    status: 'success',
    remark,
    raw: item
  }
}

async function loadHahaOrders(nextBidding: AutoOrderItem[], nextPending: AutoOrderItem[], nextFinished: AutoOrderItem[]): Promise<void> {
  const bidding = await hahaPost('/Synchro/getOrderList', { pageSize: 50, current: 1, total: 0, tab: 1, type: 1, mold: 1 })
  nextBidding.push(...collectList(bidding).map(normalizeHahaBidding))

  const pending = await hahaPost('/Synchro/getOrderList', { pageSize: 50, current: 1, total: 0, tab: 0, type: 1, mold: 1 })
  for (const item of collectList(pending)) {
    const record = asRecord(item)

    if (String(record.is_confirm || '') !== '1' && record.b_id) {
      try {
        await hahaPost('/Synchro/orderConfirm', { bid: String(record.b_id) })
        record.is_confirm = '1'
      } catch (error) {
        console.error('[自动接单] 哈哈确认失败', record.orderNumber, error)
      }
    }

    nextPending.push(normalizeHahaPending(record))
  }

  const finished = await hahaPost('/Synchro/getOrderList', { pageSize: 50, current: 1, total: 0, tab: 0, type: 2, mold: 1 })
  nextFinished.push(...collectList(finished).map((item) => normalizeFinished(item, '哈哈', '哈哈平台已完成')))
}

async function loadMahuaOrders(nextBidding: AutoOrderItem[], nextPending: AutoOrderItem[], nextFinished: AutoOrderItem[]): Promise<void> {
  const bidding = await mahuaPost('/bidding/order/list', {
    tag: '0',
    biddingOrderId: '',
    movieName: '',
    nowId: '',
    cinemaName: ''
  })
  nextBidding.push(...collectList(bidding).map(normalizeMahuaBidding))

  const pending = await mahuaPost('/get/order/list', {
    tag: '0',
    nowId: '',
    getOrderId: '',
    movieName: '',
    cinemaName: ''
  })
  for (const item of collectList(pending)) {
    const record = asRecord(item)

    if (Number(record.getOrderStatus) === 6 && record.id) {
      try {
        await mahuaPost('/get/order/confirm', { orderId: String(record.id) })
        record.getOrderStatus = 0
      } catch (error) {
        console.error('[自动接单] 麻花确认失败', record.id, error)
      }
    }

    nextPending.push(normalizeMahuaPending(record))
  }

  const settle = await mahuaPost('/get/order/list', {
    tag: '1',
    nowId: '',
    getOrderId: '',
    movieName: '',
    cinemaName: ''
  })
  nextFinished.push(...collectList(settle).map((item) => normalizeFinished(item, '麻花', '麻花平台待结算')))

  const finished = await mahuaPost('/get/order/list', {
    tag: '2',
    nowId: '',
    getOrderId: '',
    movieName: '',
    cinemaName: ''
  })
  nextFinished.push(...collectList(finished).map((item) => normalizeFinished(item, '麻花', '麻花平台已完成')))
}

async function refreshOrders(): Promise<void> {
  if (loading.value) {
    return
  }

  loading.value = true

  try {
    const nextBidding: AutoOrderItem[] = []
    const nextPending: AutoOrderItem[] = []
    const nextFinished: AutoOrderItem[] = []

    if (isPlatformReady(hahaConfig.value)) {
      await loadHahaOrders(nextBidding, nextPending, nextFinished)
    }

    if (isPlatformReady(mahuaConfig.value)) {
      await loadMahuaOrders(nextBidding, nextPending, nextFinished)
    }

    biddingOrders.value = nextBidding
    mergePendingOrders(nextPending)
    finishedOrders.value = [...nextFinished, ...finishedOrders.value.filter((item) => item.remark === '已发送主窗口处理')].slice(0, 100)
    lastQueryTime.value = new Date().toLocaleString('zh-CN', { hour12: false })
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '自动接单接口请求失败')
  } finally {
    loading.value = false
  }
}

function mergePendingOrders(nextOrders: AutoOrderItem[]): void {
  const previousMap = new Map(pendingOrders.value.map((item) => [item.orderId, item]))
  const merged: AutoOrderItem[] = []

  for (const order of nextOrders) {
    const previous = previousMap.get(order.orderId)
    const nextOrder = previous ? { ...order, step: previous.step || order.step } : order
    merged.push(nextOrder)

    if ((nextOrder.step === '确认完成' || nextOrder.step === '待出票') && !sentOrderIds.has(nextOrder.orderId)) {
      enqueueOrder(nextOrder)
    }
  }

  pendingOrders.value = merged
}

function enqueueOrder(order: AutoOrderItem): void {
  sentOrderIds.add(order.orderId)
  queue.push(order)
  void processQueue()
}

function buildTicketText(order: AutoOrderItem): string {
  return [
    `影院:${order.cinemaName}`,
    `影片:${order.movieName}`,
    `日期:${order.showDate}`,
    `时间:${order.showTime}`,
    `座位:${order.seats}`
  ].join('\n')
}

async function processQueue(): Promise<void> {
  if (processingOrderId.value) {
    return
  }

  const order = queue.shift()

  if (!order) {
    return
  }

  processingOrderId.value = order.orderId
  updatePendingStep(order.orderId, '发送中')

  try {
    const result = await window.wandaApp?.sendAutoOrderTicket({
      orderId: order.orderId,
      platform: order.platform,
      ticketText: buildTicketText(order),
      raw: order.raw
    })

    if (!result?.ok) {
      throw new Error(result?.error || '发送购票指令失败')
    }

    updatePendingStep(order.orderId, '已发送')
    movePendingToFinished(order.orderId, 'success', '已发送主窗口处理')
  } catch (error) {
    updatePendingStep(order.orderId, '购票失败')
    movePendingToFinished(order.orderId, 'failed', error instanceof Error && error.message ? error.message : '发送购票指令失败')
  } finally {
    processingOrderId.value = ''
    void processQueue()
  }
}

function updatePendingStep(orderId: string, step: AutoOrderStep): void {
  const index = pendingOrders.value.findIndex((item) => item.orderId === orderId)

  if (index >= 0) {
    pendingOrders.value[index].step = step
  }
}

function movePendingToFinished(orderId: string, status: 'success' | 'failed', remark: string): void {
  const index = pendingOrders.value.findIndex((item) => item.orderId === orderId)

  if (index < 0) {
    return
  }

  const order = pendingOrders.value[index]
  pendingOrders.value.splice(index, 1)
  finishedOrders.value.unshift({
    ...order,
    processTime: new Date().toLocaleString('zh-CN', { hour12: false }),
    status,
    remark
  })
}

function handleProcessResult(result: AutoOrderTicketResult): void {
  const index = finishedOrders.value.findIndex((item) => item.orderId === result.orderId)

  if (index >= 0) {
    finishedOrders.value[index] = {
      ...finishedOrders.value[index],
      status: result.status,
      remark: result.remark || (result.status === 'success' ? '购票成功' : '购票失败'),
      processTime: new Date().toLocaleString('zh-CN', { hour12: false })
    }
  }

  if (result.ticketCode) {
    ElMessage.success(`订单 ${result.orderId} 购票成功，取票码：${result.ticketCode}`)
  } else if (result.status === 'success') {
    ElMessage.success(`订单 ${result.orderId} 购票处理完成`)
  } else {
    ElMessage.warning(`订单 ${result.orderId} 处理失败：${result.remark || ''}`)
  }
}

function toggleService(): void {
  if (running.value) {
    stopService()
  } else {
    startService()
  }
}

function startService(): void {
  saveConfig()

  if (enabledPlatforms.value.length === 0) {
    ElMessage.warning('请至少开启一个平台并填写 Token、Cookie')
    return
  }

  running.value = true
  void refreshOrders()
  pollTimer = setInterval(() => void refreshOrders(), pollIntervalMs.value)
  ElMessage.success(`自动接单服务已启动（${enabledPlatforms.value.join('、')}）`)
}

function stopService(): void {
  running.value = false

  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }

  ElMessage.info('自动接单服务已停止')
}

function statusTagType(row: AutoOrderItem): 'success' | 'warning' | 'danger' | 'info' {
  if (row.status === 'success' || row.step === '购票成功' || row.step === '确认完成') {
    return 'success'
  }

  if (row.status === 'failed' || row.step === '购票失败') {
    return 'danger'
  }

  if (row.step === '发送中' || row.step === '确认中') {
    return 'warning'
  }

  return 'info'
}

onMounted(() => {
  stopResultListener = window.wandaApp?.onAutoOrderProcessResult(handleProcessResult)
})

onBeforeUnmount(() => {
  stopService()
  stopResultListener?.()
})
</script>

<template>
  <section class="auto-order-workbench">
    <section class="auto-status-grid" aria-label="自动接单状态摘要">
      <article class="auto-status-card auto-status-card--blue">
        <span>服务状态</span>
        <strong>{{ serviceStateText }}</strong>
      </article>
      <article class="auto-status-card auto-status-card--green">
        <span>启用平台</span>
        <strong>{{ enabledPlatforms.length }}</strong>
        <em>{{ enabledPlatformText }}</em>
      </article>
      <article class="auto-status-card">
        <span>竞价中</span>
        <strong>{{ biddingOrders.length }}</strong>
      </article>
      <article class="auto-status-card auto-status-card--amber">
        <span>待提交</span>
        <strong>{{ pendingOrders.length }}</strong>
      </article>
      <article class="auto-status-card auto-status-card--red">
        <span>已完成</span>
        <strong>{{ finishedOrders.length }}</strong>
      </article>
    </section>

    <section class="auto-config-panel panel">
      <header class="auto-panel-header">
        <span class="auto-panel-title">
          <el-icon><Connection /></el-icon>
          平台配置
        </span>
        <em>已启用：{{ enabledPlatformText }}</em>
      </header>

      <div class="platform-config-grid">
        <div class="platform-item">
          <div class="platform-switch-row">
            <el-switch v-model="mahuaConfig.enabled" size="small" active-text="麻花" @change="saveConfig" />
            <span>{{ isPlatformReady(mahuaConfig) ? '配置完整' : '待补全' }}</span>
          </div>
          <label class="platform-field">
            <span>Token</span>
            <el-input v-model="mahuaConfig.token" size="small" clearable placeholder="麻花 Token" @change="saveConfig" />
          </label>
          <label class="platform-field">
            <span>Cookie</span>
            <el-input v-model="mahuaConfig.cookie" size="small" clearable placeholder="麻花 Cookie" @change="saveConfig" />
          </label>
        </div>

        <div class="platform-item">
          <div class="platform-switch-row">
            <el-switch v-model="hahaConfig.enabled" size="small" active-text="哈哈" @change="saveConfig" />
            <span>{{ isPlatformReady(hahaConfig) ? '配置完整' : '待补全' }}</span>
          </div>
          <label class="platform-field">
            <span>Token</span>
            <el-input v-model="hahaConfig.token" size="small" clearable placeholder="哈哈 Token" @change="saveConfig" />
          </label>
          <label class="platform-field">
            <span>Cookie</span>
            <el-input v-model="hahaConfig.cookie" size="small" clearable placeholder="哈哈 Cookie（含 PHPSESSID）" @change="saveConfig" />
          </label>
        </div>
      </div>
    </section>

    <section class="auto-control-panel panel">
      <div class="auto-control-actions">
        <el-button :type="running ? 'danger' : 'primary'" :icon="running ? VideoPause : VideoPlay" @click="toggleService">
          {{ running ? '停止服务' : '启动服务' }}
        </el-button>
        <el-button plain :icon="Refresh" :loading="loading" :disabled="!running" @click="refreshOrders">
          立即刷新
        </el-button>
      </div>
      <div class="auto-control-info">
        <span>
          <el-icon :class="{ 'is-loading': running }"><Connection /></el-icon>
          轮询 {{ pollIntervalMs / 1000 }}s
        </span>
        <span>上次查询：{{ lastQueryTime || '--' }}</span>
      </div>
    </section>

    <section class="auto-board">
      <section class="auto-order-table-panel panel bidding-panel">
        <header class="auto-table-header">
          <div>
            <strong>竞价中订单</strong>
            <span>等待平台确认的订单</span>
          </div>
          <em>{{ biddingOrders.length }} 单</em>
        </header>
        <div class="auto-table-body">
          <el-table :data="biddingOrders" height="100%" stripe size="small" empty-text="暂无竞价中订单">
            <el-table-column prop="platform" label="平台" width="82">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ row.platform }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="orderId" label="订单号" width="168" show-overflow-tooltip />
            <el-table-column label="订单信息" min-width="320">
              <template #default="{ row }">
                <div class="auto-order-primary-cell">
                  <strong class="auto-order-primary-title">{{ row.movieName || '-' }}</strong>
                  <span class="auto-order-primary-meta">{{ row.cinemaName || '-' }}</span>
                  <span class="auto-order-primary-meta">{{ row.showDate || '-' }} {{ row.showTime || '' }} · {{ row.seats || '-' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="city" label="城市" width="92" show-overflow-tooltip />
            <el-table-column prop="price" label="金额" width="96" show-overflow-tooltip />
            <el-table-column prop="createTime" label="创建时间" width="150" show-overflow-tooltip />
          </el-table>
        </div>
      </section>

      <section class="auto-list-grid">
        <section class="auto-order-table-panel panel">
          <header class="auto-table-header">
            <div>
              <strong>待提交订单</strong>
              <span>已接入购票流程</span>
            </div>
            <em>{{ pendingOrders.length }} 单</em>
          </header>
          <div class="auto-table-body">
            <el-table :data="pendingOrders" height="100%" stripe size="small" empty-text="暂无待处理订单">
              <el-table-column prop="platform" label="平台" width="82">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ row.platform }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="orderId" label="订单号" width="160" show-overflow-tooltip />
              <el-table-column label="订单信息" min-width="280">
                <template #default="{ row }">
                  <div class="auto-order-primary-cell">
                    <strong class="auto-order-primary-title">{{ row.movieName || '-' }}</strong>
                    <span class="auto-order-primary-meta">{{ row.cinemaName || '-' }}</span>
                    <span class="auto-order-primary-meta">{{ row.showDate || '-' }} {{ row.showTime || '' }} · {{ row.seats || '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="price" label="金额" width="88" show-overflow-tooltip />
              <el-table-column label="进度" width="118">
                <template #default="{ row }">
                  <el-tag :type="statusTagType(row)" size="small">{{ row.step || '-' }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>

        <section class="auto-order-table-panel panel">
          <header class="auto-table-header">
            <div>
              <strong>完成记录</strong>
              <span>最近 100 条处理结果</span>
            </div>
            <em>{{ finishedOrders.length }} 条</em>
          </header>
          <div class="auto-table-body">
            <el-table :data="finishedOrders" height="100%" stripe size="small" empty-text="暂无已完成记录">
              <el-table-column prop="platform" label="平台" width="82">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain">{{ row.platform }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="orderId" label="订单号" width="160" show-overflow-tooltip />
              <el-table-column label="订单信息" min-width="280">
                <template #default="{ row }">
                  <div class="auto-order-primary-cell">
                    <strong class="auto-order-primary-title">{{ row.movieName || '-' }}</strong>
                    <span class="auto-order-primary-meta">{{ row.cinemaName || '-' }}</span>
                    <span class="auto-order-primary-meta">{{ row.showDate || '-' }} {{ row.showTime || '' }} · {{ row.seats || '-' }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="processTime" label="处理时间" width="150" show-overflow-tooltip />
              <el-table-column label="状态" width="92">
                <template #default="{ row }">
                  <el-tag :type="statusTagType(row)" size="small">{{ row.status === 'failed' ? '失败' : '成功' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip />
            </el-table>
          </div>
        </section>
      </section>
    </section>
  </section>
</template>

<style scoped>
.auto-order-workbench {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 86px auto auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  background: var(--bg-page, var(--app-bg));
  overflow: hidden;
}

.auto-status-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.panel {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.auto-status-card {
  min-width: 0;
  height: 86px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 12px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.auto-status-card span,
.auto-status-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-status-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 22px;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-status-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.auto-status-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.auto-status-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
}

.auto-status-card--red {
  border-color: var(--summary-red-border);
  background: var(--summary-red-bg);
}

.auto-config-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 14px;
  overflow: hidden;
}

.auto-panel-header,
.auto-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.auto-panel-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-primary, var(--app-text));
  font-size: 15px;
  font-weight: 700;
}

.auto-panel-title .el-icon {
  color: var(--app-accent);
}

.auto-panel-header em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.platform-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 120px minmax(150px, 0.7fr) minmax(220px, 1.3fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-light, var(--app-border));
  border-radius: 8px;
  background: var(--panel-soft-bg);
}

.platform-switch-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.platform-switch-row span {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-field {
  min-width: 0;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.platform-field span {
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.platform-field :deep(.el-input) {
  min-width: 0;
}

.auto-control-panel {
  min-width: 0;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  overflow: hidden;
}

.auto-control-actions,
.auto-control-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.auto-control-info {
  justify-content: flex-end;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
}

.auto-control-info span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-control-info .el-icon {
  color: #22c55e;
}

.auto-board {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(160px, 0.82fr) minmax(220px, 1fr);
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.auto-list-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.auto-order-table-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--app-surface);
}

.auto-table-header {
  min-height: 52px;
  flex-shrink: 0;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-light, var(--app-border));
}

.auto-table-header div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.auto-table-header strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 15px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-table-header span,
.auto-table-header em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.auto-table-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.auto-table-body :deep(.el-table) {
  height: 100%;
}

.auto-table-body :deep(.el-table__cell) {
  vertical-align: top;
}

.auto-order-primary-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.35;
}

.auto-order-primary-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary, var(--app-text));
  font-size: 13px;
  font-weight: 700;
}

.auto-order-primary-meta {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1480px) {
  .auto-status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: 82px;
  }

  .auto-order-workbench {
    grid-template-rows: auto auto auto minmax(0, 1fr);
  }

  .platform-config-grid,
  .auto-list-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-height: 760px) {
  .auto-order-workbench {
    grid-template-rows: 72px auto 54px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
  }

  .auto-status-card {
    height: 72px;
  }

  .auto-status-card strong {
    font-size: 20px;
  }

  .auto-config-panel {
    gap: 8px;
  }

  .platform-item {
    padding: 8px 10px;
  }

  .auto-board {
    grid-template-rows: minmax(120px, 0.72fr) minmax(170px, 1fr);
  }
}
</style>
