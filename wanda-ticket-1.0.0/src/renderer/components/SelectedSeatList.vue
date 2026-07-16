<script setup lang="ts">
import { computed } from 'vue'

import { useSettingsStore } from '@renderer/stores/settings'
import type { SeatNode } from '@shared/wandaTicketTypes'

const props = defineProps<{
  selectedSeats: SeatNode[]
  totalPriceCent: number
  payablePriceCent: number
  discountPriceCent: number
}>()

const emit = defineEmits<{
  removeSeat: [seat: SeatNode]
}>()

function formatPrice(priceCent: number): string {
  return `¥${(Math.max(0, priceCent) / 100).toFixed(2)}`
}

const showDiscount = computed(() => props.discountPriceCent > 0)

// 实付后按折扣系数（默认 0.87，用户可改）前端估算折后价，仅展示不影响真实支付；系数持久化到设置，下次启动沿用
const settingsStore = useSettingsStore()
const discountRate = computed({
  get: () => settingsStore.seatDiscountRate,
  set: (value) => {
    const rate = Number(value)
    settingsStore.seatDiscountRate = Number.isFinite(rate) ? rate : 0
  }
})
const discountedPriceCent = computed(() => {
  const rate = Number(discountRate.value)
  return Math.round(props.payablePriceCent * (Number.isFinite(rate) ? rate : 0))
})

// 输入完成（失焦/回车）后落盘，避免每次按键都写文件
function handleDiscountCommit(): void {
  void settingsStore.setSeatDiscountRate(settingsStore.seatDiscountRate)
}
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
          <span class="seat-summary-discount">
            ×
            <input
              v-model.number="discountRate"
              class="discount-input"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              aria-label="折扣系数"
              @change="handleDiscountCommit"
              @blur="handleDiscountCommit"
            />
            = <strong class="discount-result">{{ formatPrice(discountedPriceCent) }}</strong>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.selected-seat-list {
  min-width: 0;
  overflow: hidden;
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
  max-height: 72px;
  overflow: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.seat-chip {
  max-width: 100%;
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

.seat-chip span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seat-chip-close {
  flex: 0 0 auto;
  color: #b7d7a6;
}

.seat-summary {
  flex-wrap: wrap;
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
  flex: 1 1 152px;
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
  white-space: nowrap;
}

.seat-summary-discount {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-muted);
  white-space: nowrap;
}

.discount-input {
  width: 56px;
  padding: 2px 4px;
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-surface);
  color: var(--app-text);
  font-size: 13px;
  text-align: center;
}

.discount-input:focus {
  outline: none;
  border-color: var(--app-accent);
}

.discount-result {
  color: #e6810a;
  font-weight: 600;
}
</style>
