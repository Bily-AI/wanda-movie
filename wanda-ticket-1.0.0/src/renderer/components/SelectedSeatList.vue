<script setup lang="ts">
import type { SeatNode } from '@shared/wandaTicketTypes'

defineProps<{
  selectedSeats: SeatNode[]
}>()
</script>

<template>
  <div class="selected-seat-list">
    <div v-if="selectedSeats.length === 0" class="side-empty">暂未选择座位</div>
    <div v-for="seat in selectedSeats" v-else :key="seat.id" class="selected-seat-item">
      <span>{{ seat.rowLabel }}排{{ seat.columnLabel }}座</span>
      <strong>¥{{ seat.price.toFixed(2) }}</strong>
    </div>
  </div>
</template>

<style scoped>
.selected-seat-list {
  min-height: 48px;
  padding: 8px 12px 12px;
}

.side-empty {
  min-height: 48px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
}

.selected-seat-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  color: var(--app-text);
}
</style>
