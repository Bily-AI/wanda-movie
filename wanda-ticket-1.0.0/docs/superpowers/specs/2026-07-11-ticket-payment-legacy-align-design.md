# 购票支付组装对齐旧版 · 设计文档

- 日期:2026-07-11
- 范围:重构版 `wanda-ticket-1.0.0` 购票首页的**提交支付组装**与相关价格显示
- 原则:**一切以旧版(win-ia32-unpacked 打包产物)为准**。旧版是唯一权威,不自行发明口径。

## 1. 背景与问题

用户报告两个现象:

1. **会员/实付价格不对**:购票页 `已选座位` 面板显示 `合计 ¥33.00 / 实付 ¥36.00 / ×0.87 = ¥31.32`,实付竟高于合计,逻辑不通。
2. **不用支付卡时,支付宝支付弹不出来**。

根因定位(代码级):

- 支付宝只在 `externalPaymentPrice > 0 && tradeNo` 时才拉起(`src/renderer/stores/ticket.ts:1650`)。
- 但 `buildTicketPaymentRequestInfo` 在"选了活动却没选卡"时直接 `throw '当前支付活动需要先选择支付卡'`(`ticket.ts:1453`);而 `PaymentPanel` 默认自动选中最便宜活动(`src/renderer/components/PaymentPanel.vue:71`)。→ 用户不选卡就提交,提交前即抛错,**根本走不到支付宝**。
- 外部支付金额算法 `externalPriceCent + cardPriceCent`(= 活动 `price` + `channelPrice`,`ticket.ts:1493`)把两个价相加,导致实付 ¥36 虚高(33+3)。这与"实付>合计"同源。
- `×0.87` 折后价是新版自加的本地写死(`ticket.ts:808/919`),旧版没有。

提交端点本身已对齐:新版 `submitTicketPayment` 打的就是 `/order/merge_payment.api`(`src/renderer/services/seatApi.ts:1115`),与旧版一致。**问题全在客户端 `requestInfo` 组装。**

## 2. 旧版权威公式(重写靶子)

来源:旧版 `resources/app/out/renderer/assets/TicketView-3q5SUv8Y.js`(线上入口链 `index.html → index-BJJNIRyY.js → TicketView-3q5SUv8Y.js`)提交 handler,经字符串解码器 `_0xd759`/`_0x5a7c` 反混淆确认。

```
座位总价(分)  seatTotalPrice = round(Σ seat.price元 × 100)

是否券模式    isVoucherMode = (选中券.length > 0) && (conponUse != null) && (voucherRes != null)
              // conponUse = 券 allotseat(含 itemList[{payPrice, seat}])
              // voucherRes = conponuse.api 结果(含 res.price = 券后应付)

应付总盘子    totalPayPrice = isVoucherMode ? voucherRes.res.price   // 券后价(分)
                            : activity      ? activity.price          // 活动价(分)  ← 只用这一个字段
                            :                 0

逐卡分摊      cardsToAllot = isVoucherMode ? [] : 选中卡.slice(0, 5)
              remaining = totalPayPrice
              for card of cardsToAllot:
                  if remaining <= 0: break
                  pay = min(card.balance, remaining)
                  if pay > 0: allot.push({card, paymentPrice: pay}); remaining -= pay
              externalRemainder = max(0, remaining)

externalPayment.paymentPrice = externalRemainder            // 卡付剩下的 → 支付宝
externalPayment.paySdkId     = 1057
externalPayment.paymentType  = 1057
externalPayment.returnUrl    = 'wandafilm/pay/finished'

activity{}    仅当 [ 非券模式 && 有活动 && 活动有 allotSeat && 至少选 1 张卡(cards[0]) ] 才挂:
              {
                allotJson:      activity.allotSeatRaw,
                card:           { cardNumber: cards[0].cardNo, quantity: 0 },
                discountPrice:  seatTotalPrice − activity.price,
                integral:       0,
                ticketType:     activity.code,
                ticketTypeName: cards[0].cardTypeName,
                type:           activity.detailtype
              }

ticketVoucher{}   仅券模式挂:{ discountPrice: seatTotalPrice − voucherRes.res.price, voucher: wrap(voucherJson) }
couponPaymentList 仅券模式挂:conponUse.itemList.map(it => ({
                    actuallyPaidAmount: it.payPrice, rightsCode:'', seatId: Number(it.seat),
                    ticketCode:'', ticketType:0, usedCoupon:1 }))
cardPayment       仅当有分摊卡:第一张分摊卡 { cardNumber, paymentPrice, paymentType:1, ticketType:cardTypeCode, ticketTypeName }
storedCardPayments 全部分摊卡(同上结构)

无卡强制:❌ 旧版没有任何"选了活动必须选卡"的 throw / 提前 return / warning(已用脚本核实)。
         无卡 + 有活动 → externalRemainder = activity.price 全额走支付宝;但 activity{} 因缺 cards[0] 不挂载。
         无卡 + 无活动 + 非券 → totalPayPrice = 0 → externalPayment.paymentPrice = 0。
```

> 关键洞察:旧版应付 = `activity.price` **单字段**(截图里就是 ¥33)。卡付掉一部分,**剩下的才给支付宝**。新版多加 `channelPrice` 才变 ¥36。对齐旧版后,实付回到 ¥33、无卡时 ¥33 全额拉起支付宝,**两个 bug 一起消失**。

## 3. 新版 vs 旧版 差异表

| 点 | 旧版(权威) | 新版现状(file:line) | 处理 |
|---|---|---|---|
| 应付总额 | `activity.price` 单字段 | `externalPriceCent + channelPrice`(`ticket.ts:1493`) | 改为单字段 |
| 无卡+活动 | 允许,全额走支付宝 | `throw 需要先选卡`(`ticket.ts:1453`) | 删除 throw |
| 折扣率 0.87 | 无 | 本地写死 `×0.87`(`ticket.ts:808/919`、`SelectedSeatList.vue`) | 删除 |
| discountPrice | `seatTotal − totalPayPrice` | `seatTotal − (external+card)`(`ticket.ts:1498`) | 改为 `seatTotal − totalPayPrice` |
| 券后价字段 | `voucherRes.res.price` | `Σ itemList.actuallyPaidAmount` | 对齐到 `res.price` |
| activity{} 挂载条件 | 需 `cards[0]` | 已是 `!isCoupon && activity && primaryCard`(`ticket.ts:1521`) | 保持(已一致) |
| 提交端点 | `/order/merge_payment.api` | `ORDER_MERGE_PAYMENT`(`seatApi.ts:1115`) | 保持(已一致) |

## 4. 具体改动清单(逐文件)

### 4.1 `src/renderer/stores/ticket.ts` — `buildTicketPaymentRequestInfo`(1437–1550)
- 删 `1453` 行 `if (selectedActivity && selectedCards.length === 0) throw`。
- 删除对 `resolveActivityPaymentAmounts` 的 `externalPriceCent + cardPriceCent` 依赖(`1463-1464`、`1490-1499`)。
- 重写为第 2 节公式:
  - `totalPayPrice = 券模式 ? 券后价(res.price) : 有活动 ? 活动价 : 0`
  - 逐卡分摊 `remaining = totalPayPrice − Σ min(卡余额, 剩余)`
  - `externalPayment.paymentPrice = max(0, remaining)`
  - `discountPrice = seatTotalPrice − totalPayPrice`
- `activity{}`、`cardPayment`、`storedCardPayments`、`ticketVoucher`、`couponPaymentList` 的挂载条件与字段对齐第 2 节。

### 4.2 `src/renderer/stores/ticket.ts` — 价格显示 getters(851–921)
- `实付`(`selectedSeatPreviewPayablePriceCent`)= `totalPayPrice` 口径(活动价/券后价;无活动无券时 = 座位原价)。不再是 `price + channelPrice`。
- `合计`(`selectedSeatTotalPriceCent`)= 座位原价,不变。
- 删 `selectedSeatDiscountRate`(808)、`selectedSeatDiscountRateNumber`、`selectedSeatDiscountedPayablePriceCent`(919-921)。
- 说明(非矛盾):**显示口径**与**提交口径**在"无活动"时不同 —— 显示 `实付` 兜底为座位原价便于阅读,而提交 `externalPayment.paymentPrice` 严格按旧版 = 0。因 `PaymentPanel` 默认自动选中活动,`totalPayPrice = activity.price`,实际购票流程中二者一致;仅"手动切到无活动"这一边界会出现显示≠提交,这与旧版一致(旧版无活动也不产生外部支付额)。

### 4.3 `src/renderer/components/SelectedSeatList.vue`
- 移除 `×0.87` 输入框、`discountRate`/`discountedPayablePriceCent` 相关 props、模板与样式。
- 保留 `合计 + 实付` 两值展示(有优惠时合计划线),对齐旧版 `2026-07-08-ticket-legacy-layout-reference.md` 第 37-38 行。

### 4.4 `src/renderer/views/TicketView.vue`
- 移除向 `SelectedSeatList` 传递的 `discount-rate` / `discounted-payable-price-cent` / `@update:discount-rate`(885-891 一带)及对应 handler。

### 4.5 `src/renderer/services/seatApi.ts`
- 删除临时诊断块 `[活动价字段核对]`(`normalizePaymentActivity` 内,约 294-311)。

### 4.6 `tools/check-payment-submit-contract.mjs`
- 更新契约断言到旧版公式(externalPayment.paymentPrice = 分摊后余额;无 throw;无 0.87),作为回归护栏。

### 4.7 不改动
- `PaymentPanel` 默认自动选最便宜活动:拦截删除后无害(活动+无卡=按活动价走支付宝),**保留**。
- 提交端点、`cartSnackInfo=[]` 默认(`seatApi.ts:1100`)、`paySdkId/paymentType/returnUrl`。

## 5. 实现期需核实的点(不改变方案,写计划/实现时验证)

1. **单位**:旧版 `activity.price` 是"分";新版 `normalizePaymentActivity` 已 `centsToYuan` 转成"元"(`seatApi.ts:297`)。重写时确认在哪一层做 元↔分 转换,避免 ×100 错。基准:座位价在旧版是"元×100";活动/券价在旧版已是"分"。
2. **券后价字段**:确认新版 `buildTicketCouponPaymentInfo` 能取到等价于旧版 `voucherRes.res.price` 的值(`selectcoupon`/`conponuse` 接口的 `res.price`),并用它作为券模式 `totalPayPrice`。
3. **voucher 包装**:旧版 `ticketVoucher.voucher` 由 `_0x526090(voucherJson)` 包装,内部转换未展开;实现时对照新版现有 voucher 组装,必要时再追旧版该函数。

## 6. 测试与验证

- **契约**:`npm run check:payment-submit` 更新后须通过。
- **类型**:`npm run typecheck` 通过。
- **端到端(用户实机)**:
  - 场景 A:选座 → 保留默认活动 → **不选卡** → 提交 → 支付宝按活动价拉起,实付显示 = 活动价。
  - 场景 B:选座 → 活动 + 选卡(余额 < 应付)→ 卡分摊后余额走支付宝。
  - 场景 C:选座 → 用兑换券 → 券后价走支付宝,couponPaymentList 正确。
  - 三场景均核对 `合计/实付` 显示与旧版一致、无 `×0.87`。

## 7. 范围外(本次不做)

- "全局订单信息"随查询清空 / 取消订单入口优化(另议,属护栏 UX)。
- 支付卡面板的移除(用户已定:卡保留、仅可选)。
- 首页非支付类模块(账号池、OCR、取票码弹窗等)本次不动。

## 8. 风险

- 旧版某些分支(券包装、单位)仍有 2-3 处需实现期二次确认(见第 5 节);若与旧版行为不符,以旧版实际提交体为准回改。
- 改动集中在支付组装,须逐场景实机验证后再合并(记忆:支付别乱动)。
