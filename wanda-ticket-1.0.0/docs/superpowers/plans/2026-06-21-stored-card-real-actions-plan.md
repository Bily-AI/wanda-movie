# 储值卡真实操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按旧 Electron 打包产物恢复储值卡页的真实列表、详情、卡片视图、批量账号读取、充值、购买和赠送入口。

**Architecture:** 继续沿用当前项目的 `featureApi.ts` + Vue 页面本地状态模式。万达请求仍走 `wandaGet` 和主进程白名单；支付相关接口只返回支付参数，不自动调用旧包 `alipay-convert`。

**Tech Stack:** Electron、Vue 3、Element Plus、Pinia、旧万达接口签名请求。

---

### Task 1: 储值卡契约红灯

**Files:**
- Create: `tools/check-stored-card-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: 写契约检查**

检查设计文档、白名单 path、`featureApi.ts` 导出函数、`StoredValueCardView.vue` 页面状态和按钮处理函数。

- [ ] **Step 2: 运行红灯**

Run: `npm run check:stored-card`
Expected: FAIL，提示缺少储值卡真实接口或页面函数。

### Task 2: 服务层接回旧包储值卡接口

**Files:**
- Modify: `src/shared/wandaCore.ts`
- Modify: `src/renderer/services/featureApi.ts`

- [ ] **Step 1: 放行旧包路径**

新增 `/card/transfer.version`、`/card/recharge.version`、`/order/create.api`、`/order/prepay.api` 等储值卡真实链路需要的 path。

- [ ] **Step 2: 扩展储值卡类型**

补 `presentBalance`、`available`、`statusDesc`、`remainingCount`、`categoryName`、`discountRate`、`effectDate`、`coverName`、`unavailableReason`、`ownerPhone` 和 `balanceInfo`。

- [ ] **Step 3: 新增真实动作函数**

实现 `fetchStoredCardsWithBalance`、`fetchOrderPayCards`、`transferStoredCard`、`createStoredCardOrder`、`prepayStoredCardOrder`、`rechargeStoredCard`、`createStoredCardPurchasePayment`、`createStoredCardRechargePayment`。

- [ ] **Step 4: 运行契约绿灯**

Run: `npm run check:stored-card`
Expected: PASS。

### Task 3: 页面按钮和弹窗接入

**Files:**
- Modify: `src/renderer/views/StoredValueCardView.vue`

- [ ] **Step 1: 替换占位按钮**

删除 `handlePaymentFeature`，实现列表/卡片切换、当前账号刷新、全部账号刷新、详情、充值、购买、赠送。

- [ ] **Step 2: 增加弹窗**

详情弹窗展示旧包字段；充值/购买弹窗选择旧包面值并展示返回的支付参数；赠送弹窗校验手机号并真实调用转赠接口。

- [ ] **Step 3: 运行检查**

Run: `npm run check:stored-card && npm run typecheck`
Expected: PASS。

### Task 4: 完整验证和重启

**Files:**
- No file changes.

- [ ] **Step 1: 全量构建**

Run: `npm run build`
Expected: PASS。

- [ ] **Step 2: 重启开发应用**

关闭本项目旧 Electron/Node 进程后执行 `npm run dev`，确认 `http://localhost:5173/` 返回 200。
