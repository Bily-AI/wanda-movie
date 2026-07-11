import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/views/TicketView.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  '全局订单信息',
  'class="order-summary"',
  'ticketStore.currentOrder.orderId',
  'ticketStore.paymentDataMessage',
  'ticketStore.currentOrderMessage',
  'title="支付参数"',
  'v-model="payInfoDialogVisible"'
]) {
  assert.ok(source.includes(marker), `${file} should include ${marker}`)
}

// 仅禁止“订单摘要面板内嵌动作块”（旧版摘要面板是纯展示，无按钮）；
// 取消订单本身对齐旧版应存在，但放在底部动作栏，不在摘要面板 —— 故不再全局禁止。
for (const forbidden of [
  'class="order-summary-actions"',
  '@click="handleShowPaymentInfo"',
  '支付参数\n            </el-button>'
]) {
  assert.ok(!source.includes(forbidden), `${file} should not include ${forbidden}`)
}

console.log('ticket order summary legacy contract passed')
