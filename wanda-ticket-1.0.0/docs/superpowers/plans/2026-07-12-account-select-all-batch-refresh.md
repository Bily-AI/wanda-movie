# 账号全选/反选 + 批量刷新概览 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(主会话内联执行)。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 账号列表加全选/反选(全量账号),动作行加批量刷新选中账号完整概览。

**Architecture:** 仅改 `AccountSidebar.vue`——加 computed/handler/UI;`store.setSelectedAccountIds` 已够用。`check-global-account-sidebar` 追加断言作红绿护栏。

**Tech Stack:** Vue3 + Pinia + Element Plus + TS;测试面 `tools/check-*.mjs` + `vue-tsc`。

## Global Constraints

- 全选/反选作用于**全部账号**(`accountsStore.accounts`,无视筛选)。
- 批量刷新复用 `refreshAccountSummary(account)`(完整概览),只刷选中且有 `ck` 的账号。
- 每任务结束:`npm run typecheck` + `check:global-account-sidebar` 通过,提交。

---

### Task 1: 全选/反选

**Files:** Modify `src/renderer/components/AccountSidebar.vue`、`tools/check-global-account-sidebar-contract.mjs`

- [ ] **Step 1: 契约加断言(红)** — 在 `check-global-account-sidebar-contract.mjs` 的 `console.log('全局账号侧栏契约检查通过')` 前插入:

```js
for (const text of ['handleToggleSelectAll', 'handleInvertSelection', ':indeterminate="someAccountsChecked"', '反选']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
```

- [ ] **Step 2: 跑契约确认失败** — `npm run check:global-account-sidebar` → FAIL(缺 handleToggleSelectAll)

- [ ] **Step 3: 加 computed + handler** — 在 `handleAccountCheckedChange`(`:159-169`)之后新增:

```ts
const allAccountsChecked = computed(
  () => accountsStore.accounts.length > 0 && accountsStore.selectedCount === accountsStore.accounts.length
)
const someAccountsChecked = computed(
  () => accountsStore.selectedCount > 0 && accountsStore.selectedCount < accountsStore.accounts.length
)

function handleToggleSelectAll(): void {
  if (allAccountsChecked.value) {
    accountsStore.setSelectedAccountIds([])
  } else {
    accountsStore.setSelectedAccountIds(accountsStore.accounts.map((account) => account.id))
  }
}

function handleInvertSelection(): void {
  const selected = new Set(accountsStore.selectedAccountIds)
  accountsStore.setSelectedAccountIds(
    accountsStore.accounts.filter((account) => !selected.has(account.id)).map((account) => account.id)
  )
}
```

- [ ] **Step 4: 列表头部加控件** — `src/renderer/components/AccountSidebar.vue`,在 `account-list-panel` 内、`<div class="account-row-list">`(`:476`)之前插入:

```html
        <div class="account-list-toolbar">
          <el-checkbox
            :model-value="allAccountsChecked"
            :indeterminate="someAccountsChecked"
            @change="handleToggleSelectAll"
          >
            全选
          </el-checkbox>
          <el-button size="small" text @click="handleInvertSelection">反选</el-button>
        </div>
```

- [ ] **Step 5: 契约 + 类型** — `npm run check:global-account-sidebar && npm run typecheck` → PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 账号列表加全选/反选(全量账号)"
```

---

### Task 2: 批量刷新概览(选中账号)

**Files:** Modify `src/renderer/components/AccountSidebar.vue`、`tools/check-global-account-sidebar-contract.mjs`

- [ ] **Step 1: 契约加断言(红)** — 继续插入:

```js
for (const text of ['refreshingSelectedSummaries', 'handleRefreshSelectedSummaries', '批量刷新']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
```

- [ ] **Step 2: 跑契约确认失败** — FAIL(缺 refreshingSelectedSummaries)

- [ ] **Step 3: 加 ref + handler** — 在 `refreshingAccountSummaries` ref(`:26`)之后加:

```ts
const refreshingSelectedSummaries = ref(false)
```

在 `handleRefreshAccountSummaries`(`:247-279`)之后加:

```ts
async function handleRefreshSelectedSummaries(): Promise<void> {
  if (refreshingSelectedSummaries.value) {
    return
  }

  const selected = new Set(accountsStore.selectedAccountIds)
  const accounts = accountsStore.accounts.filter((account) => selected.has(account.id) && account.ck)

  if (accounts.length === 0) {
    ElMessage.warning('选中账号里没有已登录的可刷新')
    return
  }

  refreshingSelectedSummaries.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const account of accounts) {
      try {
        await refreshAccountSummary(account)
        successCount += 1
      } catch (error) {
        failCount += 1
        logsStore.addLog('账号摘要', account.phone, `刷新失败：${getErrorMessage(error, '刷新失败')}`)
      }
    }
  } finally {
    refreshingSelectedSummaries.value = false
  }

  ElMessage.success(`批量刷新完成：成功 ${successCount} 个，失败 ${failCount} 个`)
}
```

- [ ] **Step 4: 动作行加按钮** — 在 `account-management-actions` 里「移动分组」按钮之后插入:

```html
          <el-button
            size="small"
            :loading="refreshingSelectedSummaries"
            :disabled="accountsStore.selectedCount === 0"
            @click="handleRefreshSelectedSummaries"
          >
            批量刷新
          </el-button>
```

- [ ] **Step 5: 契约 + 类型** — `npm run check:global-account-sidebar && npm run typecheck` → PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 动作行加批量刷新选中账号概览"
```

---

### Task 3: 全量验证

- [ ] **Step 1:** `npm run typecheck && npm run check:all` → PASS
- [ ] **Step 2: 手动 E2E(留用户)**:全选→全部选中/再点清空;部分选中→半选态;反选正确;批量刷新只刷选中且有 ck 的账号、概览数字更新。

## 自检记录

- Spec 覆盖:全选/反选全量(T1)、半选态(T1 `someAccountsChecked`/`indeterminate`)、批量刷新完整概览选中(T2)、契约护栏(T1/T2)、全量验证(T3)。
- 无占位;命名一致:`allAccountsChecked`/`someAccountsChecked`/`handleToggleSelectAll`/`handleInvertSelection`/`refreshingSelectedSummaries`/`handleRefreshSelectedSummaries`。
