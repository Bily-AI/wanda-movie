<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'

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
const giftOrders = ref<ActivityGiftOrderRow[]>([])
const activityMessage = ref('')
const giftOrderMessage = ref('')
const giftOrderTotal = ref(0)
const loading = ref(false)
const loadingOrders = ref(false)
const buyingActivityCode = ref('')
const buyingPaymentOrderId = ref('')
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
const activityRows = computed(() => activities.value)
const giftOrderRows = computed(() => giftOrders.value)
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
    activities.value = await fetchActivityList(settingsStore.activity.cinema, account.ck, account.userIdentifier)
    activityMessage.value = activities.value.length > 0 ? '' : '暂无可购买礼包'
    logsStore.addLog('活动', account.phone, `活动礼包加载成功：${activities.value.length} 个`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '活动礼包加载失败'
    activities.value = []
    activityMessage.value = message
    logsStore.addLog('活动', account.phone, `活动礼包加载失败：${message}`)
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

  try {
    currentDetail.value = await fetchActivityDetail(
      settingsStore.activity.cinema,
      activityCode.trim(),
      account.ck,
      account.userIdentifier
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
    const result = await fetchGiftOrders(1, 20, account.ck, account.userIdentifier)
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
    const result = await createActivityGiftPayment(orderId, account.ck, account.userIdentifier)

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
    const result = await createActivityGiftOrder(
      settingsStore.activity.cinema,
      activityCode,
      goodsNum,
      orderAmount,
      account.ck,
      account.userIdentifier
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
    <header class="activity-toolbar">
      <span>选择城市/影院：</span>
      <el-select
        v-model="settingsStore.activity.city"
        filterable
        default-first-option
        placeholder="城市"
      >
        <el-option v-for="city in cityOptions" :key="city.value" :label="city.label" :value="city.value" />
      </el-select>
      <el-select
        v-model="settingsStore.activity.cinema"
        filterable
        default-first-option
        placeholder="影院"
      >
        <el-option v-for="cinema in cinemaOptions" :key="cinema.value" :label="cinema.label" :value="cinema.value" />
      </el-select>
      <el-button type="primary" :icon="Refresh" :loading="loading" @click="loadActivities">刷新</el-button>
      <el-input v-model="settingsStore.activity.activityCode" placeholder="输入礼包ID/activityCode" />
      <el-button
        type="success"
        :icon="Search"
        :disabled="!settingsStore.activity.activityCode"
        :loading="loading"
        @click="loadActivityDetail()"
      >
        获取详情
      </el-button>
    </header>

    <section class="panel gifts-panel">
      <header class="panel-title">
        <span>可购买礼包</span>
        <div class="proxy-row">
          <el-input v-model="settingsStore.proxyApi" size="small" placeholder="代理提取API" />
          <el-checkbox v-model="settingsStore.useProxyIp">使用代理IP</el-checkbox>
        </div>
      </header>
      <el-table v-loading="loading" :data="activityRows" height="100%" :empty-text="activityMessage || '暂无活动礼包'">
        <el-table-column prop="name" label="礼包名称" min-width="220" />
        <el-table-column prop="note" label="说明" min-width="280" />
        <el-table-column label="价格" width="110">
          <template #default="{ row }">¥{{ row.price.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="数量" width="120">
          <template #default="{ row }">
            <el-input-number
              class="quantity-input"
              :model-value="getGiftQuantity(row)"
              :min="1"
              :max="20"
              size="small"
              controls-position="right"
              @change="setGiftQuantity(row, $event)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="loadActivityDetail(row.code || row.id)">查看详情</el-button>
            <el-popconfirm
              width="240"
              title="将创建真实礼包订单，确认购买？"
              confirm-button-text="确认购买"
              cancel-button-text="取消"
              @confirm="handleBuyGift(row)"
            >
              <template #reference>
                <el-button
                  link
                  type="success"
                  :disabled="!settingsStore.activity.cinema"
                  :loading="buyingActivityCode === getActivityCode(row)"
                >
                  购买
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel order-panel">
      <header class="panel-title">
        <span>我的礼包订单（共 {{ giftOrderTotal }} 单）</span>
        <el-button size="small" :icon="Refresh" :loading="loadingOrders" @click="loadGiftOrders">
          刷新订单
        </el-button>
      </header>
      <el-table
        v-loading="loadingOrders"
        :data="giftOrderRows"
        height="100%"
        :empty-text="giftOrderMessage || '暂无订单'"
      >
        <el-table-column prop="orderId" label="订单号" min-width="180" show-overflow-tooltip />
        <el-table-column prop="subject" label="礼包" min-width="220" show-overflow-tooltip />
        <el-table-column prop="activityCode" label="activityCode" min-width="150" show-overflow-tooltip />
        <el-table-column prop="quantity" label="数量" width="80" />
        <el-table-column label="金额" width="110">
          <template #default="{ row }">¥{{ row.totalPrice.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="createdAt" label="创建时间" min-width="170" show-overflow-tooltip />
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :loading="buyingPaymentOrderId === row.orderId"
              @click="handleOrderPayment(row)"
            >
              支付参数
            </el-button>
          </template>
        </el-table-column>
      </el-table>
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
        <el-button @click="paymentResultDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyPaymentResult">复制支付参数</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.activity-page {
  min-width: 980px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px minmax(280px, 1fr) minmax(240px, 1fr);
  gap: 16px;
}

.activity-toolbar {
  display: grid;
  grid-template-columns: auto 180px minmax(240px, 360px) 88px minmax(220px, 280px) 108px;
  gap: 10px;
  align-items: center;
}

.panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
  overflow: hidden;
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

.proxy-row {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: var(--app-subtle);
  font-weight: 400;
}

.quantity-input {
  width: 86px;
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
</style>
