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
  seatCount: number
}>()

const emit = defineEmits<{
  'update:selectedValues': [value: string[]]
}>()
</script>

<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>兑换券</span>
      <span class="side-panel-count">已选 {{ selectedValues.length }} 张 | 可兑 {{ items.length }} / 需 {{ seatCount }} 张</span>
    </header>

    <div v-if="items.length" class="mini-list">
      <el-checkbox-group
        :model-value="selectedValues"
        class="mini-list-group"
        @update:model-value="emit('update:selectedValues', $event)"
      >
        <label v-for="item in items" :key="item.key" class="mini-list-item">
          <el-checkbox :value="item.value" :aria-label="item.label" />
          <span>{{ item.label }}</span>
          <em>{{ item.meta }}</em>
        </label>
      </el-checkbox-group>
    </div>

    <div v-else class="side-empty">
      {{ loading ? '兑换券加载中' : '暂无可用兑换券' }}
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-height: 112px;
}

.side-panel-header {
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

.side-panel-count {
  color: var(--app-muted);
  font-weight: 400;
}

.side-empty {
  min-height: 74px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.mini-list {
  max-height: 156px;
  overflow: auto;
  padding: 8px 12px 12px;
}

.mini-list-group {
  display: grid;
  gap: 6px;
}

.mini-list-item {
  min-height: 32px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  color: var(--app-text);
}

.mini-list-item span,
.mini-list-item em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-list-item em {
  color: var(--app-muted);
  font-style: normal;
}
</style>
