# 购票支付组装对齐旧版 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(本次由主会话内联执行,用户授权 7 小时自主推进)。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 把新版购票页的提交支付组装与价格显示改成旧版口径,修复"实付虚高"和"不用卡时支付宝弹不出来"。

**Architecture:** 只改客户端 `requestInfo` 组装与价格 getters/显示(提交端点已对齐)。应付总盘子 = `活动价/券后价`(单字段,分),逐卡分摊后余额走支付宝;删掉"选活动必须选卡"的 throw 与本地 `×0.87` 折扣。

**Tech Stack:** Electron + Vue3 + Pinia + TypeScript;仓库用 `tools/check-*.mjs` 契约脚本作测试面,`vue-tsc` 类型检查。

## Global Constraints

- 一切以旧版为准(`resources/app/out/renderer/assets/TicketView-3q5SUv8Y.js`)。
- `externalPayment`:`paySdkId: 1057`、`paymentType: 1057`、`returnUrl: 'wandafilm/pay/finished'`、`verifyCode: ''` 必须保留(契约 `check:payment-submit` 强校验)。
- 单位:座位价 `currentOrder.amountCent` 已是分;活动 `activity.price` 是元(需 `yuanToCents`);券 `useResult.price` 已是分;卡 `card.balance` 是元(需 `yuanToCents`)。
- 每个任务结束:`npm run typecheck` 通过 + 相关契约通过 + 提交。

---

### Task 1: 重写 `buildTicketPaymentRequestInfo` 为旧版公式(核心:修支付宝)

**Files:**
- Modify: `src/renderer/stores/ticket.ts:1437-1555`(函数体)
- Modify: `tools/check-payment-submit-contract.mjs`(加新断言)

**Interfaces:**
- Consumes:`this.paymentActivities/paymentCards/selectedPaymentCards/paymentActivity`、`currentOrder.amountCent`、`couponPaymentInfo.useResult.price`、`couponPaymentInfo.useResult.itemList`、`couponPaymentInfo.selection.voucher`、helpers `yuanToCents`。
- Produces:`BuiltTicketPaymentRequestInfo`(结构不变,含 `externalPayment/activity?/cardPayment?/storedCardPayments?/ticketVoucher?/couponPaymentList?/verifyCode`)。

- [ ] **Step 1: 契约加新断言(先失败)** — 在 `tools/check-payment-submit-contract.mjs` 的 `requestInfoBuilderBlock` 校验段(约 271-282 行的 `for` 之后)追加:

```js
// 旧版口径：无“选活动必须选卡”的 throw；应付总盘子为单字段活动价/券后价
assertNotIncludes('src/renderer/stores/ticket.ts', requestInfoBuilderBlock, '当前支付活动需要先选择支付卡')
for (const label of [
  'const totalPayPriceCent =',
  'yuanToCents(selectedActivity.price)',
  'couponPaymentInfo.useResult.price',
  'const externalPaymentPrice = Math.max(0, remainingCardPrice)',
  'const discountPrice = Math.max(0, seatTotalPriceCent - totalPayPriceCent)'
]) {
  assertIncludes('src/renderer/stores/ticket.ts', requestInfoBuilderBlock, label)
}
assertNotIncludes('src/renderer/stores/ticket.ts', requestInfoBuilderBlock, 'resolveActivityPaymentAmounts')
```

- [ ] **Step 2: 跑契约确认失败**

Run: `npm run check:payment-submit`
Expected: FAIL(`ticket.ts` 仍含 `当前支付活动需要先选择支付卡` / 缺 `totalPayPriceCent`)

- [ ] **Step 3: 替换函数体** — 将 `src/renderer/stores/ticket.ts` 中从 `const selectedActivity = this.paymentActivity`(1441)到 `return requestInfo`(1554)之间整段替换为:

```ts
      const selectedActivity = this.paymentActivity
        ? this.paymentActivities.find((activity) => activity.code === this.paymentActivity || activity.name === this.paymentActivity)
        : undefined
      const selectedCards = this.selectedPaymentCards
        .map((cardNo) => this.paymentCards.find((card) => card.cardNo === cardNo))
        .filter((card): card is PaymentCard => Boolean(card))
        .slice(0, 5)

      if (this.paymentActivity && !selectedActivity) {
        throw new Error('当前支付活动已失效，请刷新支付前置数据后重试')
      }

      const isCouponPayment = Boolean(couponPaymentInfo)
      const primaryCard = selectedCards[0]
      const seatTotalPriceCent = Math.max(0, currentOrder.amountCent)

      // 旧版口径：应付总盘子 = 券后价 / 活动价 / 0（单字段，分）
      const totalPayPriceCent = couponPaymentInfo
        ? Math.max(0, Math.round(couponPaymentInfo.useResult.price))
        : selectedActivity
          ? yuanToCents(selectedActivity.price)
          : 0

      // 逐卡分摊：券模式不分摊卡；否则前 5 张选中卡按 min(余额, 剩余) 递减
      const cardsToAllot = isCouponPayment ? [] : selectedCards
      let remainingCardPrice = totalPayPriceCent
      const storedCardPayments: TicketStoredCardPayment[] = []

      for (const card of cardsToAllot) {
        if (remainingCardPrice <= 0) {
          break
        }

        const cardBalance = yuanToCents(card.balance)
        const paymentPrice = Math.min(cardBalance, remainingCardPrice)

        if (paymentPrice <= 0) {
          continue
        }

        storedCardPayments.push({
          cardNumber: card.cardNo,
          paymentPrice,
          paymentType: 1,
          ticketType: card.cardTypeCode,
          ticketTypeName: card.cardTypeName
        })
        remainingCardPrice -= paymentPrice
      }

      const externalPaymentPrice = Math.max(0, remainingCardPrice)
      const discountPrice = Math.max(0, seatTotalPriceCent - totalPayPriceCent)

      const requestInfo: BuiltTicketPaymentRequestInfo = {
        contextId: '',
        currentPrice: 0,
        externalPayment: {
          paySdkId: 1057,
          paymentPrice: externalPaymentPrice,
          paymentType: 1057,
          returnUrl: 'wandafilm/pay/finished'
        },
        goodInfo: '',
        orderId: String(currentOrder.orderId)
      }

      if (couponPaymentInfo) {
        requestInfo.ticketVoucher = {
          discountPrice,
          voucher: couponPaymentInfo.selection.voucher
        }
      }

      if (!isCouponPayment && selectedActivity && selectedActivity.allotSeat && primaryCard) {
        requestInfo.activity = {
          allotJson: selectedActivity.allotSeatRaw || '{}',
          card: {
            cardNumber: primaryCard.cardNo,
            quantity: 0
          },
          discountPrice,
          integral: 0,
          ticketType: selectedActivity.code,
          ticketTypeName: primaryCard.cardTypeName,
          type: selectedActivity.detailType
        }
      }

      if (storedCardPayments.length > 0) {
        requestInfo.cardPayment = storedCardPayments[0]
        requestInfo.storedCardPayments = storedCardPayments
      }

      if (couponPaymentInfo) {
        requestInfo.couponPaymentList = couponPaymentInfo.useResult.itemList.map((item) => ({
          actuallyPaidAmount: item.payPrice ?? item.actuallyPaidAmount,
          rightsCode: '',
          seatId: Number(item.seat ?? item.seatId),
          ticketCode: '',
          ticketType: 0,
          usedCoupon: 1
        }))
      }

      Object.assign(requestInfo, { verifyCode: '' })

      return requestInfo
```

- [ ] **Step 4: 跑契约 + 类型**

Run: `npm run check:payment-submit && npm run typecheck`
Expected: PASS(契约通过;类型无 `resolveActivityPaymentAmounts` 未用报错前提是 Task 2 也会清理——本步允许 `resolveActivityPaymentAmounts` 暂时保留未用,`noUnusedLocals` 若报错则在 Task 2 一并清理;若类型此步失败仅因该函数未用,记录并继续 Task 2)

- [ ] **Step 5: 提交**

```bash
git add src/renderer/stores/ticket.ts tools/check-payment-submit-contract.mjs
git commit -m "fix: 提交支付组装对齐旧版单字段口径，解除活动强制选卡"
```

---

### Task 2: 对齐价格显示 getters,删除 `resolveActivityPaymentAmounts`

**Files:**
- Modify: `src/renderer/stores/ticket.ts`(getters `862-870`、`871-907`、action `937-943`;删函数 `267-299`)

**Interfaces:**
- Produces:`selectedActivityPayablePriceCent`、`selectedSeatPreviewPayablePriceCent`、`getActivityPayablePriceCent` 三者返回单字段应付(分)。

- [ ] **Step 1: 改 `selectedActivityPayablePriceCent`(862-870)** 替换为:

```ts
    selectedActivityPayablePriceCent(state): number {
      const seatTotal = this.selectedSeatTotalPriceCent
      if (seatTotal <= 0) return 0
      const selectedActivity = state.paymentActivity
        ? state.paymentActivities.find((activity) => activity.code === state.paymentActivity || activity.name === state.paymentActivity)
        : undefined
      return selectedActivity ? yuanToCents(selectedActivity.price) : seatTotal
    },
```

- [ ] **Step 2: 改 `selectedSeatPreviewPayablePriceCent`(871-907)** 替换为(去掉卡分摊扣减,实付=应付总盘子):

```ts
    selectedSeatPreviewPayablePriceCent(state): number {
      const seatTotal = this.selectedSeatTotalPriceCent

      if (seatTotal <= 0) {
        return 0
      }

      if (state.selectedCoupons.length > 0) {
        // 优先使用券分摊接口返回的真实应付价；接口未就绪/失败时回退到本地按面额估算
        if (state.couponPreviewPayableCent >= 0) {
          return Math.min(seatTotal, Math.max(0, state.couponPreviewPayableCent))
        }

        return Math.max(0, seatTotal - this.selectedSeatSelectedCouponAmountCent)
      }

      const selectedActivity = state.paymentActivity
        ? state.paymentActivities.find((activity) => activity.code === state.paymentActivity || activity.name === state.paymentActivity)
        : undefined

      return selectedActivity ? yuanToCents(selectedActivity.price) : seatTotal
    },
```

- [ ] **Step 3: 改 `getActivityPayablePriceCent`(937-943)** 替换为:

```ts
    getActivityPayablePriceCent(activity: PaymentActivity | undefined): number {
      const seatTotal = this.selectedSeatTotalPriceCent
      if (seatTotal <= 0) return 0
      if (!activity) return seatTotal
      return yuanToCents(activity.price)
    },
```

- [ ] **Step 4: 删除 `resolveActivityPaymentAmounts` 函数(267-299 整段)** — 该函数现已无引用。删除从 `function resolveActivityPaymentAmounts(` 到其闭合 `}` 的整段。

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: PASS(无未用变量/未定义引用)

- [ ] **Step 6: 提交**

```bash
git add src/renderer/stores/ticket.ts
git commit -m "refactor: 价格显示 getters 对齐旧版单字段应付，移除 price+channel 相加"
```

---

### Task 3: 删除本地 `×0.87` 折扣(state/getters/action/UI/契约)

**Files:**
- Modify: `src/renderer/stores/ticket.ts`(删 `selectedSeatDiscountRate:808`、getters `911-921`、action `953-955`)
- Modify: `src/renderer/components/SelectedSeatList.vue`(删折扣输入行与 props)
- Modify: `src/renderer/views/TicketView.vue`(删绑定与 handler `451-453`、`888`、`891`)
- Modify: `tools/check-ticket-coupon-preview-price-contract.mjs`(删 0.87 断言)

**Interfaces:**
- Produces:`SelectedSeatList` 仅接收 `selectedSeats/totalPriceCent/payablePriceCent/discountPriceCent`(去掉 `discountRate/discountedPayablePriceCent`)。

- [ ] **Step 1: 契约先改(去掉 0.87 断言)** — 删除 `tools/check-ticket-coupon-preview-price-contract.mjs` 第 36-40 行整段:

```js
// 折后价基数保持“实付 × 折扣率”不变
assert.ok(
  store.includes('this.selectedSeatPreviewPayablePriceCent * this.selectedSeatDiscountRateNumber'),
  'ticket.ts 折后价应基于实付价乘折扣率'
)
```

替换为:

```js
// 对齐旧版：不再有本地 ×0.87 折后价
assert.ok(
  !store.includes('selectedSeatDiscountRateNumber'),
  'ticket.ts 不应再有本地折扣率折后价（对齐旧版）'
)
```

- [ ] **Step 2: 删 store 折扣物** — `src/renderer/stores/ticket.ts`:
  - 删 state 行 `selectedSeatDiscountRate: '0.87',`(808)
  - 删 getter `selectedSeatDiscountRateNumber`(911-917 整段)
  - 删 getter `selectedSeatDiscountedPayablePriceCent`(919-921 整段)
  - 删 action `setSelectedSeatDiscountRate`(953-955 整段)

- [ ] **Step 3: 改 `SelectedSeatList.vue`** — 替换 `<script setup>` 的 `defineProps`/`defineEmits`:

```ts
const props = defineProps<{
  selectedSeats: SeatNode[]
  totalPriceCent: number
  payablePriceCent: number
  discountPriceCent: number
}>()

const emit = defineEmits<{
  removeSeat: [seat: SeatNode]
}>()
```

删除模板中 `<div class="seat-summary-calc">…</div>`(52-62 整块)及样式 `.seat-summary-calc/.seat-summary-times/.seat-summary-input/.seat-summary-equals`(157-186)。`showDiscount`(24)保留。

- [ ] **Step 4: 改 `TicketView.vue`**:
  - 删 `handleSelectedSeatDiscountRateChange` 函数(451-453 整段)
  - 删 `SelectedSeatList` 上的 `:discount-rate="ticketStore.selectedSeatDiscountRate"`(888)与 `@update:discount-rate="handleSelectedSeatDiscountRateChange"`(891)、`:discounted-payable-price-cent="ticketStore.selectedSeatDiscountedPayablePriceCent"`(889)

- [ ] **Step 5: 类型 + 相关契约**

Run: `npm run typecheck && npm run check:ticket-coupon-preview-price && npm run check:ticket-order-summary-legacy-align`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/renderer/stores/ticket.ts src/renderer/components/SelectedSeatList.vue src/renderer/views/TicketView.vue tools/check-ticket-coupon-preview-price-contract.mjs
git commit -m "refactor: 移除本地 ×0.87 折后价，对齐旧版合计/实付两值展示"
```

---

### Task 4: 删除临时诊断日志

**Files:**
- Modify: `src/renderer/services/seatApi.ts`(删 `normalizePaymentActivity` 内 `[活动价字段核对]` 块)

- [ ] **Step 1: 删除诊断块** — 删去 `normalizePaymentActivity` 中从注释 `// [临时诊断-价格字段核对] ...` 到其 `}` 结束的整段(约 294-311),恢复为 `allotSeat` 解析后直接 `return {`。

- [ ] **Step 2: 类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/renderer/services/seatApi.ts
git commit -m "chore: 移除价格字段核对临时诊断日志"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 类型 + 全契约**

Run: `npm run typecheck && npm run check:all`
Expected: PASS(若个别与本次无关的契约本就失败,记录但不误判为本次引入)

- [ ] **Step 2: 记录待用户真机验证的 E2E 场景**(无法在此自动化,留给用户)

- 场景 A:选座 → 默认活动 → **不选卡** → 提交 → 支付宝按活动价拉起;`已选座位` 实付 = 活动价、无 `×0.87`。
- 场景 B:选座 → 活动 + 选卡(余额<应付)→ 卡分摊后余额走支付宝。
- 场景 C:选座 → 用兑换券 → 券后价走支付宝,couponPaymentList 正确。

## 自检记录

- Spec 覆盖:强制卡 throw(T1)、单字段应付(T1/T2)、券后价 res.price(T1)、0.87 删除(T3)、诊断日志(T4)、契约更新(T1/T3)、单位处理(Global Constraints)。均有任务对应。
- 无占位:各步给出完整替换代码与命令。
- 类型一致:`totalPayPriceCent/remainingCardPrice/externalPaymentPrice/discountPrice` 命名贯穿 T1;getters 返回分。
