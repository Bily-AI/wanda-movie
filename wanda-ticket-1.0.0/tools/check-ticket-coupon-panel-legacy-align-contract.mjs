import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/CouponList.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  'function toggleSelection(value: string) {',
  '<header class="side-panel-header',
  'class="side-panel-count"',
  '@click="toggleSelection(item.value)"',
  'selectedValues.length',
  'seatCount',
  'item.typeText',
  'item.expiryText'
]) {
  assert.ok(source.includes(marker), `${file} should include ${marker}`)
}

for (const forbidden of [
  'const isCollapsed = ref(false)',
  "import { ref } from 'vue'",
  'Minus, Plus',
  'collapse-header',
  '<el-collapse-transition>',
  'v-show="!isCollapsed"',
  '@click="isCollapsed = !isCollapsed"'
]) {
  assert.ok(!source.includes(forbidden), `${file} should not include ${forbidden}`)
}

console.log('ticket coupon panel legacy contract passed')
