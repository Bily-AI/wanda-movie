<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useLogsStore } from '@renderer/stores/logs'

const PAGE_SIZE = 20

const logsStore = useLogsStore()
const logType = ref('')
const keyword = ref('')
const dateRange = ref<string[] | null>(null)
const currentPage = ref(1)

const typeLabelMap: Record<string, string> = {
  gift: '赠送兑换券',
  gift_buy: '礼包购买',
  ticket: '出票',
  cancel: '订单取消',
  refund: '退票',
  ocr: '图片识别'
}

const typeTagMap: Record<string, '' | 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
  gift: 'warning',
  gift_buy: 'success',
  ticket: 'success',
  cancel: 'info',
  refund: 'danger',
  ocr: 'primary'
}

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

watch([logType, keyword, dateRange], () => {
  currentPage.value = 1
})

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
  <div class="page-container">
    <div class="filter-bar">
      <el-select v-model="logType" placeholder="日志类型" size="default" clearable style="width: 150px">
        <el-option label="全部类型" value="" />
        <el-option label="赠送兑换券" value="gift" />
        <el-option label="礼包购买" value="gift_buy" />
        <el-option label="出票" value="ticket" />
        <el-option label="订单取消" value="cancel" />
        <el-option label="退票" value="refund" />
        <el-option label="图片识别" value="ocr" />
      </el-select>

      <el-input v-model="keyword" placeholder="搜索关键词..." size="default" clearable style="width: 220px" />

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        size="default"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        style="width: 260px"
      />

      <el-button :icon="Delete" size="default" @click="handleClearLogs">清空日志</el-button>

      <span class="filter-count">共 {{ filteredLogs.length }} 条记录</span>
    </div>

    <el-table
      :data="pagedLogs"
      size="default"
      stripe
      border
      empty-text="暂无日志记录"
      class="log-table"
      max-height="calc(100vh - 200px)"
    >
      <el-table-column prop="time" label="日期时间" width="170" sortable />
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag :type="typeTagMap[row.type]" effect="dark">
            {{ typeLabelMap[row.type] || row.type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="account" label="账号" width="140" />
      <el-table-column prop="detail" label="详情" min-width="300" show-overflow-tooltip />
    </el-table>

    <div v-if="filteredLogs.length > PAGE_SIZE" class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="PAGE_SIZE"
        layout="prev, pager, next, total"
        :total="filteredLogs.length"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-count {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 13px;
}

.log-table {
  flex: 1;
  min-height: 0;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
}
</style>
