<script setup lang="ts">
import { computed } from 'vue'

import type { SeatNode } from '@shared/wandaTicketTypes'

const props = defineProps<{
  selectedSeats: SeatNode[]
  totalPriceCent: number
  payablePriceCent: number
  discountPriceCent: number
  discountRate: string
  discountedPayablePriceCent: number
}>()

const emit = defineEmits<{
  removeSeat: [seat: SeatNode]
  'update:discountRate': [value: string]
}>()

function formatPrice(priceCent: number): string {
  return `¥${(Math.max(0, priceCent) / 100).toFixed(2)}`
}

const showDiscount = computed(() => props.discountPriceCent > 0)
</script>

<template>
  <div class="selected-seat-list">
    <div v-if="selectedSeats.length === 0" class="side-empty">暂未选择座位</div>

    <template v-else>
      <div class="seat-chip-list">
        <button
          v-for="seat in selectedSeats"
          :key="seat.id"
          type="button"
          class="seat-chip"
          @click="emit('removeSeat', seat)"
        >
          <span>{{ seat.rowLabel }}排{{ seat.columnLabel }}座</span>
          <span class="seat-chip-close">x</span>
        </button>
      </div>

      <div class="seat-summary">
        <div class="seat-summary-main">
          <span class="seat-summary-label">合计</span>
          <span class="seat-summary-total" :class="{ strike: showDiscount }">{{ formatPrice(totalPriceCent) }}</span>
          <span class="seat-summary-payable">实付 {{ formatPrice(payablePriceCent) }}</span>
        </div>

        <div class="seat-summary-calc">
          <input
            :value="discountRate"
            type="text"
            inputmode="decimal"
            class="seat-summary-input"
            @input="emit('update:discountRate', ($event.target as HTMLInputElement).value)"
          />
          <span class="seat-summary-equals">= {{ formatPrice(discountedPayablePriceCent) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.selected-seat-list {
  min-height: 72px;
  padding: 10px 12px 12px;
}

.side-empty {
  min-height: 72px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
}

.seat-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #d8ecd0;
  border-radius: 4px;
  background: #f3fbef;
  color: #8bbb68;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.seat-chip-close {
  color: #b7d7a6;
}

.seat-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--app-border);
  font-size: 13px;
}

.seat-summary-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.seat-summary-label {
  color: var(--app-muted);
}

.seat-summary-total {
  color: #8f96a3;
}

.seat-summary-total.strike {
  text-decoration: line-through;
  color: #d16b6b;
}

.seat-summary-payable {
  color: #4caf50;
  font-weight: 600;
}

.seat-summary-calc {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5a97db;
}

.seat-summary-input {
  width: 54px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  outline: none;
}

.seat-summary-input:focus {
  border-color: var(--el-color-primary);
}

.seat-summary-equals {
  white-space: nowrap;
}
</style>
