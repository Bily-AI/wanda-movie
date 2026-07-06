import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/PaymentPanel.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  "const lastSelectedActivity = ref('')",
  'const activityEnabled = computed(',
  '<header class="side-panel-header',
  '<el-switch',
  '@change="handleActivityEnabledChange"',
  ':model-value="selectedActivity"',
  'class="active-price-text"'
]) {
  assert.ok(source.includes(marker), `${file} should include ${marker}`)
}

for (const forbidden of [
  'const isCollapsed = ref(false)',
  'Minus, Plus',
  'collapse-header',
  '<el-collapse-transition>',
  'v-show="!isCollapsed"',
  '@click="isCollapsed = !isCollapsed"'
]) {
  assert.ok(!source.includes(forbidden), `${file} should not include ${forbidden}`)
}

console.log('ticket payment activity panel legacy contract passed')
