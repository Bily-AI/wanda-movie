<script setup lang="ts">
interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
}

defineProps<{
  items: PaymentDisplayItem[]
  selectedValues: string[]
  loading: boolean
}>()

const emit = defineEmits<{
  'update:selectedValues': [value: string[]]
}>()
</script>

<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>支付卡</span>
      <span class="side-panel-count">已选 {{ selectedValues.length }} / {{ items.length }} 张</span>
    </header>

    <div v-if="items.length" class="mini-list">
      <el-checkbox-group
        :model-value="selectedValues"
        class="mini-list-group"
        @update:model-value="emit('update:selectedValues', $event)"
      >
        <div v-for="item in items" :key="item.key" class="mini-list-item">
          <el-checkbox :value="item.value" :aria-label="item.label" class="mini-list-checkbox">
            <span class="mini-list-label">{{ item.label }}</span>
            <em v-if="item.meta" class="mini-list-meta">{{ item.meta }}</em>
          </el-checkbox>
        </div>
      </el-checkbox-group>
    </div>

    <div v-else class="side-empty">
      {{ loading ? '支付卡加载中' : '暂无可用支付卡' }}
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  min-height: 112px;
  overflow: hidden;
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

.side-empty {
  min-height: 74px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.mini-list {
  min-width: 0;
  max-height: 156px;
  overflow: auto;
  padding: 8px 12px 12px;
}

.mini-list-group {
  display: grid;
  gap: 6px;
}

.mini-list-item {
  min-width: 0;
  min-height: 32px;
  color: var(--app-text);
}

.mini-list-checkbox {
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
}

.mini-list-checkbox :deep(.el-checkbox__input) {
  flex: 0 0 auto;
}

.mini-list-checkbox :deep(.el-checkbox__label) {
  min-width: 0;
  width: auto;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--app-text);
}

.mini-list-label,
.mini-list-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-list-meta {
  color: var(--app-muted);
  font-style: normal;
}
</style>
