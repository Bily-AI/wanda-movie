<script setup lang="ts">
import { Present, Refresh, Search } from '@element-plus/icons-vue'
</script>

<template>
  <section class="coupon-page table-page">
    <header class="page-toolbar">
      <div class="page-title">
        <el-icon><Present /></el-icon>
        <strong>兑换券</strong>
        <el-tag round>0</el-tag>
      </div>
      <span class="toolbar-spacer" />
      <el-button type="primary" disabled>绑定卡券</el-button>
      <el-button type="warning" disabled>批量赠送</el-button>
      <el-select placeholder="按名称筛选" />
      <el-select placeholder="按分类筛选" />
      <el-button>分类管理</el-button>
      <el-input placeholder="搜索关键词" :prefix-icon="Search" />
      <el-button>统计</el-button>
      <el-button :icon="Refresh">刷新</el-button>
    </header>

    <section class="table-panel">
      <el-table :data="[]" height="100%" empty-text="暂无数据">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="voucherNo" label="券号" min-width="170" />
        <el-table-column prop="couponNo" label="couponNo" min-width="170" />
        <el-table-column prop="name" label="券名称" min-width="180" />
        <el-table-column prop="type" label="类型" width="130" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="validity" label="有效期" min-width="180" />
        <el-table-column label="操作" width="140" />
      </el-table>
    </section>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 1100px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px minmax(0, 1fr);
  gap: 16px;
}

.page-toolbar {
  display: grid;
  grid-template-columns: auto minmax(12px, 1fr) 88px 88px 150px 150px 88px minmax(160px, 220px) 74px 78px;
  gap: 10px;
  align-items: center;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-size: 16px;
}

.page-title :deep(.el-icon) {
  color: var(--app-accent);
}

.toolbar-spacer {
  min-width: 0;
}

.table-panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}
</style>
