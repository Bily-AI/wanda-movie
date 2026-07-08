import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
}

// 1) 类型层：券选择结果需要暴露真实应付价（分）
const types = read('src/shared/wandaTicketTypes.ts')
assert.ok(types.includes('payablePriceCent: number'), 'CouponSelectionResult 应包含 payablePriceCent')

// 2) 接口层：normalizeCouponSelectionResult 需从 allotSeat 解析真实应付价
const seatApi = read('src/renderer/services/seatApi.ts')
for (const marker of [
  'function parseCouponAllotPayableCent(',
  'function extractAllotPayableCent(',
  'totalPayPrice',
  'payablePriceCent: parseCouponAllotPayableCent(allotSeat)'
]) {
  assert.ok(seatApi.includes(marker), `seatApi.ts 应包含 ${marker}`)
}

// 3) store 层：预览价选券时优先用接口真实价，且有独立刷新动作与状态复位
const store = read('src/renderer/stores/ticket.ts')
for (const marker of [
  'couponPreviewPayableCent: -1',
  'async refreshSelectedCouponPreview()',
  'this.couponPreviewPayableCent = selection.payablePriceCent',
  'if (state.couponPreviewPayableCent >= 0)'
]) {
  assert.ok(store.includes(marker), `ticket.ts 应包含 ${marker}`)
}
// 折后价基数保持“实付 × 折扣率”不变
assert.ok(
  store.includes('this.selectedSeatPreviewPayablePriceCent * this.selectedSeatDiscountRateNumber'),
  'ticket.ts 折后价应基于实付价乘折扣率'
)

// 4) 视图层：选券变更需触发预览刷新
const view = read('src/renderer/views/TicketView.vue')
for (const marker of [
  'function handleCouponSelectionChange(',
  'ticketStore.refreshSelectedCouponPreview()',
  '@update:selected-values="handleCouponSelectionChange"'
]) {
  assert.ok(view.includes(marker), `TicketView.vue 应包含 ${marker}`)
}

console.log('ticket coupon preview price contract passed')
