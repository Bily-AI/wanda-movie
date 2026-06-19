<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh, Search } from '@element-plus/icons-vue'

import { useAccountsStore } from '@renderer/stores/accounts'
import { useOrdersStore } from '@renderer/stores/orders'
import type { OrderPayInfoResult, OrderRecord } from '@shared/wandaTicketTypes'

const accountsStore = useAccountsStore()
const ordersStore = useOrdersStore()
const payInfoDialogVisible = ref(false)
const payInfoOrder = ref<OrderRecord | null>(null)

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
  const directTicketInfo = firstListRecord(data.subTicketOrderInfo)
  const orderInf = firstListRecord(data.orderInf)
  const ticketInfo = firstListRecord(orderInf.subTicketOrderInfo)
  const source =
    Object.keys(ticketInfo).length > 0 ? ticketInfo : Object.keys(directTicketInfo).length > 0 ? directTicketInfo : data

  return source.payInfo ?? data.payInfo ?? raw.payInfo
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

function normalizeTextList(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? '').trim()).filter(Boolean) : []
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

const ticketCodes = computed(() => normalizeTextList(ordersStore.currentPayInfo?.ticketCodes))
const qrCodes = computed(() => normalizeTextList(ordersStore.currentPayInfo?.qrCodes))
const payInfoFields = computed(() => collectPayInfoFields(getPayInfoValue(ordersStore.currentPayInfo)))
const hasVisiblePayInfo = computed(
  () => ticketCodes.value.length > 0 || qrCodes.value.length > 0 || payInfoFields.value.length > 0
)
const payInfoDialogTitle = computed(() =>
  payInfoOrder.value?.orderNo ? `支付信息：${payInfoOrder.value.orderNo}` : '支付信息'
)

function formatAmount(order: OrderRecord): string {
  return `￥${(Number.isFinite(order.amount) ? order.amount : 0).toFixed(2)}`
}

function handleSearch() {
  ordersStore.pageIndex = 1
  payInfoDialogVisible.value = false
  payInfoOrder.value = null
  void ordersStore.loadOrders()
}

async function handleQueryPayInfo(order: OrderRecord) {
  payInfoOrder.value = order
  await ordersStore.queryOrderPayInfo(order)

  if (ordersStore.currentPayInfo) {
    payInfoDialogVisible.value = true
  }
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

onMounted(() => {
  void ordersStore.loadOrders()
})

watch(
  () => accountsStore.currentAccountId,
  () => {
    ordersStore.pageIndex = 1
    payInfoDialogVisible.value = false
    payInfoOrder.value = null
    void ordersStore.loadOrders()
  }
)

watch(
  () => ordersStore.currentPayInfo,
  (payInfo) => {
    if (!payInfo) {
      payInfoDialogVisible.value = false
    }
  }
)
</script>

<template>
  <section class="orders-page table-page">
    <header class="page-toolbar">
      <strong class="page-title">历史订单</strong>
      <el-input v-model="ordersStore.filters.keyword" placeholder="搜索手机号/订单号/影片..." :prefix-icon="Search" />
      <el-select v-model="ordersStore.filters.status" placeholder="订单状态" clearable value-on-clear="">
        <el-option label="待处理" value="pending" />
        <el-option label="已完成" value="completed" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-date-picker
        v-model="ordersStore.filters.dateRange"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
      />
      <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
      <el-button :icon="Refresh" :loading="ordersStore.loading" @click="ordersStore.loadOrders">刷新</el-button>
      <span class="toolbar-spacer" />
      <el-button type="success" :icon="Download" :disabled="ordersStore.loading" @click="handleExport">导出</el-button>
    </header>

    <section class="summary-grid">
      <div class="summary-card">
        <span>今日订单</span>
        <strong>{{ ordersStore.summary.today }}</strong>
      </div>
      <div class="summary-card summary-card--warning">
        <span>待处理</span>
        <strong>{{ ordersStore.summary.pending }}</strong>
      </div>
      <div class="summary-card summary-card--success">
        <span>已完成</span>
        <strong>{{ ordersStore.summary.completed }}</strong>
      </div>
      <div class="summary-card summary-card--danger">
        <span>总金额</span>
        <strong>{{ ordersStore.totalAmountText }}</strong>
      </div>
    </section>

    <section class="table-panel">
      <div class="table-filter-note">当前筛选仅作用于已加载页</div>
      <el-table
        v-loading="ordersStore.loading || ordersStore.detailLoading"
        :data="ordersStore.filteredOrders"
        height="100%"
        :empty-text="ordersStore.message || '暂无数据'"
      >
        <el-table-column prop="phone" label="手机号" min-width="120" />
        <el-table-column prop="orderNo" label="订单号" min-width="150" />
        <el-table-column prop="movieName" label="影片" min-width="150" />
        <el-table-column prop="cinema" label="影院" min-width="180" />
        <el-table-column prop="showtime" label="场次" min-width="160" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            {{ formatAmount(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="statusText" label="状态" width="100" />
        <el-table-column prop="createdAt" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              :disabled="ordersStore.loading || ordersStore.detailLoading"
              @click="handleQueryPayInfo(row)"
            >
              支付信息
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="payInfoDialogVisible" :title="payInfoDialogTitle" width="560px" destroy-on-close>
      <div v-if="ordersStore.currentPayInfo" class="pay-info-detail">
        <template v-if="hasVisiblePayInfo">
          <section v-if="ticketCodes.length > 0" class="pay-info-section">
            <span class="pay-info-label">取票码</span>
            <div class="pay-info-list">
              <el-tag v-for="(code, index) in ticketCodes" :key="`ticket-${index}-${code}`" type="success" effect="plain">
                {{ code }}
              </el-tag>
            </div>
          </section>

          <section v-if="qrCodes.length > 0" class="pay-info-section">
            <span class="pay-info-label">二维码</span>
            <div class="pay-info-list pay-info-list--block">
              <div v-for="(qrCode, index) in qrCodes" :key="`qr-${index}-${qrCode}`" class="pay-info-code">
                {{ qrCode }}
              </div>
            </div>
          </section>

          <section v-if="payInfoFields.length > 0" class="pay-info-section">
            <span class="pay-info-label">其他信息</span>
            <dl class="pay-info-fields">
              <div v-for="(field, index) in payInfoFields" :key="`${field.label}-${index}`" class="pay-info-field">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value }}</dd>
              </div>
            </dl>
          </section>
        </template>

        <el-empty v-else description="订单尚未出票或取票码暂不可用" :image-size="64" />
      </div>
    </el-dialog>

    <footer class="table-pagination">
      <el-pagination
        v-model:current-page="ordersStore.pageIndex"
        v-model:page-size="ordersStore.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="ordersStore.total"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="ordersStore.loadOrders"
        @current-change="ordersStore.loadOrders"
      />
    </footer>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 980px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px 104px minmax(0, 1fr) 44px;
  gap: 16px;
}

.page-toolbar {
  display: grid;
  grid-template-columns: 80px minmax(220px, 350px) 150px 330px 88px 88px minmax(16px, 1fr) 88px;
  gap: 10px;
  align-items: center;
}

.toolbar-spacer {
  min-width: 0;
}

.page-title {
  color: var(--app-text);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 18px 22px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
  color: var(--app-muted);
}

.summary-card strong {
  color: var(--app-accent);
  font-size: 28px;
  line-height: 1;
}

.summary-card--warning strong {
  color: #e6a23c;
}

.summary-card--success strong {
  color: #67c23a;
}

.summary-card--danger strong {
  color: #f56c6c;
}

.table-panel {
  min-height: 0;
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.table-filter-note {
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-muted);
  font-size: 12px;
}

.pay-info-detail {
  display: grid;
  gap: 16px;
}

.pay-info-section {
  display: grid;
  gap: 8px;
}

.pay-info-label {
  color: var(--app-muted);
  font-size: 12px;
}

.pay-info-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.pay-info-list--block {
  display: grid;
}

.pay-info-code,
.pay-info-field {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #f8fafc;
}

.pay-info-code {
  padding: 8px 10px;
  color: var(--app-text);
  line-height: 1.5;
  word-break: break-all;
}

.pay-info-fields {
  display: grid;
  gap: 8px;
  margin: 0;
}

.pay-info-field {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 10px;
  padding: 8px 10px;
}

.pay-info-field dt {
  color: var(--app-muted);
}

.pay-info-field dd {
  min-width: 0;
  margin: 0;
  color: var(--app-text);
  white-space: pre-wrap;
  word-break: break-all;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 0;
}
</style>
