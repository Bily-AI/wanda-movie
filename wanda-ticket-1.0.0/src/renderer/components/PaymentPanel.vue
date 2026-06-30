<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
}

const props = defineProps<{
  activities: PaymentDisplayItem[]
  selectedActivity: string
  loading: boolean
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

const activityEnabled = computed(() => props.activities.length > 0 && (Boolean(props.selectedActivity) || Boolean(lastSelectedActivity.value)))

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
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  overflow: hidden;
  padding: 0 0 12px;
}

.side-panel-header {
  min-width: 0;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.side-panel-header > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.side-line {
  min-width: 0;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 14px 16px 0;
}

.side-line :deep(.el-select) {
  min-width: 0;
}

.side-line span {
  color: var(--app-subtle);
}
</style>
