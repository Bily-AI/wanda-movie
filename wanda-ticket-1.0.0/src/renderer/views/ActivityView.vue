<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue'
</script>

<template>
  <section class="activity-page">
    <header class="activity-toolbar">
      <span>选择城市/影院：</span>
      <el-select placeholder="城市" />
      <el-select placeholder="影院" />
      <el-button type="primary" :icon="Refresh">刷新</el-button>
      <el-input placeholder="输入礼包ID/activityCode" />
      <el-button type="success" :icon="Search" disabled>获取详情</el-button>
    </header>

    <section class="panel gifts-panel">
      <header class="panel-title">
        <span>可购买礼包</span>
        <div class="proxy-row">
          <el-input size="small" placeholder="代理提取API" />
          <el-checkbox>使用代理IP</el-checkbox>
        </div>
      </header>
      <el-empty description="请选择城市和影院后加载活动礼包" />
    </section>

    <section class="panel order-panel">
      <header class="panel-title">
        <span>我的礼包订单（共 0 单）</span>
        <el-button size="small" :icon="Refresh">刷新订单</el-button>
      </header>
      <el-empty description="暂无订单" />
    </section>
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
</style>
