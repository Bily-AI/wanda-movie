<script setup lang="ts">
import type { SeatNode } from '@shared/wandaTicketTypes'

const props = defineProps<{
  seats: SeatNode[]
  selectedSeats: SeatNode[]
}>()

const emit = defineEmits<{
  select: [seat: SeatNode]
}>()

const seatWidth = 26
const seatHeight = 22
const seatGap = 6
const rowLabelWidth = 28
const mapPadding = 4

function isSelected(seat: SeatNode): boolean {
  return props.selectedSeats.some((item) => item.id === seat.id)
}

function uniqueRows(): { y: number; label: string }[] {
  const rows = new Map<number, string>()

  for (const seat of props.seats) {
    if (!rows.has(seat.coordy)) {
      rows.set(seat.coordy, seat.rowLabel)
    }
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([y, label]) => ({ y, label }))
}

function seatClass(seat: SeatNode): string[] {
  return ['seat-node', `seat-${seat.zone}`, seat.status, isSelected(seat) ? 'selected' : '']
}

function seatStyle(seat: SeatNode): Record<string, string> {
  return {
    width: `${seatWidth}px`,
    height: `${seatHeight}px`,
    left: `${mapPadding + rowLabelWidth + seat.coordx * (seatGap + seatWidth)}px`,
    top: `${mapPadding + seat.coordy * (seatGap + seatHeight)}px`
  }
}

function rowStyle(y: number): Record<string, string> {
  return {
    top: `${mapPadding + y * (seatGap + seatHeight)}px`
  }
}
</script>

<template>
  <div class="seat-map">
    <span v-for="row in uniqueRows()" :key="row.y" class="row-label" :style="rowStyle(row.y)">
      {{ row.label }}排
    </span>

    <button
      v-for="seat in seats"
      :key="seat.id"
      type="button"
      :class="seatClass(seat)"
      :style="seatStyle(seat)"
      :disabled="seat.status === 'occupied'"
      @click="emit('select', seat)"
    >
      {{ seat.columnLabel }}
    </button>
  </div>
</template>

<style scoped>
.seat-map {
  min-width: 760px;
  min-height: 360px;
  position: relative;
}

.row-label {
  width: 28px;
  height: 20px;
  position: absolute;
  left: 0;
  color: var(--app-subtle);
  font-size: 11px;
  line-height: 20px;
  text-align: right;
}

.seat-node {
  position: absolute;
  border: 1px solid #c4ccd7;
  border-radius: 5px 5px 7px 7px;
  background: #fff;
  color: #667085;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background-color 120ms ease,
    color 120ms ease;
}

.seat-node:hover:not(:disabled) {
  border-color: var(--app-accent);
  background: var(--app-accent-soft);
}

.seat-node.occupied {
  border-color: #1f2937;
  background: #1f2937;
  color: transparent;
  cursor: not-allowed;
}

.seat-node.selected {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #fff;
}

.seat-preferred { border-color: #f59e42; }
.seat-vip { border-color: #8b6cf6; }
.seat-couple { border-color: #e85d75; }
.seat-wplus { border-color: #1a3a7a; }
.seat-discount { border-color: #4caf50; }
</style>
