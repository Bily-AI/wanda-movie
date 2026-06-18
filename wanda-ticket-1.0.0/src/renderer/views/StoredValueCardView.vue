<script setup lang="ts">
import { CreditCard, Refresh, ShoppingCart } from '@element-plus/icons-vue'
</script>

<template>
  <section class="card-page table-page">
    <header class="page-toolbar">
      <div class="page-title">
        <el-icon><CreditCard /></el-icon>
        <strong>储值卡</strong>
        <el-tag round>0</el-tag>
      </div>
      <span class="toolbar-spacer" />
      <span class="total-text">总额: ¥0.00</span>
      <el-button>卡片</el-button>
      <el-button type="success" :icon="ShoppingCart" disabled>购买储值卡</el-button>
      <el-button type="warning" disabled>获取全部账号支付卡</el-button>
      <el-button :icon="Refresh">刷新</el-button>
    </header>

    <section class="table-panel">
      <el-table :data="[]" height="100%" empty-text="暂无数据">
        <el-table-column prop="holder" label="持有人" min-width="150" />
        <el-table-column prop="name" label="卡名称" min-width="220" />
        <el-table-column prop="cardNo" label="卡号" min-width="210" />
        <el-table-column prop="balance" label="余额" width="120" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="操作" width="180" />
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
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-size: 16px;
}

.page-title :deep(.el-icon),
.total-text {
  color: var(--app-accent);
}

.toolbar-spacer {
  flex: 1;
}

.total-text {
  font-weight: 700;
}

.table-panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}
</style>
