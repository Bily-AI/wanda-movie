# Ticket Payment Panels Legacy Align Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the ticket page right-side `支付活动 / 支付卡 / 兑换券` panels with the legacy Wanda layout and click flow without changing seat summary, pricing, or payment submission logic.

**Architecture:** Keep the existing `ticketStore` props and emit chains intact, and only reshape the three Vue components that render the right-side payment panels. Use focused contract scripts for red/green verification so each panel can be restored independently without touching `SelectedSeatList.vue` or the rest of `TicketView.vue`.

**Tech Stack:** Vue 3, Element Plus, TypeScript, Node.js contract scripts, npm

---

## File Map

- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package.json`
  Adds targeted `check:*` scripts for the three payment-panel legacy checks.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs`
  Fails when `PaymentPanel.vue` still contains collapse-only structure or loses the existing activity switch/select chain.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-payment-card-panel-legacy-align-contract.mjs`
  Fails when `PayCardList.vue` still contains collapse markers or loses row-click selection behavior.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-coupon-panel-legacy-align-contract.mjs`
  Fails when `CouponList.vue` still contains collapse markers or loses row-click coupon selection behavior.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/PaymentPanel.vue`
  Restores the fixed-open legacy activity card while keeping the current `selectedActivity` and `activePrice` props.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/PayCardList.vue`
  Restores the fixed-open legacy payment-card list and keeps `selectedValues` row toggling.
- `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/CouponList.vue`
  Restores the fixed-open legacy coupon list and keeps `selectedValues` row toggling plus `seatCount` summary.

### Task 1: Add targeted legacy-alignment contract checks

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/package.json`
- Create: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs`
- Create: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-payment-card-panel-legacy-align-contract.mjs`
- Create: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/tools/check-ticket-coupon-panel-legacy-align-contract.mjs`

- [ ] **Step 1: Add the three failing contract runners**

Add these script entries to `package.json`:

```json
"check:ticket-payment-activity-panel-legacy-align": "node tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs",
"check:ticket-payment-card-panel-legacy-align": "node tools/check-ticket-payment-card-panel-legacy-align-contract.mjs",
"check:ticket-coupon-panel-legacy-align": "node tools/check-ticket-coupon-panel-legacy-align-contract.mjs",
```

Create `tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs`:

```js
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/PaymentPanel.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  "const lastSelectedActivity = ref('')",
  "const activityEnabled = computed(() =>",
  '<header class="side-panel-header">',
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
```

Create `tools/check-ticket-payment-card-panel-legacy-align-contract.mjs`:

```js
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/PayCardList.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  'function toggleSelection(value: string) {',
  '<header class="side-panel-header">',
  'class="side-panel-count"',
  '@click="toggleSelection(item.value)"',
  "selectedValues.length }} / {{ items.length }}",
  'class="table-row"'
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

console.log('ticket payment card panel legacy contract passed')
```

Create `tools/check-ticket-coupon-panel-legacy-align-contract.mjs`:

```js
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const file = 'src/renderer/components/CouponList.vue'
const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')

for (const marker of [
  'function toggleSelection(value: string) {',
  '<header class="side-panel-header">',
  'class="side-panel-count"',
  '@click="toggleSelection(item.value)"',
  '{{ selectedValues.length }} 张 | 可兑 {{ items.length }} / 需 {{ seatCount }} 张',
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
```

- [ ] **Step 2: Run the three new checks and watch them fail for the expected reason**

Run:

```bash
npm run check:ticket-payment-activity-panel-legacy-align
npm run check:ticket-payment-card-panel-legacy-align
npm run check:ticket-coupon-panel-legacy-align
```

Expected:

- The activity-panel check fails on `const isCollapsed = ref(false)` or `Minus, Plus`.
- The payment-card check fails on `const isCollapsed = ref(false)` or `import { ref } from 'vue'`.
- The coupon-panel check fails on `const isCollapsed = ref(false)` or `import { ref } from 'vue'`.

- [ ] **Step 3: Commit the red-phase contract scaffolding**

Run:

```bash
git add package.json tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs tools/check-ticket-payment-card-panel-legacy-align-contract.mjs tools/check-ticket-coupon-panel-legacy-align-contract.mjs
git commit -m "test: add ticket payment panel legacy contracts"
```

### Task 2: Restore the fixed-open legacy payment-activity panel

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/PaymentPanel.vue`

- [ ] **Step 1: Remove collapse-only state and icon imports from the script block**

Replace the top of `PaymentPanel.vue` with:

```ts
<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
  cardNo?: string
  balanceText?: string
  typeText?: string
  expiryText?: string
}

const props = defineProps<{
  activities: PaymentDisplayItem[]
  selectedActivity: string
  loading: boolean
  activePrice: string
}>()

const emit = defineEmits<{
  'update:selectedActivity': [value: string]
}>()

const lastSelectedActivity = ref('')

watch(
  () => props.selectedActivity,
  (value) => {
    if (value) {
      lastSelectedActivity.value = value
    }
  },
  { immediate: true }
)

const activityEnabled = computed(() => props.activities.length > 0 && (Boolean(props.selectedActivity) || Boolean(lastSelectedActivity.value)))

function handleActivityEnabledChange(value: boolean): void {
  if (!value) {
    emit('update:selectedActivity', '')
    return
  }

  emit('update:selectedActivity', lastSelectedActivity.value)
}
</script>
```

- [ ] **Step 2: Replace the template and panel spacing with the fixed-open legacy structure**

Use this template and style shape:

```vue
<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>支付活动</span>
      <div class="panel-toggle">
        <el-switch
          :model-value="activityEnabled"
          :disabled="activities.length === 0 || loading"
          inline-prompt
          active-text="优惠"
          inactive-text="关闭"
          @change="handleActivityEnabledChange"
        />
      </div>
    </header>

    <div class="panel-content">
      <div class="side-line">
        <span>活动价</span>
        <el-select
          :model-value="selectedActivity"
          size="small"
          placeholder="无活动"
          :loading="loading"
          :disabled="activities.length === 0"
          @update:model-value="emit('update:selectedActivity', $event)"
        >
          <el-option label="无活动" value="" />
          <el-option
            v-for="item in activities"
            :key="item.key"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <span class="active-price-text">{{ activePrice }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  overflow: hidden;
}

.side-panel-header {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-toggle {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.panel-content {
  padding: 12px 16px 14px;
}

.side-line {
  min-width: 0;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.side-line :deep(.el-select) {
  min-width: 0;
}

.side-line span {
  color: var(--app-subtle);
}

.active-price-text {
  color: var(--el-color-danger);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
}

.side-panel-header > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [ ] **Step 3: Run the activity-panel contract and make sure it passes**

Run:

```bash
npm run check:ticket-payment-activity-panel-legacy-align
```

Expected: `ticket payment activity panel legacy contract passed`

- [ ] **Step 4: Run the existing workbench layout contract to make sure the static header still fits the page**

Run:

```bash
npm run check:ui-workbench-layout
```

Expected: `UI workbench layout contract passed`

- [ ] **Step 5: Commit the activity-panel alignment**

Run:

```bash
git add src/renderer/components/PaymentPanel.vue
git commit -m "fix: align legacy payment activity panel"
```

### Task 3: Restore the fixed-open legacy payment-card panel

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/PayCardList.vue`

- [ ] **Step 1: Remove collapse state and keep only row-toggle selection logic**

Replace the script block with:

```ts
<script setup lang="ts">
interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
  cardNo?: string
  balanceText?: string
  typeText?: string
  expiryText?: string
}

const props = defineProps<{
  items: PaymentDisplayItem[]
  selectedValues: string[]
  loading: boolean
}>()

const emit = defineEmits<{
  'update:selectedValues': [value: string[]]
}>()

function toggleSelection(value: string) {
  const current = new Set(props.selectedValues)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  emit('update:selectedValues', Array.from(current))
}
</script>
```

- [ ] **Step 2: Replace the template and header styling with the always-open legacy list**

Use this component shape:

```vue
<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>支付卡</span>
      <span class="side-panel-count">已选 {{ selectedValues.length }} / {{ items.length }} 张</span>
    </header>

    <div v-if="items.length" class="table-list">
      <div class="table-header">
        <div class="col-name">卡名称</div>
        <div class="col-no">卡号</div>
        <div class="col-balance">余额</div>
      </div>
      <div class="table-body">
        <div
          v-for="item in items"
          :key="item.key"
          class="table-row"
          :class="{ 'is-selected': selectedValues.includes(item.value) }"
          @click="toggleSelection(item.value)"
        >
          <div class="col-name" :title="item.label">{{ item.label }}</div>
          <div class="col-no" :title="item.cardNo || item.value">{{ item.cardNo || item.value }}</div>
          <div class="col-balance" :title="item.balanceText || item.meta">{{ item.balanceText || item.meta }}</div>
        </div>
      </div>
    </div>

    <div v-else class="side-empty">
      {{ loading ? '支付卡加载中' : '暂无可用支付卡' }}
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  overflow: hidden;
}

.side-panel-header {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.side-panel-header > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel-count {
  min-width: 0;
  color: var(--app-muted);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-list {
  display: flex;
  flex-direction: column;
  padding: 8px 16px 10px;
}

.table-header {
  display: grid;
  grid-template-columns: 1.5fr 2fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border);
  font-size: 13px;
}

.table-body {
  display: flex;
  flex-direction: column;
  max-height: 156px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 1.5fr 2fr 1fr;
  gap: 8px;
  padding: 9px 10px;
  cursor: pointer;
  border-radius: 4px;
  align-items: center;
  font-size: 13px;
  color: var(--app-text);
}

.table-row:hover {
  background-color: var(--el-fill-color-light);
}

.table-row.is-selected {
  background-color: var(--el-color-primary);
  color: #fff;
}

.table-row.is-selected .col-balance {
  color: #fff;
}

.col-name,
.col-no,
.col-balance {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-balance {
  color: var(--el-color-success);
  font-weight: 600;
  text-align: right;
}

.side-empty {
  min-height: 74px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.mini-list {
  min-width: 0;
}

.mini-list-checkbox {
  min-width: 0;
  width: 100%;
  display: flex;
}

.mini-list-checkbox :deep(.el-checkbox__input) {
  flex: 0 0 auto;
}

.mini-list-checkbox :deep(.el-checkbox__label) {
  min-width: 0;
  width: auto;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) max-content;
  font-size: 12px;
}
</style>
```

- [ ] **Step 3: Run the payment-card contract and make sure it passes**

Run:

```bash
npm run check:ticket-payment-card-panel-legacy-align
```

Expected: `ticket payment card panel legacy contract passed`

- [ ] **Step 4: Commit the payment-card alignment**

Run:

```bash
git add src/renderer/components/PayCardList.vue
git commit -m "fix: align legacy payment card panel"
```

### Task 4: Restore the fixed-open legacy coupon panel

**Files:**
- Modify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0/src/renderer/components/CouponList.vue`

- [ ] **Step 1: Remove collapse state and keep only coupon row-toggle logic**

Replace the script block with:

```ts
<script setup lang="ts">
interface PaymentDisplayItem {
  key: string
  label: string
  value: string
  meta?: string
  cardNo?: string
  balanceText?: string
  typeText?: string
  expiryText?: string
}

const props = defineProps<{
  items: PaymentDisplayItem[]
  selectedValues: string[]
  loading: boolean
  seatCount: number
}>()

const emit = defineEmits<{
  'update:selectedValues': [value: string[]]
}>()

function toggleSelection(value: string) {
  const current = new Set(props.selectedValues)
  if (current.has(value)) {
    current.delete(value)
  } else {
    current.add(value)
  }
  emit('update:selectedValues', Array.from(current))
}
</script>
```

- [ ] **Step 2: Replace the template and header styling with the always-open legacy coupon list**

Use this component shape:

```vue
<template>
  <section class="side-panel-body">
    <header class="side-panel-header">
      <span>兑换券</span>
      <span class="side-panel-count">已选 {{ selectedValues.length }} 张 | 可兑 {{ items.length }} / 需 {{ seatCount }} 张</span>
    </header>

    <div v-if="items.length" class="table-list">
      <div class="table-header">
        <div class="col-name">券名称</div>
        <div class="col-type">类型</div>
        <div class="col-expiry">有效期</div>
      </div>
      <div class="table-body">
        <div
          v-for="item in items"
          :key="item.key"
          class="table-row"
          :class="{ 'is-selected': selectedValues.includes(item.value) }"
          @click="toggleSelection(item.value)"
        >
          <div class="col-name" :title="item.label">{{ item.label }}</div>
          <div class="col-type" :title="item.typeText">{{ item.typeText || '-' }}</div>
          <div class="col-expiry" :title="item.expiryText">{{ item.expiryText || '-' }}</div>
        </div>
      </div>
    </div>

    <div v-else class="side-empty">
      {{ loading ? '兑换券加载中' : '暂无可用兑换券' }}
    </div>
  </section>
</template>

<style scoped>
.side-panel-body {
  min-width: 0;
  overflow: hidden;
}

.side-panel-header {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.side-panel-header > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel-count {
  min-width: 0;
  color: var(--app-muted);
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-list {
  display: flex;
  flex-direction: column;
  padding: 8px 16px 10px;
}

.table-header {
  display: grid;
  grid-template-columns: 1.5fr 1fr 2fr;
  gap: 8px;
  padding: 8px 10px;
  font-weight: 600;
  color: var(--app-text);
  border-bottom: 1px solid var(--app-border);
  font-size: 13px;
}

.table-body {
  display: flex;
  flex-direction: column;
  max-height: 156px;
  overflow-y: auto;
}

.table-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 2fr;
  gap: 8px;
  padding: 9px 10px;
  cursor: pointer;
  border-radius: 4px;
  align-items: center;
  font-size: 13px;
  color: var(--app-text);
}

.table-row:hover {
  background-color: var(--el-fill-color-light);
}

.table-row.is-selected {
  background-color: var(--el-color-primary);
  color: #fff;
}

.col-name,
.col-type,
.col-expiry {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-type {
  color: var(--app-muted);
}

.table-row.is-selected .col-type {
  color: rgba(255, 255, 255, 0.8);
}

.col-expiry {
  color: var(--app-muted);
  font-size: 12px;
  text-align: right;
}

.table-row.is-selected .col-expiry {
  color: rgba(255, 255, 255, 0.8);
}

.side-empty {
  min-height: 74px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.mini-list {
  min-width: 0;
}

.mini-list-checkbox {
  min-width: 0;
  width: 100%;
  display: flex;
}

.mini-list-checkbox :deep(.el-checkbox__input) {
  flex: 0 0 auto;
}

.mini-list-checkbox :deep(.el-checkbox__label) {
  min-width: 0;
  width: auto;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) max-content;
  font-size: 12px;
}
</style>
```

- [ ] **Step 3: Run the coupon-panel contract and make sure it passes**

Run:

```bash
npm run check:ticket-coupon-panel-legacy-align
```

Expected: `ticket coupon panel legacy contract passed`

- [ ] **Step 4: Commit the coupon-panel alignment**

Run:

```bash
git add src/renderer/components/CouponList.vue
git commit -m "fix: align legacy coupon panel"
```

### Task 5: Run full verification for the three-panel scope

**Files:**
- Verify: `D:/bily/win-ia32-unpacked/wanda-ticket-1.0.0`

- [ ] **Step 1: Re-run all three new panel checks together**

Run:

```bash
npm run check:ticket-payment-activity-panel-legacy-align
npm run check:ticket-payment-card-panel-legacy-align
npm run check:ticket-coupon-panel-legacy-align
```

Expected:

- `ticket payment activity panel legacy contract passed`
- `ticket payment card panel legacy contract passed`
- `ticket coupon panel legacy contract passed`

- [ ] **Step 2: Re-run the existing layout safety net**

Run:

```bash
npm run check:ui-workbench-layout
```

Expected: `UI workbench layout contract passed`

- [ ] **Step 3: Re-run the contract-runner self-check after the new scripts were added**

Run:

```bash
npm run check:all-contracts
```

Expected: the command exits `0` and reports the aggregated `check:*` contract coverage is still valid.

- [ ] **Step 4: Run the project build to catch template and TypeScript regressions**

Run:

```bash
npm run build
```

Expected: `vue-tsc --noEmit` and `electron-vite build` both exit `0`.

- [ ] **Step 5: Review the final change set before handoff**

Run:

```bash
git diff --name-only HEAD~3..HEAD -- package.json tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs tools/check-ticket-payment-card-panel-legacy-align-contract.mjs tools/check-ticket-coupon-panel-legacy-align-contract.mjs src/renderer/components/PaymentPanel.vue src/renderer/components/PayCardList.vue src/renderer/components/CouponList.vue
git log --oneline -4 -- package.json tools/check-ticket-payment-activity-panel-legacy-align-contract.mjs tools/check-ticket-payment-card-panel-legacy-align-contract.mjs tools/check-ticket-coupon-panel-legacy-align-contract.mjs src/renderer/components/PaymentPanel.vue src/renderer/components/PayCardList.vue src/renderer/components/CouponList.vue
```

Expected:

- `git diff --name-only HEAD~3..HEAD -- ...` only lists `package.json`, the three new contract scripts, and the three panel components.
- `git log --oneline -4 -- ...` includes the red-phase contract commit plus the three legacy-panel fix commits, without relying on the rest of the worktree being clean.
