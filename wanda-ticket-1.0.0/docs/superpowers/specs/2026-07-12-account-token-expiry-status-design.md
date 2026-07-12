# 账号 token 到期状态(本地 30 天)+ 刷新失效判定 · 设计文档

- 日期:2026-07-12
- 范围:`wanda-ticket-1.0.0` 账号侧栏状态显示 + 账号数据模型 + 刷新校验
- 目标:账号状态从"静态正常"改为**本地基于登录时间的 30 天到期倒计时 + 刷新失效判定**。

## 1. 背景

现状(见 [[wanda-ticket-legacy-align]] 附近排查):账号行的「正常」是登录/导入时贴的**静态标签**,不反映 token 是否还有效;真正能校验的 `checkCurrentLoginStatus()` 是死代码;「批量刷新」调了 `checkLoginStatus` 但不更新状态且吞掉失败。

## 2. 需求(用户已确认)

- token 有效期**本地固定 30 天**,从"登录时间"起算。
- 登录成功记住登录时间;**重新登录**更新登录时间;**导入账号**按导入时间算登录时间。
- 状态按优先级显示:无 ck →「待登录」;刷新判定失效 →「异常」(红);已过期 →「已过期」(红);≤3 天到期 →「N 天后到期」(红,N 向上取整);其它 →「正常」(默认色)。
- 刷新(批量刷新 + 单个刷新)时校验:`checkLoginStatus` 失败/未登录/token 有误 → 标「异常」(落库);成功 → 恢复。

## 3. 数据模型(`src/shared/localData.ts`)

`WandaAccount` 新增两个**可选**字段(可选=老数据无需迁移,构造器不用全改):
- `lastLoginAt?: string` — 登录/导入时间(ISO),token 到期基准。
- `loginInvalid?: boolean` — 刷新判定登录失效标记。

赋值点:
- 登录成功(`accounts.ts` `loginWandaAccount`):`lastLoginAt = now`,`loginInvalid = false`(重新登录时同样更新)。
- 导入(`normalizeImportedAccount`):`lastLoginAt = now`(= 导入时间),`loginInvalid = false`。
- 其它历史构造器不改(字段可选,计算时回退 `createdAt`)。

## 4. 状态计算(展示口径,纯本地)

组件内 `accountStatusInfo(account): { text: string; warn: boolean }`:

```
无 ck                          → { '待登录', warn:false }
loginInvalid === true          → { '异常', warn:true }
base = Date.parse(lastLoginAt || createdAt)；无效 base → { '正常', warn:false }
expireAt = base + 30*24*3600*1000
daysLeft = ceil((expireAt - now) / 一天)
daysLeft <= 0                  → { '已过期', warn:true }
daysLeft <= 3                  → { `${daysLeft}天后到期`, warn:true }
其它                            → { '正常', warn:false }
```

- `now` 用 `Date.now()`(渲染进程 app 代码,允许)。

## 5. 显示(`AccountSidebar.vue` 账号行 em)

把现有 `accountMetaLabel`(`group · (isPayMember?'W+':statusText)`)替换为:

```html
<em>
  <template v-if="accountGroupName(account)">{{ accountGroupName(account) }} · </template>
  <span :class="{ 'account-state--warn': accountStatusInfo(account).warn }">{{ accountStatusInfo(account).text }}</span>
</em>
```

- 新增 CSS `.account-state--warn { color: var(--el-color-danger, #f56c6c); font-weight: 600; }`。
- W+ 会员标识不再挤在状态位(状态位专用于登录/到期);W+ 仍可从其它元素体现(本次不动)。

## 6. 刷新校验(`AccountSidebar.vue` `refreshAccountSummary` + store)

- 新增 store action `setAccountLoginState(accountId, valid: boolean)`:
  ```
  loginInvalid = !valid
  status = valid ? 'normal' : 'expired'
  statusText = valid ? '正常' : '异常'
  saveAccounts()
  ```
  (独立于 `updateAccountProfileSummary`,不改其 Pick,避免破 `check:global-account-sidebar` 的 Pick 断言。)
- `refreshAccountSummary` 末尾:`await accountsStore.setAccountLoginState(account.id, loginStatusResult.status === 'fulfilled')`。
  - 成功 → 恢复(loginInvalid=false),到期倒计时接管显示。
  - 失败(reject:未登录/token 有误)→ 异常。

## 7. 测试与验证

- `npm run typecheck` + `npm run check:all` 通过(必要时同步契约)。
- 契约追加:`setAccountLoginState`、`accountStatusInfo`、`lastLoginAt`、`loginInvalid`、`account-state--warn`。
- 手动 E2E(留用户,含"假 token"验证):
  - 登录成功 → 状态「正常」;把某账号 `lastLoginAt` 改到 28 天前 → 显示「2天后到期」红;改到 31 天前 → 「已过期」红。
  - 导入账号 → 状态「正常」,基准=导入时间。
  - **用一个假/失效 token 的账号 → 点「批量刷新」/「刷新」→ 状态变「异常」红**;换真 token 刷新 → 恢复。

## 8. 范围外
- 不做后端真实到期时间对接(纯本地 30 天)。
- 当前账号卡片状态徽标沿用 `statusText`(本次只改列表行),如需一致后续再说。
- 到期自动重登/提醒推送不做。

## 9. 风险
- 30 天为固定假设,若万达实际有效期不同会有偏差(纯本地估算,用户已接受)。
- `Date.now()` 依赖本机时间;机器时间不准会影响倒计时。
