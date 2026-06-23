# 全局账号栏修正设计

## 背景

旧 Electron 打包产物里，账号列表和万达账号登录不是购票页的局部内容。旧版 `App` 的主界面在业务页面外层包了固定工作区：左侧渲染 `AccountPanel` 和 `LoginPanel`，右侧通过 `router-view` 渲染购票、历史订单、储值卡、兑换券、会员、活动、日志、设置等页面。

新版本之前把账号列表、分组搜索、导入账号和万达登录表单写在 `TicketView.vue` 内，导致只有购票页能看到完整账号栏。其他页面虽然读取同一个账号状态，但用户无法在页面内直接切换账号，这和旧版使用习惯不一致。

## 目标

- 账号列表和万达登录入口改为全局侧栏。
- 购票页只保留购票查询、座位、订单和支付相关区域。
- 所有主业务页面共享同一个当前账号状态。
- 保留原有账号 store、登录接口、导入账号、分组搜索和批量选择能力。

## 方案

新增 `src/renderer/components/AccountSidebar.vue`，承接原来 `TicketView.vue` 中的账号栏功能。`App.vue` 在顶部导航下方建立两列工作区：左侧固定渲染 `AccountSidebar`，右侧渲染 `router-view`。

`TicketView.vue` 删除局部账号栏模板、账号栏专属样式和账号栏操作函数，只保留监听当前账号变化的逻辑，用于清理购票页订单上下文。

## 验证

新增 `tools/check-global-account-sidebar-contract.mjs`，检查：

- `App.vue` 引入并渲染 `AccountSidebar`。
- 全局工作区包含 `workspace-layout` 和 `workspace-content`。
- `AccountSidebar.vue` 保留账号 store、导入账号和万达登录动作。
- `TicketView.vue` 不再包含局部账号栏和账号导入函数。
