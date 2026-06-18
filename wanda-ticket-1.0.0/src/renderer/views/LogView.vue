<script setup lang="ts">
import { Delete, Search } from '@element-plus/icons-vue'
</script>

<template>
  <section class="log-page table-page">
    <header class="page-toolbar">
      <el-select placeholder="日志类型" />
      <el-input placeholder="搜索关键词..." :prefix-icon="Search" />
      <el-date-picker type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
      <el-button :icon="Delete" disabled>清空日志</el-button>
      <span class="record-count">共 0 条记录</span>
    </header>

    <section class="table-panel">
      <el-table :data="[]" height="100%" empty-text="暂无日志记录">
        <el-table-column prop="time" label="日期时间" min-width="180" sortable />
        <el-table-column prop="type" label="类型" width="140" />
        <el-table-column prop="account" label="账号" min-width="180" />
        <el-table-column prop="detail" label="详情" min-width="420" />
      </el-table>
    </section>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 980px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px minmax(0, 1fr);
  gap: 16px;
}

.page-toolbar {
  display: grid;
  grid-template-columns: 160px 260px 420px 110px auto;
  gap: 10px;
  align-items: center;
}

.record-count {
  color: var(--app-muted);
}

.table-panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}
</style>
