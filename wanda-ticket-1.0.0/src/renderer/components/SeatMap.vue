<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

// 自适应缩放:观测外层容器(.seat-scroll)尺寸,窗口大就把座位图放大铺满
const fitRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)
const containerHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

function measureContainer(): void {
  const el = fitRef.value?.parentElement
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  // 只接受 >0 的测量值,避免布局未稳定时的瞬时 0 把缩放卡在 1
  if (w > 0) containerWidth.value = w
  if (h > 0) containerHeight.value = h
}

// 用两帧 rAF 在布局(flex 撑满)稳定后再测量,确保拿到真实可用空间
function scheduleMeasure(): void {
  requestAnimationFrame(() => {
    measureContainer()
    requestAnimationFrame(() => measureContainer())
  })
}

onMounted(() => {
  const el = fitRef.value?.parentElement
  if (el && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(el)
  }
  scheduleMeasure()
})

// 换场次/影院导致座位变化 → 容器可能重建,重新测量
watch(() => props.seats, () => scheduleMeasure())

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function maxSeatCoordinate(projector: (seat: SeatNode) => number): number {
  return props.seats.reduce((max, seat) => Math.max(max, projector(seat)), 0)
}

function minSeatCoordinate(projector: (seat: SeatNode) => number): number {
  return props.seats.reduce((min, seat) => Math.min(min, projector(seat)), Number.POSITIVE_INFINITY)
}

// 座位坐标可能带偏移（首排/首列不从 0 开始），归一化后紧贴左上角，避免上方与左右出现空白
const originX = computed(() => (props.seats.length ? minSeatCoordinate((seat) => seat.coordx) : 0))
const originY = computed(() => (props.seats.length ? minSeatCoordinate((seat) => seat.coordy) : 0))

// 座位图自然尺寸(未缩放)
const naturalSize = computed(() => {
  const maxX = maxSeatCoordinate((seat) => seat.coordx)
  const maxY = maxSeatCoordinate((seat) => seat.coordy)
  const width = Math.max(560, mapPadding * 2 + rowLabelWidth + (maxX - originX.value) * (seatWidth + seatGap) + seatWidth)
  const height = mapPadding * 2 + (maxY - originY.value) * (seatHeight + seatGap) + seatHeight
  return { width, height }
})

// 缩放系数:只放大不缩小(小窗口保持原样滚动),窗口大则铺满,最多放大 2.4 倍
const scaleFactor = computed(() => {
  const { width, height } = naturalSize.value
  if (!containerWidth.value || !containerHeight.value || width <= 0 || height <= 0) {
    return 1
  }
  const raw = Math.min(containerWidth.value / width, containerHeight.value / height)
  return Math.max(1, Math.min(raw, 2.4))
})

const mapStyle = computed<Record<string, string>>(() => {
  const maxX = maxSeatCoordinate((seat) => seat.coordx)
  const maxY = maxSeatCoordinate((seat) => seat.coordy)
  const mapWidth = mapPadding * 2 + rowLabelWidth + (maxX - originX.value) * (seatWidth + seatGap) + seatWidth
  const mapHeight = mapPadding * 2 + (maxY - originY.value) * (seatHeight + seatGap) + seatHeight

  return {
    width: `${Math.max(560, mapWidth)}px`,
    height: `${mapHeight}px`,
    transform: `scale(${scaleFactor.value})`,
    transformOrigin: 'top left'
  }
})

// 外层占位盒:预留缩放后的实际尺寸,保证滚动/居中正确(transform 不改变布局盒)
const fitStyle = computed<Record<string, string>>(() => ({
  width: `${naturalSize.value.width * scaleFactor.value}px`,
  height: `${naturalSize.value.height * scaleFactor.value}px`
}))

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
  <div ref="fitRef" class="seat-map-fit" :style="fitStyle">
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
  </div>
</template>

<style scoped>
/* 缩放占位盒:尺寸=缩放后的实际大小;margin auto 在座位区内水平+垂直居中,
   内容超出时自动归零从左上滚动;flex 子项不收缩 */
.seat-map-fit {
  position: relative;
  margin: auto;
  flex: 0 0 auto;
  overflow: hidden;
}

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
