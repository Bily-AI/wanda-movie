# 账号 token 30天到期状态 + 刷新失效判定 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(主会话内联执行)。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 账号状态改为本地基于登录时间的 30 天到期倒计时(正常/N天后到期/已过期),并在刷新时用 checkLoginStatus 判定「异常」。

**Architecture:** `WandaAccount` 加可选 `lastLoginAt`/`loginInvalid`;登录/导入写入基准时间;组件内 `accountStatusInfo` 纯本地算到期状态并着色;刷新时 `setAccountLoginState` 落 异常/恢复。

**Tech Stack:** Vue3 + Pinia + Element Plus + TS;测试面 `tools/check-*.mjs` + `vue-tsc`。

## Global Constraints

- token 有效期本地固定 30 天,基准 = `lastLoginAt || createdAt`。
- 状态优先级:无 ck→待登录;`loginInvalid`→异常(红);已过期(daysLeft≤0)→已过期(红);daysLeft≤3→「N天后到期」(红,向上取整);其它→正常(默认色)。
- 刷新(批量+单个,都走 `refreshAccountSummary`)校验:`checkLoginStatus` fulfilled→恢复;rejected→异常。
- `now` 用 `Date.now()`(渲染进程允许)。
- 每任务:`npm run typecheck` + `check:global-account-sidebar` 通过,提交。

---

### Task 1: 数据模型 + store(基准时间 + 失效落库)

**Files:** Modify `src/shared/localData.ts`、`src/renderer/stores/accounts.ts`、`tools/check-global-account-sidebar-contract.mjs`

- [ ] **Step 1: 契约加断言(红)** — 在 `check-global-account-sidebar-contract.mjs` 的 `console.log('全局账号侧栏契约检查通过')` 前插入:

```js
for (const text of ['lastLoginAt', 'loginInvalid']) {
  assertIncludes('src/shared/localData.ts', localData, text)
}
assertIncludes('src/renderer/stores/accounts.ts', accountsStore, 'async setAccountLoginState(')
```

- [ ] **Step 2: 跑契约确认失败** — `npm run check:global-account-sidebar` → FAIL(localData 缺 lastLoginAt)

- [ ] **Step 3: 类型加字段** — `src/shared/localData.ts:34` 的 `growthValue: number | null` 之后加:

```ts
  growthValue: number | null
  lastLoginAt?: string
  loginInvalid?: boolean
```

- [ ] **Step 4: 登录写入基准** — `src/renderer/stores/accounts.ts` 登录构造对象(`loginWandaAccount` 内,`memberGradeName: ''` / `growthValue: null` 结尾处)改为:

```ts
          memberGradeName: '',
          growthValue: null,
          lastLoginAt: now.toISOString(),
          loginInvalid: false
```

- [ ] **Step 5: 导入写入基准** — `normalizeImportedAccount` 的返回对象(`growthValue: null` 结尾)改为:

```ts
    growthValue: null,
    lastLoginAt: now.toISOString(),
    loginInvalid: false
```

- [ ] **Step 6: 加 setAccountLoginState** — `accounts.ts` `updateAccountProfileSummary` action(以 `await this.saveAccounts()\n    },` 结尾)之后新增:

```ts
    async setAccountLoginState(accountId: string, valid: boolean) {
      const index = this.accounts.findIndex((acc) => acc.id === accountId)

      if (index === -1) {
        return
      }

      this.accounts[index] = {
        ...this.accounts[index],
        loginInvalid: !valid,
        status: valid ? 'normal' : 'expired',
        statusText: valid ? '正常' : '异常'
      }
      await this.saveAccounts()
    },
```

- [ ] **Step 7: 契约 + 类型** — `npm run check:global-account-sidebar && npm run typecheck` → PASS

- [ ] **Step 8: 提交**

```bash
git add src/shared/localData.ts src/renderer/stores/accounts.ts tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 加 lastLoginAt/loginInvalid 与 setAccountLoginState"
```

---

### Task 2: 状态显示(本地到期计算 + 着色)

**Files:** Modify `src/renderer/components/AccountSidebar.vue`、`tools/check-global-account-sidebar-contract.mjs`

**Interfaces:** Produces `accountGroupName(account)`、`accountStatusInfo(account): { text: string; warn: boolean }`。

- [ ] **Step 1: 契约加断言(红)** — 继续插入:

```js
for (const text of ['function accountStatusInfo(', "'account-state--warn'", '天后到期']) {
  assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, text)
}
```

- [ ] **Step 2: 跑契约确认失败** — FAIL(缺 accountStatusInfo)

- [ ] **Step 3: 替换 accountMetaLabel** — `AccountSidebar.vue` 的 `accountMetaLabel` 函数整段替换为:

```ts
function accountGroupName(account: WandaAccount): string {
  return accountsStore.groups.find((group) => group.id === account.groupId)?.name || ''
}

function accountStatusInfo(account: WandaAccount): { text: string; warn: boolean } {
  if (!account.ck) {
    return { text: '待登录', warn: false }
  }

  if (account.loginInvalid) {
    return { text: '异常', warn: true }
  }

  const base = Date.parse(account.lastLoginAt || account.createdAt || '')

  if (!Number.isFinite(base)) {
    return { text: '正常', warn: false }
  }

  const dayMs = 24 * 60 * 60 * 1000
  const daysLeft = Math.ceil((base + 30 * dayMs - Date.now()) / dayMs)

  if (daysLeft <= 0) {
    return { text: '已过期', warn: true }
  }

  if (daysLeft <= 3) {
    return { text: `${daysLeft}天后到期`, warn: true }
  }

  return { text: '正常', warn: false }
}
```

- [ ] **Step 4: 改 em 模板** — 账号行 `<span class="row-meta">` 内的:

```html
              <em>{{ accountMetaLabel(account) }}</em>
```

替换为:

```html
              <em>
                <template v-if="accountGroupName(account)">{{ accountGroupName(account) }} · </template>
                <span :class="{ 'account-state--warn': accountStatusInfo(account).warn }">{{ accountStatusInfo(account).text }}</span>
              </em>
```

- [ ] **Step 5: 加 CSS** — `<style scoped>` 内 `.row-meta` 相关附近新增:

```css
.account-state--warn {
  color: var(--el-color-danger, #f56c6c);
  font-weight: 600;
}
```

- [ ] **Step 6: 契约 + 类型** — `npm run check:global-account-sidebar && npm run typecheck` → PASS

- [ ] **Step 7: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 账号状态改为本地30天到期倒计时并着色"
```

---

### Task 3: 刷新校验落 异常/恢复

**Files:** Modify `src/renderer/components/AccountSidebar.vue`、`tools/check-global-account-sidebar-contract.mjs`

**Interfaces:** Consumes `accountsStore.setAccountLoginState`(Task 1)。

- [ ] **Step 1: 契约加断言(红)** — 继续插入:

```js
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'setAccountLoginState(account.id, loginStatusResult.status === ')
```

- [ ] **Step 2: 跑契约确认失败** — FAIL

- [ ] **Step 3: refreshAccountSummary 末尾加校验落库** — `AccountSidebar.vue` `refreshAccountSummary` 结尾的:

```ts
  if (Object.keys(summary).length > 0) {
    await accountsStore.updateAccountProfileSummary(account.id, summary)
  }
}
```

替换为:

```ts
  if (Object.keys(summary).length > 0) {
    await accountsStore.updateAccountProfileSummary(account.id, summary)
  }

  await accountsStore.setAccountLoginState(account.id, loginStatusResult.status === 'fulfilled')
}
```

- [ ] **Step 4: 契约 + 类型** — `npm run check:global-account-sidebar && npm run typecheck` → PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/components/AccountSidebar.vue tools/check-global-account-sidebar-contract.mjs
git commit -m "feat(accounts): 刷新时校验 checkLoginStatus 落异常/恢复"
```

---

### Task 4: 全量验证

- [ ] **Step 1:** `npm run typecheck && npm run check:all` → PASS
- [ ] **Step 2: 手动 E2E(留用户)**:
  - 登录/导入 → 「正常」;把某账号 `lastLoginAt` 手改到 28 天前 → 「2天后到期」红;改到 31 天前 → 「已过期」红。
  - **假/失效 token 账号 → 批量刷新/刷新 → 「异常」红**;换真 token 刷新 → 恢复正常/到期计算。

## 自检记录

- Spec 覆盖:字段(T1)、登录/导入基准(T1)、setAccountLoginState(T1)、到期计算+着色(T2)、em 显示(T2)、刷新落异常/恢复(T3)、契约(T1-3)、全量(T4)。
- 无占位;命名一致:`lastLoginAt`/`loginInvalid`/`setAccountLoginState`/`accountStatusInfo`/`accountGroupName`/`account-state--warn`。
