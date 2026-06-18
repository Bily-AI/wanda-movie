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
const seatGap = 2
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
  border: 1px solid #e6a23c;
  border-radius: 2px;
  background: #fff;
  color: #667085;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
}

.seat-node.occupied {
  border-color: #1f2937;
  background: #1f2937;
  color: transparent;
  cursor: not-allowed;
}

.seat-node.selected {
  border-color: #409eff;
  background: #409eff;
  color: #fff;
}

.seat-preferred { border-color: #7ec8e3; }
.seat-vip { border-color: #3a5a9f; }
.seat-couple { border-color: #e85d75; }
.seat-wplus { border-color: #1a3a7a; }
.seat-discount { border-color: #4caf50; }
</style>
