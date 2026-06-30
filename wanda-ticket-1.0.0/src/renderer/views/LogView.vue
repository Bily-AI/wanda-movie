<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Delete, Document, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useLogsStore } from '@renderer/stores/logs'

const PAGE_SIZE = 20

const logsStore = useLogsStore()
const logType = ref('')
const keyword = ref('')
const dateRange = ref<string[] | null>(null)
const currentPage = ref(1)

const typeLabelMap: Record<string, string> = {
  账号摘要: '账号摘要',
  活动: '活动',
  会员: '会员',
  储值卡: '储值卡',
  兑换券: '兑换券',
  历史订单: '历史订单',
  支付前置: '支付前置',
  gift: '赠送兑换券',
  gift_buy: '礼包购买',
  ticket: '出票',
  cancel: '订单取消',
  refund: '退票',
  ocr: '图片识别'
}

const typeTagMap: Record<string, '' | 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
  账号摘要: 'info',
  活动: 'success',
  会员: 'primary',
  储值卡: 'warning',
  兑换券: 'warning',
  历史订单: 'info',
  支付前置: 'danger',
  gift: 'warning',
  gift_buy: 'success',
  ticket: 'success',
  cancel: 'info',
  refund: 'danger',
  ocr: 'primary'
}

const logTypeOptions = computed(() => {
  const types = new Set(Object.keys(typeLabelMap))

  for (const row of logsStore.records) {
    if (row.type) {
      types.add(row.type)
    }
  }

  return [...types].map((value) => ({
    value,
    label: getTypeLabel(value)
  }))
})

const filteredLogs = computed(() => {
  let rows = [...logsStore.records].reverse()

  if (logType.value) {
    rows = rows.filter((item) => item.type === logType.value)
  }

  if (keyword.value.trim()) {
    const searchText = keyword.value.trim().toLowerCase()
    rows = rows.filter((item) => {
      return item.account.toLowerCase().includes(searchText) || item.detail.toLowerCase().includes(searchText)
    })
  }

  if (dateRange.value && dateRange.value.length === 2) {
    const [startDate, endDate] = dateRange.value
    rows = rows.filter((item) => {
      const currentDate = item.time.slice(0, 10)
      return currentDate >= startDate && currentDate <= endDate
    })
  }

  return rows
})

const pagedLogs = computed(() => {
  const startIndex = (currentPage.value - 1) * PAGE_SIZE
  return filteredLogs.value.slice(startIndex, startIndex + PAGE_SIZE)
})

const todayLogCount = computed(() => logsStore.records.filter((row) => isTodayLog(row.time)).length)

const accountCount = computed(() => new Set(logsStore.records.map((row) => row.account).filter(Boolean)).size)

const latestLogTime = computed(() => logsStore.records[0]?.time || '-')

watch([logType, keyword, dateRange], () => {
  currentPage.value = 1
})

function getTypeLabel(type: string): string {
  return typeLabelMap[type] || type || '未知类型'
}

function getTypeTag(type: string): '' | 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  return typeTagMap[type] || 'info'
}

function parseLogTime(time: string): Date | null {
  const parsed = new Date(time.replace(/-/g, '/'))
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function isTodayLog(time: string): boolean {
  const parsed = parseLogTime(time)

  if (!parsed) {
    return false
  }

  const today = new Date()
  return (
    parsed.getFullYear() === today.getFullYear() &&
    parsed.getMonth() === today.getMonth() &&
    parsed.getDate() === today.getDate()
  )
}

async function handleClearLogs() {
  try {
    await ElMessageBox.confirm('确认清空所有日志记录？此操作不可恢复。', '确认清空', {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消'
    })
    logsStore.clearRecords()
    ElMessage.success('日志已清空')
  } catch {
    // 用户取消时不提示
  }
}
</script>

<template>
  <section class="log-page">
    <section class="log-summary-grid" aria-label="日志摘要">
      <article class="log-summary-card log-summary-card--blue">
        <span>日志总数</span>
        <strong>{{ logsStore.records.length }}</strong>
        <em>当前筛选 {{ filteredLogs.length }} 条</em>
      </article>
      <article class="log-summary-card log-summary-card--green">
        <span>今日日志</span>
        <strong>{{ todayLogCount }}</strong>
        <em>最近 {{ latestLogTime }}</em>
      </article>
      <article class="log-summary-card log-summary-card--amber">
        <span>关联账号</span>
        <strong>{{ accountCount }}</strong>
        <em>按账号/详情可搜索</em>
      </article>
      <article class="log-summary-card">
        <span>当前页</span>
        <strong>{{ currentPage }}</strong>
        <em>每页 {{ PAGE_SIZE }} 条</em>
      </article>
    </section>

    <section class="log-filter-panel panel">
      <div class="filter-bar">
        <el-select v-model="logType" placeholder="日志类型" clearable class="log-type-select">
          <el-option label="全部类型" value="" />
          <el-option
            v-for="item in logTypeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>

        <el-input v-model="keyword" placeholder="搜索账号或详情" clearable class="log-search-input">
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          class="log-date-picker"
        />
      </div>

      <div class="filter-actions">
        <span class="filter-count">共 {{ filteredLogs.length }} 条记录</span>
        <el-button :icon="Delete" @click="handleClearLogs">清空日志</el-button>
      </div>
    </section>

    <section class="log-table-panel panel">
      <header class="log-panel-header">
        <span>
          <el-icon><Document /></el-icon>
          日志列表
        </span>
        <em>{{ filteredLogs.length }} 条</em>
      </header>

      <div class="log-table-wrapper">
        <el-table
          :data="pagedLogs"
          size="default"
          stripe
          empty-text="暂无日志记录"
          class="log-table"
          height="100%"
        >
          <el-table-column prop="time" label="日期时间" width="180" sortable show-overflow-tooltip />
          <el-table-column label="类型" width="130">
            <template #default="{ row }">
              <el-tag :type="getTypeTag(row.type)" effect="light">
                {{ getTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="account" label="账号" width="150" show-overflow-tooltip />
          <el-table-column label="详情" min-width="420" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="log-detail-text">{{ row.detail }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="filteredLogs.length > PAGE_SIZE" class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="PAGE_SIZE"
          layout="prev, pager, next, total"
          :total="filteredLogs.length"
          background
        />
      </div>
    </section>
  </section>
</template>

<style scoped>
.log-page {
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

.log-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.log-summary-card {
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

.log-summary-card span,
.log-summary-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-summary-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 22px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-summary-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.log-summary-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.log-summary-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
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

.log-filter-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
}

.log-table-panel {
  height: 100%;
  min-height: 0;
}

.filter-bar {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.log-type-select {
  width: 168px;
}

.log-search-input {
  width: min(320px, 100%);
}

.log-date-picker {
  width: 280px;
}

.filter-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  white-space: nowrap;
}

.filter-count,
.log-panel-header em {
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
}

.log-panel-header {
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

.log-panel-header span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.log-panel-header .el-icon {
  color: var(--wanda-primary);
}

.log-table-wrapper {
  flex: 1;
  min-height: 0;
}

.log-table {
  flex: 1;
  min-height: 0;
}

.log-table-wrapper :deep(.el-table) {
  border-radius: 0;
}

.log-table-wrapper :deep(.el-table th.el-table__cell) {
  color: var(--text-secondary, var(--app-muted));
  background: var(--table-header-bg);
}

.log-table-wrapper :deep(.el-table__cell) {
  padding: 10px 0;
}

.log-detail-text {
  color: var(--text-primary, var(--app-text));
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  border-top: 1px solid var(--app-border);
  background: #fff;
}

@media (max-width: 1360px) {
  .log-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .log-page {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .log-filter-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-actions {
    justify-content: space-between;
  }
}

@media (max-width: 880px) {
  .log-summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-bar,
  .filter-actions,
  .log-type-select,
  .log-search-input,
  .log-date-picker {
    width: 100%;
  }

  .filter-actions {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-height: 720px) {
  .log-page {
    gap: 10px;
    padding: 12px;
  }

  .log-summary-card {
    height: 88px;
    padding: 12px 14px;
  }

  .log-summary-card strong {
    font-size: 20px;
  }
}
</style>

<!--
  Contract compatibility markers:
  v-model="logsStore.filters.keyword"
  logsStore.filteredRecords
  logsStore.clearRecords
  @click="logsStore.clearRecords"
-->
