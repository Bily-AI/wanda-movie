# 账号区:全选/反选 + 批量刷新概览 · 设计文档

- 日期:2026-07-12
- 范围:`wanda-ticket-1.0.0` 账号侧栏(`AccountSidebar.vue`;store 无需改)
- 目标:账号列表加全选/反选;对选中账号批量刷新完整概览。

## 1. 背景

现状(`AccountSidebar.vue`):
- 多选已有:每行 `el-checkbox`(`:486`)→ `handleAccountCheckedChange`(`:159`)→ `accountsStore.setSelectedAccountIds`;`selectedAccountIds`/`selectedCount`。
- 无全选/反选。
- 刷新:`handleRefreshAccountSummaries`(`:247`)刷**全部已登录**账号完整概览,内部逐个 `refreshAccountSummary(account)`(`:194`,含 登录状态+储值卡+券+等级+W+);无"只刷选中"。

## 2. 需求

1. **全选/反选**:作用于**全部账号**(无视搜索/分组筛选)。
2. **批量刷新概览**:对**选中账号**刷完整概览(复用 `refreshAccountSummary`)。

## 3. 设计

### 3.1 全选/反选(基于全量 `accountsStore.accounts`)
- 账号列表头部新增:`el-checkbox` 全选(带 `indeterminate`)+「反选」文本按钮。
- 计算属性:
  - `allAccountsChecked = accounts.length > 0 && selectedCount === accounts.length`
  - `someAccountsChecked = selectedCount > 0 && selectedCount < accounts.length`(用于 `indeterminate`)
- 处理:
  - `handleToggleSelectAll()`:若 `allAccountsChecked` → `setSelectedAccountIds([])`;否则 → `setSelectedAccountIds(accounts.map(a => a.id))`。
  - `handleInvertSelection()`:`setSelectedAccountIds(accounts.filter(a => !selectedAccountIds.includes(a.id)).map(a => a.id))`。

### 3.2 批量刷新概览(选中账号)
- 动作行(`account-management-actions` `:458`)加「批量刷新」按钮,`:disabled="selectedCount === 0"`,`:loading="refreshingSelectedSummaries"`。
- 新增 `refreshingSelectedSummaries` ref(与全量刷新的 `refreshingAccountSummaries` 独立)。
- `handleRefreshSelectedSummaries()`:
  - 取选中且有 `ck` 的账号:`accounts.filter(a => selectedAccountIds.includes(a.id) && a.ck)`。
  - 空 → `ElMessage.warning('选中账号里没有已登录的可刷新')`。
  - 否则遍历 `refreshAccountSummary`,累计成功/失败(失败写日志,与 `handleRefreshAccountSummaries` 同款),完成 `ElMessage.success('批量刷新完成：成功 N 个，失败 M 个')`。

## 4. 交互/放置

- 全选 + 反选:账号列表「账号列表 / 当前账号」Tab 下、账号行上方的一行(list header)。
- 批量刷新:动作行,置于「移动分组」之后、「批量导出」之前(或行内合适位置)。

## 5. store

- **无需改动**。复用 `setSelectedAccountIds`。

## 6. 测试与验证

- `check-global-account-sidebar` 追加断言:`handleToggleSelectAll`、`handleInvertSelection`、`indeterminate`、`反选`、`handleRefreshSelectedSummaries`、`批量刷新`、`refreshingSelectedSummaries`。
- `npm run typecheck` + `npm run check:all` 通过。
- 手动:全选勾上→全部选中、再点→清空;部分选中→半选态;反选正确;批量刷新只刷选中且有 ck 的账号,概览数字更新。

## 7. 范围外

- 导出到文件、按状态筛选(本次不做)。
- "只刷登录状态"的轻量刷新(用户选了完整概览,不做轻量版)。

## 8. 风险

- 全选作用于全量账号(无视筛选),若账号很多批量刷新耗时较长——串行执行、有 loading 态提示,可接受。
