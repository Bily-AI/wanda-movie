<script setup lang="ts">
import { Download, Refresh, Search } from '@element-plus/icons-vue'
</script>

<template>
  <section class="orders-page table-page">
    <header class="page-toolbar">
      <strong class="page-title">历史订单</strong>
      <el-input placeholder="搜索手机号/订单号/影片..." :prefix-icon="Search" />
      <el-select placeholder="订单状态" />
      <el-date-picker type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" />
      <el-button type="primary" :icon="Search">搜索</el-button>
      <el-button :icon="Refresh">刷新</el-button>
      <span class="toolbar-spacer" />
      <el-button type="success" :icon="Download">导出</el-button>
    </header>

    <section class="summary-grid">
      <div class="summary-card">
        <span>今日订单</span>
        <strong>0</strong>
      </div>
      <div class="summary-card summary-card--warning">
        <span>待处理</span>
        <strong>0</strong>
      </div>
      <div class="summary-card summary-card--success">
        <span>已完成</span>
        <strong>0</strong>
      </div>
      <div class="summary-card summary-card--danger">
        <span>总金额</span>
        <strong>¥0.00</strong>
      </div>
    </section>

    <section class="table-panel">
      <el-table :data="[]" height="100%" empty-text="暂无数据">
        <el-table-column prop="phone" label="手机号" min-width="120" />
        <el-table-column prop="orderNo" label="订单号" min-width="150" />
        <el-table-column prop="movie" label="影片" min-width="150" />
        <el-table-column prop="cinema" label="影院" min-width="180" />
        <el-table-column prop="showtime" label="场次" min-width="160" />
        <el-table-column prop="amount" label="金额" width="100" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="createdAt" label="创建时间" min-width="160" />
        <el-table-column label="操作" width="120" />
      </el-table>
    </section>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 980px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px 104px minmax(0, 1fr);
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
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}
</style>
