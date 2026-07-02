<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Present, Refresh, Search, Tickets } from '@element-plus/icons-vue'

import {
  createActivityGiftOrder,
  createActivityGiftPayment,
  fetchActivityDetail,
  fetchActivityList,
  fetchGiftOrders,
  type ActivityGiftPaymentResult,
  type ActivityGiftOrderRow,
  type ActivityGiftRow
} from '@renderer/services/featureApi'
import { openAlipayPayment } from '@renderer/services/alipayBridge'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTicketStore } from '@renderer/stores/ticket'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

interface PaymentDialogData extends ActivityGiftPaymentResult {
  title: string
}

const settingsStore = useSettingsStore()
const accountsStore = useAccountsStore()
const ticketStore = useTicketStore()
const logsStore = useLogsStore()
const activities = ref<ActivityGiftRow[]>([])
const manualActivities = ref<ActivityGiftRow[]>([])
const giftOrders = ref<ActivityGiftOrderRow[]>([])
const activityMessage = ref('')
const giftOrderMessage = ref('')
const giftOrderTotal = ref(0)
const loading = ref(false)
const loadingOrders = ref(false)
const buyingActivityCode = ref('')
const detailLoadingCode = ref('')
const buyingPaymentOrderId = ref('')
const openingAlipay = ref(false)
const giftQuantities = ref<Record<string, number>>({})
const detailDialogVisible = ref(false)
const paymentResultDialogVisible = ref(false)
const currentDetail = ref<unknown>(null)
const paymentResult = ref<PaymentDialogData | null>(null)

const cityOptions = computed(() => ticketStore.cities)
const cinemaOptions = computed(() =>
  ticketStore.cinemaRecords
    .filter((cinema) => !settingsStore.activity.city || cinema.cityId === settingsStore.activity.city)
    .map((cinema) => ({ label: cinema.name, value: cinema.id }))
)
const activityRows = computed(() => {
  const merged = [...manualActivities.value, ...activities.value]
  const seen = new Set<string>()

  return merged.filter((row) => {
    const key = getActivityCode(row)

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
})
const giftOrderRows = computed(() => giftOrders.value)
const currentAccountPhone = computed(() => accountsStore.currentAccount?.phone || '-')
const selectedCityName = computed(
  () => cityOptions.value.find((city) => city.value === settingsStore.activity.city)?.label || '未选择'
)
const selectedCinemaName = computed(
  () => cinemaOptions.value.find((cinema) => cinema.value === settingsStore.activity.cinema)?.label || '未选择影院'
)
const payableGiftOrderCount = computed(() => giftOrderRows.value.filter(canPayGiftOrder).length)
const paymentResultText = computed(() => {
  if (!paymentResult.value) {
    return ''
  }

  return JSON.stringify(
    {
      orderId: paymentResult.value.orderId,
      payId: paymentResult.value.payId,
      transactionId: paymentResult.value.transactionId,
      appPayParam: paymentResult.value.appPayParam,
      raw: paymentResult.value.raw
    },
    null,
    2
  )
})

function getCurrentAccount() {
  const account = accountsStore.currentAccount

  if (!account?.ck) {
    activities.value = []
    activityMessage.value = '请选择已登录的万达账号'
    return null
  }

  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return fallback
}

async function saveProxySettings() {
  await settingsStore.saveSettings()
}

async function loadActivities() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  if (!settingsStore.activity.cinema) {
    activityMessage.value = '请选择影院'
    activities.value = []
    return
  }

  loading.value = true
  activityMessage.value = ''

  try {
    await saveProxySettings()
    activities.value = await fetchActivityList(
      settingsStore.activity.cinema,
      account.ck,
      account.userIdentifier,
      settingsStore.useProxyIp
    )
    activityMessage.value = activities.value.length > 0 ? '' : '暂无可购买礼包'
    logsStore.addLog('活动', account.phone, `活动礼包加载成功：${activities.value.length} 个`)
    void loadGiftOrders()
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '活动礼包加载失败'
    activities.value = []
    activityMessage.value = message
    logsStore.addLog('活动', account.phone, `活动礼包加载失败：${message}`)
  } finally {
    loading.value = false
  }
}

function normalizeManualActivity(detail: unknown): ActivityGiftRow {
  const record = asRecord(detail)
  const listImage = asRecord(record.listImage)

  return {
    id: firstText(record.id, record.activityId, record.code, record.activityCode),
    code: firstText(record.activityCode, record.code, record.id),
    name: firstText(record.activityName, record.name, record.title),
    note: firstText(record.subTitle, record.desc, record.description, record.note),
    price: toNumber(record.unitPrice ?? record.price ?? record.salePrice ?? record.amount) / 100,
    raw: {
      ...record,
      imageUrl: firstText(listImage.imageUrl, record.imageUrl)
    }
  }
}

async function handleAppendActivityByCode() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const activityCode = settingsStore.activity.activityCode.trim()

  if (!activityCode) {
    activityMessage.value = '请输入礼包 ID'
    return
  }

  if (!settingsStore.activity.cinema) {
    activityMessage.value = '请选择影院'
    return
  }

  const exists = activityRows.value.some((row) => {
    const code = getActivityCode(row)
    return code === activityCode
  })

  if (exists) {
    ElMessage.info('该礼包已在列表中')
    settingsStore.activity.activityCode = ''
    return
  }

  loading.value = true

  try {
    await saveProxySettings()
    const detail = await fetchActivityDetail(
      settingsStore.activity.cinema,
      activityCode,
      account.ck,
      account.userIdentifier,
      settingsStore.useProxyIp
    )

    manualActivities.value.unshift(normalizeManualActivity(detail))
    settingsStore.activity.activityCode = ''
    ElMessage.success(`已添加礼包：${firstText(asRecord(detail).activityName, asRecord(detail).name, activityCode)}`)
    logsStore.addLog('活动', account.phone, `手动添加礼包成功：${activityCode}`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '获取详情失败'
    activityMessage.value = message
    ElMessage.error(message)
    logsStore.addLog('活动', account.phone, `手动添加礼包失败：${message}`)
  } finally {
    loading.value = false
  }
}

async function loadActivityDetail(activityCode = settingsStore.activity.activityCode) {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  if (!settingsStore.activity.cinema || !activityCode.trim()) {
    activityMessage.value = '请选择影院并输入礼包 ID'
    return
  }

  loading.value = true
  detailLoadingCode.value = activityCode.trim()

  try {
    await saveProxySettings()
    currentDetail.value = await fetchActivityDetail(
      settingsStore.activity.cinema,
      activityCode.trim(),
      account.ck,
      account.userIdentifier,
      settingsStore.useProxyIp
    )
    detailDialogVisible.value = true
    logsStore.addLog('活动', account.phone, `活动详情加载成功：${activityCode}`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '活动详情加载失败'
    activityMessage.value = message
    ElMessage.error(message)
    logsStore.addLog('活动', account.phone, `活动详情加载失败：${message}`)
  } finally {
    loading.value = false
    detailLoadingCode.value = ''
  }
}

function getActivityCode(row: ActivityGiftRow): string {
  return row.code || row.id
}

function getGiftQuantity(row: ActivityGiftRow): number {
  const activityCode = getActivityCode(row)
  return giftQuantities.value[activityCode] || 1
}

function setGiftQuantity(row: ActivityGiftRow, value: number | undefined) {
  const activityCode = getActivityCode(row)
  const quantity = Number(value)

  giftQuantities.value[activityCode] = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1
}

function getActivityRaw(row: ActivityGiftRow): Record<string, unknown> {
  return asRecord(row.raw)
}

function getActivityImage(row: ActivityGiftRow): string {
  const raw = getActivityRaw(row)
  const listImage = asRecord(raw.listImage)
  return firstText(listImage.imageUrl, raw.imageUrl, raw.picUrl, raw.cover)
}

function getActivityDescription(row: ActivityGiftRow): string {
  const raw = getActivityRaw(row)
  return firstText(raw.activityDesc, raw.subTitle, raw.desc, raw.note, row.note)
}

function getActivityTimeRange(row: ActivityGiftRow): string {
  const raw = getActivityRaw(row)
  const startTime = firstText(raw.startTime, raw.startDate)
  const endTime = firstText(raw.endTime, raw.endDate)

  if (startTime && endTime) {
    return `${startTime} ~ ${endTime}`
  }

  return startTime || endTime
}

function getActivityLimit(row: ActivityGiftRow): number {
  const raw = getActivityRaw(row)
  return toNumber(raw.userLimit, 2) || 2
}

function getActivityDisplayPrice(row: ActivityGiftRow): string {
  return `¥${(row.price * getGiftQuantity(row)).toFixed(2)}`
}

function getGiftOrderRaw(row: ActivityGiftOrderRow): Record<string, unknown> {
  return asRecord(row.raw)
}

function getGiftOrderStatusCode(row: ActivityGiftOrderRow): number {
  const raw = getGiftOrderRaw(row)
  return toNumber(raw.status, -1)
}

function getGiftOrderStatusType(row: ActivityGiftOrderRow): '' | 'warning' | 'success' | 'info' {
  const statusCode = getGiftOrderStatusCode(row)

  if (statusCode === 1) {
    return 'warning'
  }

  if (statusCode === 3) {
    return 'success'
  }

  if (statusCode === 2) {
    return 'info'
  }

  return ''
}

function canPayGiftOrder(row: ActivityGiftOrderRow): boolean {
  return getGiftOrderStatusCode(row) === 1
}

async function copyText(text: string, successText = '已复制') {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(successText)
  } catch {
    ElMessage.error('复制失败')
  }
}

async function loadGiftOrders() {
  const account = getCurrentAccount()

  if (!account) {
    giftOrders.value = []
    giftOrderTotal.value = 0
    return
  }

  loadingOrders.value = true
  giftOrderMessage.value = ''

  try {
    const result = await fetchGiftOrders(1, 20, account.ck, account.userIdentifier, settingsStore.useProxyIp)
    giftOrders.value = result.records
    giftOrderTotal.value = result.total
    giftOrderMessage.value = result.records.length > 0 ? '' : '暂无礼包订单'
    logsStore.addLog('活动', account.phone, `礼包订单加载成功：${result.records.length} 单`)
  } catch (error) {
    const message = getErrorMessage(error, '礼包订单加载失败')
    giftOrders.value = []
    giftOrderTotal.value = 0
    giftOrderMessage.value = message
    logsStore.addLog('活动', account.phone, `礼包订单加载失败：${message}`)
  } finally {
    loadingOrders.value = false
  }
}

function showGiftPaymentResult(title: string, result: ActivityGiftPaymentResult) {
  paymentResult.value = {
    ...result,
    title
  }
  paymentResultDialogVisible.value = true
}

async function handleCreateGiftPayment(orderId: string, title = '礼包订单支付参数') {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  buyingPaymentOrderId.value = orderId

  try {
    const result = await createActivityGiftPayment(orderId, account.ck, account.userIdentifier, settingsStore.useProxyIp)

    showGiftPaymentResult(title, result)
    ElMessage.success('支付参数已获取')
    logsStore.addLog('活动', account.phone, `礼包支付参数获取成功：${orderId}`)
  } catch (error) {
    const message = getErrorMessage(error, '礼包支付参数获取失败')
    activityMessage.value = message
    ElMessage.error(message)
    logsStore.addLog('活动', account.phone, `礼包支付参数获取失败：${message}`)
  } finally {
    buyingPaymentOrderId.value = ''
  }
}

async function handleOrderPayment(row: ActivityGiftOrderRow) {
  if (!row.orderId) {
    ElMessage.warning('礼包订单缺少订单号')
    return
  }

  await handleCreateGiftPayment(row.orderId)
}

async function handleBuyGift(row: ActivityGiftRow) {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  if (!settingsStore.activity.cinema) {
    activityMessage.value = '请选择影院'
    return
  }

  const activityCode = getActivityCode(row)

  if (!activityCode) {
    ElMessage.warning('礼包缺少 activityCode，无法下单')
    return
  }

  const goodsNum = getGiftQuantity(row)
  const orderAmount = Math.round(row.price * 100) * goodsNum
  buyingActivityCode.value = activityCode

  try {
    await saveProxySettings()
    const result = await createActivityGiftOrder(
      settingsStore.activity.cinema,
      activityCode,
      goodsNum,
      orderAmount,
      account.ck,
      account.userIdentifier,
      settingsStore.useProxyIp
    )
    ElMessage.success(`礼包订单创建成功：${result.orderId}`)
    logsStore.addLog('活动', account.phone, `礼包订单创建成功：${result.orderId}`)
    await loadGiftOrders()
    await handleCreateGiftPayment(result.orderId, '礼包购买支付参数')
  } catch (error) {
    const message = getErrorMessage(error, '礼包订单创建失败')
    activityMessage.value = message
    ElMessage.error(message)
    logsStore.addLog('活动', account.phone, `礼包订单创建失败：${message}`)
  } finally {
    buyingActivityCode.value = ''
  }
}

async function copyPaymentResult() {
  if (!paymentResultText.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(paymentResultText.value)
    ElMessage.success('支付参数已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中支付参数')
  }
}

async function handleOpenAlipayPayment() {
  if (!paymentResult.value?.appPayParam) {
    ElMessage.warning('缺少支付宝支付参数')
    return
  }

  openingAlipay.value = true

  try {
    const result = await openAlipayPayment(paymentResult.value.appPayParam, {
      requestParams: settingsStore.requestParams,
      autoPayment: settingsStore.autoPayment
    })
    ElMessage.success(result.reusedWindow ? '已刷新支付宝支付窗口' : '已打开支付宝支付窗口')
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '打开支付宝支付失败')
  } finally {
    openingAlipay.value = false
  }
}

function formatDetail(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

onMounted(() => {
  if (ticketStore.cities.length === 0) {
    void ticketStore.loadCityData()
  }

  void loadGiftOrders()
})

watch(
  () => settingsStore.activity.city,
  () => {
    settingsStore.activity.cinema = ''
    activities.value = []
    manualActivities.value = []
    void saveProxySettings()
  }
)

watch(
  () => settingsStore.activity.cinema,
  (cinemaId) => {
    activities.value = []
    manualActivities.value = []

    if (cinemaId) {
      void saveProxySettings()
      void loadActivities()
    }
  }
)

watch(
  () => accountsStore.currentAccountId,
  () => {
    void loadGiftOrders()
  }
)
</script>

<template>
  <section class="activity-page">
    <section class="activity-summary-grid" aria-label="活动摘要">
      <article class="activity-summary-card activity-summary-card--blue">
        <span>当前账号</span>
        <strong>{{ currentAccountPhone }}</strong>
        <em>{{ accountsStore.currentAccount?.statusText || '登录成功' }}</em>
      </article>
      <article class="activity-summary-card activity-summary-card--green">
        <span>当前影院</span>
        <strong>{{ selectedCityName }}</strong>
        <em>{{ selectedCinemaName }}</em>
      </article>
      <article class="activity-summary-card activity-summary-card--amber">
        <span>可购买礼包</span>
        <strong>{{ activityRows.length }}</strong>
        <em>手动添加 {{ manualActivities.length }} 个</em>
      </article>
      <article class="activity-summary-card">
        <span>礼包订单</span>
        <strong>{{ giftOrderTotal }}</strong>
        <em>待支付 {{ payableGiftOrderCount }} 单</em>
      </article>
    </section>

    <section class="activity-toolbar panel">
      <div class="activity-toolbar-section activity-toolbar-section--location">
        <span class="activity-toolbar-title">影院范围</span>
        <div class="activity-toolbar-row">
          <label class="activity-field">
            <span>城市</span>
            <el-select
              v-model="settingsStore.activity.city"
              class="activity-select activity-select--city"
              filterable
              default-first-option
              placeholder="选择城市"
            >
              <el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value" />
            </el-select>
          </label>
          <label class="activity-field activity-field--cinema">
            <span>影院</span>
            <el-select
              v-model="settingsStore.activity.cinema"
              class="activity-select"
              filterable
              default-first-option
              placeholder="选择影院"
            >
              <el-option v-for="cinema in cinemaOptions" :key="cinema.value" :label="cinema.label" :value="cinema.value" />
            </el-select>
          </label>
          <el-button type="primary" :icon="Refresh" :loading="loading || loadingOrders" @click="loadActivities">刷新礼包</el-button>
        </div>
      </div>

      <div class="activity-toolbar-section activity-toolbar-section--manual">
        <span class="activity-toolbar-title">手动礼包</span>
        <div class="activity-toolbar-row">
          <el-input v-model="settingsStore.activity.activityCode" placeholder="输入礼包ID/activityCode" />
          <el-button
            type="success"
            :icon="Search"
            :disabled="!settingsStore.activity.activityCode"
            :loading="loading"
            @click="handleAppendActivityByCode"
          >
            添加礼包
          </el-button>
        </div>
      </div>

      <div class="activity-toolbar-section activity-toolbar-section--proxy">
        <span class="activity-toolbar-title">代理设置</span>
        <div class="activity-toolbar-row">
          <el-input
            v-model="settingsStore.proxyApi"
            size="small"
            placeholder="代理提取 API，每次提取 1 个 IP，TXT 返回"
          />
          <div class="proxy-links">
            <a href="https://www.kuaidaili.com/" target="_blank" rel="noreferrer">快代理</a>
            <span>/</span>
            <a href="https://www.xiaoxiangdaili.com/" target="_blank" rel="noreferrer">小象代理</a>
          </div>
          <el-checkbox v-model="settingsStore.useProxyIp">使用代理IP</el-checkbox>
        </div>
      </div>
    </section>

    <section class="activity-workspace">
      <section class="panel gifts-panel">
        <header class="panel-title">
          <span>
            <el-icon><Present /></el-icon>
            可购买礼包
          </span>
          <em>{{ activityRows.length }} 个礼包</em>
        </header>
        <div v-loading="loading" class="panel-body">
          <div v-if="activityRows.length > 0" class="activity-list">
            <article
              v-for="row in activityRows"
              :key="getActivityCode(row)"
              class="activity-card"
            >
              <img v-if="getActivityImage(row)" :src="getActivityImage(row)" class="activity-card__image" alt="礼包图片" />
              <div v-else class="activity-card__image activity-card__image--empty">
                <el-icon><Present /></el-icon>
              </div>
              <div class="activity-card__body">
                <div class="activity-card__title">{{ row.name }}</div>
                <div v-if="getActivityDescription(row)" class="activity-card__desc">{{ getActivityDescription(row) }}</div>
                <div v-if="getActivityTimeRange(row)" class="activity-card__meta">{{ getActivityTimeRange(row) }}</div>
              </div>
              <div class="activity-card__actions">
                <el-button
                  size="small"
                  type="primary"
                  plain
                  :loading="detailLoadingCode === getActivityCode(row)"
                  @click="loadActivityDetail(getActivityCode(row))"
                >
                  查看详情
                </el-button>
                <el-input-number
                  class="quantity-input"
                  :model-value="getGiftQuantity(row)"
                  :min="1"
                  :max="getActivityLimit(row)"
                  size="small"
                  @change="setGiftQuantity(row, $event)"
                />
                <span class="activity-card__price">{{ getActivityDisplayPrice(row) }}</span>
                <el-popconfirm
                  width="240"
                  title="将创建真实礼包订单，确认购买？"
                  confirm-button-text="确认购买"
                  cancel-button-text="取消"
                  @confirm="handleBuyGift(row)"
                >
                  <template #reference>
                    <el-button
                      type="success"
                      size="small"
                      :disabled="!settingsStore.activity.cinema"
                      :loading="buyingActivityCode === getActivityCode(row)"
                    >
                      购买
                    </el-button>
                  </template>
                </el-popconfirm>
              </div>
            </article>
          </div>
          <div v-else class="panel-empty">
            <el-empty :description="activityMessage || '暂无活动'" />
          </div>
        </div>
      </section>

      <section class="panel order-panel">
        <header class="panel-title">
          <span>
            <el-icon><Tickets /></el-icon>
            我的礼包订单
          </span>
          <div class="order-title-actions">
            <em>共 {{ giftOrderTotal }} 单</em>
            <el-button size="small" :icon="Refresh" :loading="loadingOrders" @click="loadGiftOrders">
              刷新订单
            </el-button>
          </div>
        </header>
        <div v-loading="loadingOrders" class="panel-body">
          <div v-if="giftOrderRows.length > 0" class="order-list">
            <article v-for="row in giftOrderRows" :key="row.orderId" class="order-card">
              <div class="order-card__header">
                <div class="order-card__title">{{ row.subject }}</div>
                <el-tag :type="getGiftOrderStatusType(row)" size="small">{{ row.status }}</el-tag>
              </div>
              <div class="order-card__meta">
                <span>#{{ row.orderId }}</span>
                <span
                  v-if="row.activityCode"
                  class="order-card__code"
                  title="双击复制礼包ID"
                  @dblclick="copyText(row.activityCode, `已复制：${row.activityCode}`)"
                >
                  礼包ID：{{ row.activityCode }}
                </span>
                <span v-if="row.createdAt">{{ row.createdAt }}</span>
                <span>x{{ row.quantity }}</span>
              </div>
              <div class="order-card__footer">
                <strong>¥{{ row.totalPrice.toFixed(2) }}</strong>
                <el-button
                  v-if="canPayGiftOrder(row)"
                  size="small"
                  type="primary"
                  :loading="buyingPaymentOrderId === row.orderId"
                  @click="handleOrderPayment(row)"
                >
                  支付
                </el-button>
              </div>
            </article>
          </div>
          <div v-else class="panel-empty">
            <el-empty :description="giftOrderMessage || '暂无订单'" />
          </div>
        </div>
      </section>
    </section>

    <el-dialog v-model="detailDialogVisible" title="活动详情" width="680px">
      <pre class="detail-json">{{ formatDetail(currentDetail) }}</pre>
    </el-dialog>

    <el-dialog v-model="paymentResultDialogVisible" :title="paymentResult?.title || '支付参数'" width="720px">
      <el-descriptions v-if="paymentResult" :column="2" border>
        <el-descriptions-item label="订单号">{{ paymentResult.orderId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="payId">{{ paymentResult.payId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="交易ID">{{ paymentResult.transactionId || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-input class="raw-json" type="textarea" :rows="12" :model-value="paymentResultText" readonly />
      <template #footer>
        <el-popconfirm
          title="确认打开支付宝支付？如已开启自动支付，窗口可能尝试自动填写。"
          confirm-button-text="打开支付宝"
          cancel-button-text="取消"
          @confirm="handleOpenAlipayPayment"
        >
          <template #reference>
            <el-button :loading="openingAlipay" :disabled="!paymentResult?.appPayParam">
              打开支付宝支付
            </el-button>
          </template>
        </el-popconfirm>
        <el-button @click="paymentResultDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyPaymentResult">复制支付参数</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.activity-page {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 100px auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-page, var(--app-bg));
}

.activity-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.activity-summary-card {
  min-width: 0;
  height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
}

.activity-summary-card span,
.activity-summary-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-summary-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 22px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-summary-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.activity-summary-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.activity-summary-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
}

.activity-toolbar {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 10px 14px;
}

.activity-toolbar-section {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-toolbar-section--location {
  flex: 1 1 620px;
}

.activity-toolbar-section--manual {
  flex: 0 1 350px;
}

.activity-toolbar-section--proxy {
  flex: 1 1 425px;
}

.activity-toolbar-title {
  flex: 0 0 auto;
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  line-height: 32px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-toolbar-row {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.activity-toolbar-section--manual .activity-toolbar-row,
.activity-toolbar-section--proxy .activity-toolbar-row {
  justify-content: flex-start;
}

.activity-toolbar-row :deep(.el-input) {
  min-width: 0;
}

.activity-field {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  white-space: nowrap;
}

.activity-field--cinema {
  flex: 1;
}

.activity-select {
  min-width: 0;
  width: 100%;
}

.activity-select--city {
  width: 160px;
}

.activity-field--cinema .activity-select {
  width: 100%;
}

.activity-workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.36fr);
  gap: 12px;
}

.panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}

.panel.activity-toolbar {
  flex-direction: row;
  align-content: center;
}

.gifts-panel {
  min-height: 0;
}

.order-panel {
  min-height: 0;
}

.panel-title {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-title > span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.panel-title .el-icon {
  color: var(--wanda-primary);
}

.panel-title em,
.order-title-actions em {
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  font-weight: 400;
  white-space: nowrap;
}

.order-title-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.proxy-links {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.proxy-links a {
  color: var(--el-color-primary);
  text-decoration: none;
}

.proxy-links a:hover {
  text-decoration: underline;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  background: #fff;
}

.panel-empty {
  height: 100%;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.activity-list,
.order-list {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.activity-card,
.order-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--summary-blue-bg);
  box-shadow: var(--shadow-panel);
}

.activity-card__image {
  width: 104px;
  height: 104px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  background: #f3f6fb;
}

.activity-card__image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 28px;
}

.activity-card__body {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.activity-card__title,
.order-card__title {
  overflow: hidden;
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-card__desc {
  overflow: hidden;
  color: var(--app-subtle);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.activity-card__meta,
.order-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--app-subtle);
  font-size: 13px;
}

.activity-card__actions {
  width: 148px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  align-self: center;
}

.activity-card__price {
  width: 100%;
  color: var(--el-color-danger);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.order-card {
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: #fff;
}

.order-card__header,
.order-card__footer {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.order-card__footer strong {
  color: var(--el-color-danger);
  font-size: 16px;
  line-height: 1;
}

.order-card__code {
  cursor: pointer;
}

.order-card__code:hover {
  color: var(--el-color-primary);
}

.quantity-input {
  width: 96px;
}

.detail-json {
  max-height: 520px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 6px;
  background: #f8fafc;
  color: var(--app-text);
  white-space: pre-wrap;
  word-break: break-all;
}

.raw-json {
  margin-top: 14px;
}

@media (max-width: 1480px) {
  .activity-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .activity-page {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .activity-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .gifts-panel {
    min-height: 300px;
  }

  .order-panel {
    min-height: 300px;
  }
}

@media (max-width: 760px) {
  .activity-summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .activity-toolbar-row {
    align-items: stretch;
    flex-direction: column;
  }

  .activity-field {
    align-items: flex-start;
    flex-direction: column;
  }

  .activity-select,
  .activity-field--cinema .activity-select,
  .activity-select--city,
  .activity-toolbar-row .el-button {
    width: 100%;
  }

  .activity-card {
    flex-direction: column;
  }

  .activity-card__image {
    width: 100%;
    height: 160px;
  }

  .activity-card__actions {
    width: 100%;
    justify-content: flex-start;
  }

  .activity-card__price {
    width: auto;
  }
}

@media (max-height: 720px) {
  .activity-page {
    gap: 10px;
    padding: 12px;
  }

  .activity-summary-card {
    height: 88px;
    padding: 12px 14px;
  }

  .activity-summary-card strong {
    font-size: 20px;
  }

  .activity-card__image {
    width: 88px;
    height: 88px;
  }
}
</style>
