<script setup lang="ts">
import { computed } from 'vue'
import type { SeatNode } from '@shared/wandaTicketTypes'

const props = defineProps<{
  seats: SeatNode[]
  selectedSeats: SeatNode[]
}>()

const emit = defineEmits<{
  select: [seat: SeatNode]
}>()

const seatWidth = 19
const seatHeight = 16
const seatGap = 4
const rowLabelWidth = 24
const mapPadding = 4

function maxSeatCoordinate(projector: (seat: SeatNode) => number): number {
  return props.seats.reduce((max, seat) => Math.max(max, projector(seat)), 0)
}

function minSeatCoordinate(projector: (seat: SeatNode) => number): number {
  return props.seats.reduce((min, seat) => Math.min(min, projector(seat)), Number.POSITIVE_INFINITY)
}

// 座位坐标可能带偏移（首排/首列不从 0 开始），归一化后紧贴左上角，避免上方与左右出现空白
const originX = computed(() => (props.seats.length ? minSeatCoordinate((seat) => seat.coordx) : 0))
const originY = computed(() => (props.seats.length ? minSeatCoordinate((seat) => seat.coordy) : 0))

const mapStyle = computed<Record<string, string>>(() => {
  const maxX = maxSeatCoordinate((seat) => seat.coordx)
  const maxY = maxSeatCoordinate((seat) => seat.coordy)
  const mapWidth = mapPadding * 2 + rowLabelWidth + (maxX - originX.value) * (seatWidth + seatGap) + seatWidth
  const mapHeight = mapPadding * 2 + (maxY - originY.value) * (seatHeight + seatGap) + seatHeight

  return {
    width: `${Math.max(560, mapWidth)}px`,
    height: `${mapHeight}px`
  }
})

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
    left: `${mapPadding + rowLabelWidth + (seat.coordx - originX.value) * (seatGap + seatWidth)}px`,
    top: `${mapPadding + (seat.coordy - originY.value) * (seatGap + seatHeight)}px`
  }
}

function rowStyle(y: number): Record<string, string> {
  return {
    top: `${mapPadding + (y - originY.value) * (seatGap + seatHeight)}px`
  }
}
</script>

<template>
  <div class="seat-map" :style="mapStyle">
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
  min-width: 560px;
  position: relative;
}

.row-label {
  width: 24px;
  height: 16px;
  position: absolute;
  left: 0;
  color: var(--app-subtle);
  font-size: 10px;
  line-height: 16px;
  text-align: right;
}

.seat-node {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  outline: none;
  appearance: none;
  border: 2px solid #c4ccd7;
  border-radius: 5px 5px 7px 7px;
  background: #fff;
  color: #667085;
  font-size: 9px;
  line-height: 1;
  text-align: center;
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
  color: #fff !important;
}

.seat-node.selected:hover:not(:disabled),
.seat-node.selected:focus-visible {
  border-color: var(--app-accent);
  background: var(--app-accent);
  color: #fff !important;
}

.seat-preferred { border-color: #f59e42; }
.seat-vip { border-color: #8b6cf6; }
.seat-couple { border-color: #e85d75; }
.seat-wplus { border-color: #1a3a7a; }
.seat-discount { border-color: #4caf50; }
</style>
