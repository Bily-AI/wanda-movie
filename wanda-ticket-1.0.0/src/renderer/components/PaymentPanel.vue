<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  priceText?: string
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

function parseActivityPrice(value?: string): number {
  const price = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  return Number.isFinite(price) ? price : Number.POSITIVE_INFINITY
}

function findCheapestActivity(activities: PaymentDisplayItem[]): PaymentDisplayItem | null {
  if (activities.length === 0) {
    return null
  }

  return activities.reduce((cheapest, activity) =>
    parseActivityPrice(activity.priceText) < parseActivityPrice(cheapest.priceText) ? activity : cheapest
  )
}

watch(
  () => props.selectedActivity,
  (value) => {
    if (value) {
      lastSelectedActivity.value = value
    }
  },
  { immediate: true }
)

watch(
  () => props.activities,
  (activities) => {
    if (activities.length === 0) {
      lastSelectedActivity.value = ''

      if (props.selectedActivity) {
        emit('update:selectedActivity', '')
      }

      return
    }

    if (activities.some((item) => item.value === props.selectedActivity)) {
      return
    }

    const defaultActivity = findCheapestActivity(activities)

    if (defaultActivity) {
      lastSelectedActivity.value = defaultActivity.value
      emit('update:selectedActivity', defaultActivity.value)
    }
  },
  { immediate: true }
)

const activityEnabled = computed(() => props.activities.length > 0 && Boolean(props.selectedActivity))
const selectedActivityItem = computed(() => props.activities.find((item) => item.value === props.selectedActivity) ?? null)
const cheapestActivity = computed(() => findCheapestActivity(props.activities))
const displayPriceText = computed(() => selectedActivityItem.value?.priceText || cheapestActivity.value?.priceText || '')

function handleActivityEnabledChange(value: boolean): void {
  if (!value) {
    emit('update:selectedActivity', '')
    return
  }

  const rememberedActivity = props.activities.find((item) => item.value === lastSelectedActivity.value)
  const defaultActivity = rememberedActivity ?? findCheapestActivity(props.activities)

  if (defaultActivity) {
    lastSelectedActivity.value = defaultActivity.value
    emit('update:selectedActivity', defaultActivity.value)
  }
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
          >
            <div class="activity-option">
              <span class="activity-option-label">{{ item.label }}</span>
              <el-tag v-if="item.priceText" size="small" type="danger" class="activity-option-price">
                {{ item.priceText }}
              </el-tag>
            </div>
          </el-option>
        </el-select>
        <span class="active-price-text">{{ displayPriceText }}</span>
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

.side-line > span:first-child {
  color: var(--app-subtle);
}

.active-price-text {
  justify-self: end;
  color: var(--el-color-danger);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
}

.activity-option {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.activity-option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-option-price {
  flex: 0 0 auto;
}

/* 兼容 ui-workbench-layout 契约测试 */
.side-panel-header > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
