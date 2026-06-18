<script setup lang="ts">
import { Medal, Refresh, Trophy } from '@element-plus/icons-vue'
</script>

<template>
  <section class="member-page">
    <el-tabs model-value="rtime" class="member-tabs">
      <el-tab-pane label="Rtime会员" name="rtime" />
      <el-tab-pane label="W+会员" name="wplus" />
    </el-tabs>

    <section class="member-panel">
      <header class="section-header">
        <span>
          <el-icon><Medal /></el-icon>
          Rtime 会员信息
        </span>
        <el-button type="warning" :icon="Refresh" disabled>一键领取</el-button>
      </header>

      <el-descriptions class="member-desc" border :column="2">
        <el-descriptions-item label="用户名">未选择账号</el-descriptions-item>
        <el-descriptions-item label="当前等级">-</el-descriptions-item>
      </el-descriptions>

      <section class="sign-panel">
        <div class="sign-title">
          <span>每日签到</span>
          <strong>连续签到 0 天</strong>
        </div>
        <div class="sign-track">
          <span>今日</span>
          <span>明日</span>
          <span>3日</span>
          <span>4日</span>
          <span>5日</span>
          <span>6日</span>
          <span>7日</span>
        </div>
      </section>

      <section class="level-panel">
        <header>
          <span>
            <el-icon><Trophy /></el-icon>
            全部等级 (0)
          </span>
        </header>
        <el-empty description="选择万达账号后加载会员数据" />
      </section>
    </section>
  </section>
</template>

<style scoped>
.member-page {
  min-width: 980px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.member-tabs {
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
}

.member-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
}

.section-header,
.level-panel header,
.sign-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text);
  font-weight: 700;
}

.section-header span,
.level-panel header span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-header :deep(.el-icon),
.level-panel :deep(.el-icon) {
  color: var(--app-accent);
}

.member-desc {
  width: 100%;
}

.sign-panel {
  padding: 18px 22px;
  border: 1px solid #f0d8a3;
  border-radius: 8px;
  background: #fff8ec;
}

.sign-title strong {
  color: #f56c6c;
}

.sign-track {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-top: 20px;
  color: var(--app-muted);
  text-align: center;
}

.sign-track span {
  min-height: 38px;
  display: grid;
  place-items: center;
  border-radius: 18px;
  background: #fff;
  color: #e6a23c;
  font-weight: 600;
}

.level-panel {
  flex: 1;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
