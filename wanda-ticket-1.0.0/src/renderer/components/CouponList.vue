<script setup lang="ts">
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
  items: PaymentDisplayItem[]
  selectedValues: string[]
  loading: boolean
  seatCount: number
}>()

const emit = defineEmits<{
  'update:selectedValues': [value: string[]]
}>()

function toggleSelection(value: string) {
  const current = new Set(props.selectedValues)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  emit('update:selectedValues', Array.from(current))
}
</script>

<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>兑换券</span>
      <span class="side-panel-count">已选 {{ selectedValues.length }} 张 | 可兑 {{ items.length }} / 需 {{ seatCount }} 张</span>
    </header>

    <div v-if="items.length" class="table-list">
      <div class="table-body">
        <div
          v-for="item in items"
          :key="item.key"
          class="table-row"
          :class="{ 'is-selected': selectedValues.includes(item.value) }"
          @click="toggleSelection(item.value)"
        >
          <div class="col-name" :title="item.label">{{ item.label }}</div>
          <div class="col-type" :title="item.typeText">{{ item.typeText || '-' }}</div>
          <div class="col-expiry" :title="item.expiryText">{{ item.expiryText || '-' }}</div>
        </div>
      </div>
    </div>

    <div v-else class="side-empty">
      {{ loading ? '兑换券加载中' : '暂无可用兑换券' }}
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

/* 兼容 ui-workbench-layout 契约测试 */
.side-panel-header > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel-count {
  min-width: 0;
  color: var(--app-muted);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-list {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.table-header {
  display: grid;
  grid-template-columns: 1.5fr 1fr 2fr;
  gap: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border);
  font-size: 13px;
}

.table-body {
  display: flex;
  flex-direction: column;
  max-height: 156px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 2fr;
  gap: 8px;
  padding: 9px 10px;
  cursor: pointer;
  border-radius: 4px;
  align-items: center;
  font-size: 13px;
  color: var(--app-text);
}

.table-row:hover {
  background-color: var(--el-fill-color-light);
}

.table-row.is-selected {
  background-color: var(--el-color-primary);
  color: #fff;
}

.col-name,
.col-type,
.col-expiry {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-type {
  color: var(--app-muted);
}

.table-row.is-selected .col-type {
  color: rgba(255, 255, 255, 0.8);
}

.col-expiry {
  color: var(--app-muted);
  font-size: 12px;
  text-align: right;
}

.table-row.is-selected .col-expiry {
  color: rgba(255, 255, 255, 0.8);
}

.side-empty {
  min-height: 74px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.mini-list {
  min-width: 0;
}

.mini-list-checkbox {
  min-width: 0;
  width: 100%;
  display: flex;
}

.mini-list-checkbox :deep(.el-checkbox__input) {
  flex: 0 0 auto;
}

.mini-list-checkbox :deep(.el-checkbox__label) {
  min-width: 0;
  width: auto;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) max-content;
  font-size: 12px;
}
</style>
