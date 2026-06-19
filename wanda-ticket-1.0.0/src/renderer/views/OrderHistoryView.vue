<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Refresh, Search } from '@element-plus/icons-vue'

import { useAccountsStore } from '@renderer/stores/accounts'
import { useOrdersStore } from '@renderer/stores/orders'
import type { OrderRecord } from '@shared/wandaTicketTypes'

const accountsStore = useAccountsStore()
const ordersStore = useOrdersStore()

function formatAmount(order: OrderRecord): string {
  return `￥${(Number.isFinite(order.amount) ? order.amount : 0).toFixed(2)}`
}

function handleSearch() {
  ordersStore.pageIndex = 1
  void ordersStore.loadOrders()
}

function handleQueryPayInfo(order: OrderRecord) {
  void ordersStore.queryOrderPayInfo(order)
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
    void ordersStore.loadOrders()
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

.table-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 0;
}
</style>
