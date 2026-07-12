# 账号导出 + 分隔符改 `----` + 批量删除/导出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(本次主会话内联执行)。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 账号侧栏新增导出账号、把导入分隔符 `---` 直接改为 `----`、支持批量删除与批量导出选中账号。

**Architecture:** store 层(`accounts.ts`)加导出/批量删除 action 并改分隔符;视图层(`AccountSidebar.vue`)加导出按钮、导出对话框、批量删除/导出按钮与处理函数;用 `check-global-account-sidebar-contract.mjs` 追加断言作红/绿护栏。

**Tech Stack:** Electron + Vue3 + Pinia + Element Plus + TypeScript;测试面为 `tools/check-*.mjs` 契约脚本 + `vue-tsc`。

## Global Constraints

- 分隔符**直接** `---` → `----`,**不保留三杠兼容**(用户明确)。
- 导出格式与导入互通:有备注 `备注----ck----手机号----登录时间`;无备注 `手机号----ck----登录时间`。
- 导出交互 = 只读 textarea 对话框 + 复制,**不使用 Electron 文件 API**。
- `WandaAccount` 字段:`id/phone/remark/groupId/ck/userIdentifier/loginDate/loginTime`(`src/shared/localData.ts:15`)。
- 每个任务结束:`npm run typecheck` 通过 + 相关契约通过 + 提交。

---

### Task 1: store 层——分隔符改 `----`、导出与批量删除 action

**Files:**
- Modify: `src/renderer/stores/accounts.ts`(`:174` 分隔符;新增 helper 与两个 action)
- Modify: `tools/check-global-account-sidebar-contract.mjs`(追加 store 断言)

**Interfaces:**
- Produces:`exportAccountsToText(ids?: string[]): string`、`async deleteAccounts(ids: string[]): Promise<number>`、模块内 `formatAccountExportLine(account: WandaAccount): string`。

- [ ] **Step 1: 契约追加 store 断言(先失败)** — 在 `tools/check-global-account-sidebar-contract.mjs` 的 `console.log('全局账号侧栏契约检查通过')` 之前插入:

```js
// 账号导入分隔符改为 ----（不兼容三杠）
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, ".split('----')")
assertNotIncludes('src/renderer/stores/accounts.ts', accountsStore, ".split('---')")
for (const text of ['formatAccountExportLine', 'exportAccountsToText', 'async deleteAccounts(']) {
  assertIncludes('src/renderer/stores/accounts.ts', accountsStore, text)
}
```

- [ ] **Step 2: 跑契约确认失败**

Run: `npm run check:global-account-sidebar`
Expected: FAIL(`accounts.ts should include .split('----')`)

- [ ] **Step 3: 改分隔符** — `src/renderer/stores/accounts.ts:173-176`,把:

```ts
  const legacyParts = line
    .split('---')
    .map((part) => part.trim())
    .filter(Boolean)
```

改为:

```ts
  const legacyParts = line
    .split('----')
    .map((part) => part.trim())
    .filter(Boolean)
```

- [ ] **Step 4: 加导出 helper** — 在 `parseImportedAccounts` 函数之后(约 `:249` 之后、`toPlainAccountsData` 之前)新增:

```ts
function formatAccountExportLine(account: WandaAccount): string {
  const loginTime = (account.loginTime || account.loginDate || '').trim()
  const parts = account.remark?.trim()
    ? [account.remark.trim(), account.ck, account.phone, loginTime]
    : [account.phone, account.ck, loginTime]

  return parts.map((part) => (part ?? '').trim()).filter(Boolean).join('----')
}
```

- [ ] **Step 5: 加两个 action** — 在 `deleteAccount`(`:403-414`)之后新增:

```ts
    exportAccountsToText(ids?: string[]): string {
      const idSet = ids && ids.length > 0 ? new Set(ids) : null
      const list = idSet ? this.accounts.filter((account) => idSet.has(account.id)) : this.accounts

      return list.map((account) => formatAccountExportLine(account)).join('\n')
    },
    async deleteAccounts(ids: string[]) {
      const idSet = new Set(ids)
      const removed = this.accounts.filter((account) => idSet.has(account.id)).length

      if (removed === 0) {
        return 0
      }

      this.accounts = this.accounts.filter((account) => !idSet.has(account.id))

      if (idSet.has(this.currentAccountId)) {
        this.currentAccountId = ''
      }

      this.selectedAccountIds = this.selectedAccountIds.filter((selId) => !idSet.has(selId))
      await this.saveAccounts()
      this.loginForm.message = `已删除 ${removed} 个账号`
      useLogsStore().addLog('账号删除', '批量', this.loginForm.message)
      return removed
    },
```

- [ ] **Step 6: 契约 + 类型**

Run: `npm run check:global-account-sidebar && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/renderer/stores/accounts.ts tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 分隔符改----，store 加导出与批量删除"
```

---

### Task 2: 侧栏——导出账号按钮 + 导出对话框 + 占位符改 `----`

**Files:**
- Modify: `src/renderer/components/AccountSidebar.vue`(占位符 `:36`;`<script>` 加 ref/handler;登录卡头部 `:531` 加导出按钮;末尾加导出对话框)
- Modify: `tools/check-global-account-sidebar-contract.mjs`(追加导出 UI 断言)

**Interfaces:**
- Consumes:`accountsStore.exportAccountsToText`(Task 1)。
- Produces:`exportDialogVisible` ref、`handleExportAccounts()`、`handleCopyExportText()`。

- [ ] **Step 1: 契约追加导出 UI 断言(先失败)** — 在 Task 1 追加块之后继续插入:

```js
for (const text of ['手机号----ck', '导出账号', 'handleExportAccounts', 'handleCopyExportText', 'exportDialogVisible']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
```

- [ ] **Step 2: 跑契约确认失败**

Run: `npm run check:global-account-sidebar`
Expected: FAIL(`AccountSidebar.vue should include 导出账号`)

- [ ] **Step 3: 改占位符** — `src/renderer/components/AccountSidebar.vue:35-36` 替换为:

```ts
const importAccountsPlaceholder =
  '支持格式：手机号----ck、备注----ck----手机号----登录时间、JSON 数组\n[{"phone":"13800138000","ck":"..."}]'
```

- [ ] **Step 4: 加 script 状态与处理函数** — 在 `importAccountsDialogVisible`/`importAccountsText` ref 声明(`:33-34`)之后新增:

```ts
const exportDialogVisible = ref(false)
const exportText = ref('')

function handleExportAccounts(): void {
  if (accountsStore.accounts.length === 0) {
    ElMessage.warning('暂无账号可导出')
    return
  }

  exportText.value = accountsStore.exportAccountsToText()
  exportDialogVisible.value = true
}

async function handleCopyExportText(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportText.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}
```

- [ ] **Step 5: 登录卡头部加导出按钮** — `src/renderer/components/AccountSidebar.vue:531`,在「导入账号」按钮之后加一行:

```html
          <el-button size="small" text @click="handleImportAccounts">导入账号</el-button>
          <el-button
            size="small"
            text
            :disabled="accountsStore.accounts.length === 0"
            @click="handleExportAccounts"
          >
            导出账号
          </el-button>
```

- [ ] **Step 6: 末尾加导出对话框** — 在导入对话框 `</el-dialog>`(`:684`)之后新增:

```html
    <el-dialog
      v-model="exportDialogVisible"
      title="导出账号"
      width="620px"
      append-to-body
      class="legacy-account-import-dialog"
    >
      <el-input v-model="exportText" type="textarea" :rows="12" resize="none" readonly />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="exportDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="handleCopyExportText">复制</el-button>
        </span>
      </template>
    </el-dialog>
```

- [ ] **Step 7: 契约 + 类型**

Run: `npm run check:global-account-sidebar && npm run typecheck`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 新增导出账号按钮与导出对话框，占位符改----"
```

---

### Task 3: 侧栏——批量删除 + 批量导出按钮

**Files:**
- Modify: `src/renderer/components/AccountSidebar.vue`(动作行 `:458-465` 加两键;`<script>` 加两个 handler)
- Modify: `tools/check-global-account-sidebar-contract.mjs`(追加批量断言)

**Interfaces:**
- Consumes:`accountsStore.deleteAccounts`、`accountsStore.exportAccountsToText`、`exportDialogVisible`/`exportText`(Task 1/2)。
- Produces:`handleBatchDeleteAccounts()`、`handleBatchExportAccounts()`。

- [ ] **Step 1: 契约追加批量断言(先失败)** — 继续插入:

```js
for (const text of ['批量删除', '批量导出', 'handleBatchDeleteAccounts', 'handleBatchExportAccounts', 'deleteAccounts(accountsStore.selectedAccountIds']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
```

- [ ] **Step 2: 跑契约确认失败**

Run: `npm run check:global-account-sidebar`
Expected: FAIL(`AccountSidebar.vue should include 批量删除`)

- [ ] **Step 3: 加两个 handler** — 在 `handleCopyExportText`(Task 2)之后新增:

```ts
function handleBatchExportAccounts(): void {
  if (accountsStore.selectedCount === 0) {
    return
  }

  exportText.value = accountsStore.exportAccountsToText(accountsStore.selectedAccountIds)
  exportDialogVisible.value = true
}

async function handleBatchDeleteAccounts(): Promise<void> {
  if (accountsStore.selectedCount === 0) {
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除选中的 ${accountsStore.selectedCount} 个账号吗？`, '批量删除账号', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  const count = await accountsStore.deleteAccounts(accountsStore.selectedAccountIds)
  ElMessage.success(`已删除 ${count} 个账号`)
}
```

- [ ] **Step 4: 动作行加两键** — `src/renderer/components/AccountSidebar.vue:458-465` 的 `account-management-actions` 块替换为:

```html
        <div class="account-management-actions">
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleMoveSelectedToGroup">
            移动分组
          </el-button>
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleBatchExportAccounts">
            批量导出
          </el-button>
          <el-button
            size="small"
            type="danger"
            :disabled="accountsStore.selectedCount === 0"
            @click="handleBatchDeleteAccounts"
          >
            批量删除
          </el-button>
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleCancelSelection">
            取消选择
          </el-button>
        </div>
```

- [ ] **Step 5: 契约 + 类型**

Run: `npm run check:global-account-sidebar && npm run typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 动作行加批量删除与批量导出"
```

---

### Task 4: 全量验证

- [ ] **Step 1: 类型 + 全契约**

Run: `npm run typecheck && npm run check:all`
Expected: PASS(42+ 项全过)

- [ ] **Step 2: 记录手动 E2E(留用户真机验证)**

- 导入 `13800138000----abcCK` 单行 → 账号入库、手机号/ck 正确。
- 导入 `测试备注----abcCK----13800138000----2026-07-01` → 备注/ck/手机号/登录时间正确。
- 旧三杠文本 `13800138000---abcCK` → **不再识别**(符合预期,不兼容)。
- 点「导出账号」→ 对话框文本为 `----` 格式、可复制、复制内容再导入可往返。
- 多选 2 个 → 「批量导出」只含选中两条;「批量删除」确认后移除、选择清空、当前账号若被删则清空。

## 自检记录

- Spec 覆盖:分隔符改 `----`(T1)、不兼容(T1 断言 NotIncludes `.split('---')`)、导出 helper/action(T1)、批量删除 action(T1)、导出按钮+对话框+占位符(T2)、批量删除/导出按钮(T3)、契约护栏(T1-3)、全量验证(T4)。
- 无占位:各步给出完整替换代码与命令。
- 类型/命名一致:`exportAccountsToText`/`deleteAccounts`/`formatAccountExportLine`/`handleExportAccounts`/`handleBatchExportAccounts`/`handleBatchDeleteAccounts`/`exportDialogVisible`/`exportText` 贯穿一致。
