import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/PaymentPanel.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')
const ticketViewFile = 'src/renderer/views/TicketView.vue'
const ticketViewSource = fs.readFileSync(path.join(root, ticketViewFile), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  "const lastSelectedActivity = ref('')",
  'function findCheapestActivity(',
  'const activityEnabled = computed(() => props.activities.length > 0 && Boolean(props.selectedActivity))',
  '() => props.activities',
  'const defaultActivity = findCheapestActivity(activities)',
  "emit('update:selectedActivity', defaultActivity.value)",
  'priceText?: string',
  '<header class="side-panel-header',
  '<el-switch',
  '@change="handleActivityEnabledChange"',
  ':model-value="selectedActivity"',
  'class="active-price-text"',
  'item.priceText',
  'class="activity-option-price"',
  '<el-tag'
]) {
  assert.ok(source.includes(marker), `${file} should include ${marker}`)
}

for (const marker of [
  'const priceText = `￥${activity.price.toFixed(2)}`',
  'priceText'
]) {
  assert.ok(ticketViewSource.includes(marker), `${ticketViewFile} should include ${marker}`)
}

for (const forbidden of [
  'const isCollapsed = ref(false)',
  'Boolean(lastSelectedActivity.value)',
  'Minus, Plus',
  'collapse-header',
  '<el-collapse-transition>',
  'v-show="!isCollapsed"',
  '@click="isCollapsed = !isCollapsed"'
]) {
  assert.ok(!source.includes(forbidden), `${file} should not include ${forbidden}`)
}

for (const forbidden of [
  'const payablePriceCent = ticketStore.getActivityPayablePriceCent(activity)',
  'selectedActivityItem.value?.priceText || cheapestActivity.value?.priceText || props.activePrice'
]) {
  assert.ok(!ticketViewSource.includes(forbidden), `${ticketViewFile} should not include ${forbidden}`)
  assert.ok(!source.includes(forbidden), `${file} should not include ${forbidden}`)
}

console.log('ticket payment activity panel legacy contract passed')
