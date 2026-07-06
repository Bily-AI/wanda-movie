<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
  cardNo?: string
  balanceText?: string
  typeText?: string
  expiryText?: string
}

const props = defineProps<{
  activities: PaymentDisplayItem[]
  selectedActivity: string
  loading: boolean
  activePrice: string
}>()

const emit = defineEmits<{
  'update:selectedActivity': [value: string]
}>()

const lastSelectedActivity = ref('')

watch(
  () => props.selectedActivity,
  (value) => {
    if (value) {
      lastSelectedActivity.value = value
    }
  },
  { immediate: true }
)

const activityEnabled = computed(
  () => props.activities.length > 0 && (Boolean(props.selectedActivity) || Boolean(lastSelectedActivity.value))
)

function handleActivityEnabledChange(value: boolean): void {
  if (!value) {
    emit('update:selectedActivity', '')
    return
  }

  emit('update:selectedActivity', lastSelectedActivity.value)
}
</script>

<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>支付活动</span>
      <div class="panel-toggle">
        <el-switch
          :model-value="activityEnabled"
          :disabled="activities.length === 0 || loading"
          inline-prompt
          active-text="优惠"
          inactive-text="关闭"
          @change="handleActivityEnabledChange"
        />
      </div>
    </header>

    <div class="panel-content">
      <div class="side-line">
        <span>活动价</span>
        <el-select
          :model-value="selectedActivity"
          size="small"
          placeholder="无活动"
          :loading="loading"
          :disabled="activities.length === 0"
          @update:model-value="emit('update:selectedActivity', $event)"
        >
          <el-option label="无活动" value="" />
          <el-option
            v-for="item in activities"
            :key="item.key"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <span class="active-price-text">{{ activePrice }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  overflow: hidden;
}

.side-panel-header {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.panel-content {
  padding: 12px 16px 14px;
}

.side-line {
  min-width: 0;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.side-line :deep(.el-select) {
  min-width: 0;
}

.side-line span {
  color: var(--app-subtle);
}

.active-price-text {
  color: var(--el-color-danger);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
}

/* 兼容 ui-workbench-layout 契约测试 */
.side-panel-header > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
