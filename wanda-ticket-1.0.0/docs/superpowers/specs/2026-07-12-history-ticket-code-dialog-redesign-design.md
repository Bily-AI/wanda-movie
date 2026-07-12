# 历史订单取票码弹窗重设计(对齐万达官方样式) · 设计文档

- 日期:2026-07-12
- 范围:`wanda-ticket-1.0.0` 历史订单页取票码详情弹窗(`OrderHistoryView.vue`)
- 目标:保留「默认/万达风格」切换;**万达风格**照万达官方 App 取票界面重做,**默认**清理成简洁卡片风。

## 1. 背景

历史订单双击弹出取票详情弹窗(`OrderHistoryView.vue:750-895`),有两套模板(`ticketTemplate` = `DEFAULT_TEMPLATE` / `WANDA_TEMPLATE`,由 `settingsStore.ticketCodeTemplate` 决定)。用户反馈当前「默认」模板(蓝色"取票二维码"横条 + 深色 W+ 开通广告横幅)偏丑,并给出万达官方取票界面作参照。

## 2. 需求(用户已确认)

- **保留**两套模板切换。
- **万达风格**:照官方版式重做(浅灰底 + 白色圆角卡片)。
- **默认**:清理简洁(去深色 W+ 广告横幅、弱化蓝横条、卡片化、统一间距)。
- 两套底部均保留「截图保存 / 复制截图」。

## 3. 官方版式(万达风格目标结构)

浅灰页底,白色圆角卡片,自上而下:
1. **影院卡**:影院名(粗)+ 地址(灰,小)。
2. **影片卡**:影片名(粗,大)+ `语言 版本 N张`(灰)+ `日期(周X) 影厅` + `起~止时间   座位` + 右侧**海报**(圆角);底部**虚线**分隔。
3. **取票凭证**:`取票凭证` 小标题 + 居中**大二维码** + 下方 `取票码：2068 1100 1117 70`(分组、灰、浅底圆角条)。
4. **影票订单卡**:`影票订单`(粗)+ 右上 `已使用`(灰);行:`订单编号 xxx | 复制`(复制橙色)、`下单时间`、`手机号码`;分隔线;`实付金额 ¥xx`(右对齐、粗)。
5. **底部动作**:`截图保存 / 复制截图`。

## 4. 默认模板清理

- 删 `.ticket-ad-banner`(深色 W+ 开通广告横幅,`OrderHistoryView.vue:789-795`)。
- 弱化 `.ticket-tip-bar`(蓝色"取票二维码"横条)为轻量标题或去除。
- 其余(取票码/手机号/二维码/订单号/影片信息/取票机提示)卡片化、统一 8/12px 间距与浅色边框。
- 保留底部动作。

## 5. 数据

`ticketDetail` 现有:`movieName/movieLanguage/movieVersion/showTimeStr/showEndTimeStr/cinemaName/cinemaAddress/hallName/seats/moviePoster/electronicCodes/electronicQRs/orderId/showOrderStatus/ticketTip`,手机号有 `ticketMaskedMobile`/`ticketMobileLast4`。
需补入(官方"影票订单卡"用):
- **实付金额**:从订单行 `amount` 取(`formatMoney`)。
- **下单时间**:从订单行 `createdAt` 取(`formatDateTime`)。
- 实现:构造 `ticketDetail` 时把当前订单的 `amount`/`createdAt` 一并带上(新增 `amountLabel`/`createdAtLabel` 或复用现有格式化)。

## 6. 取票码分组显示

官方 `取票码：2068 1100 1117 70` —— 取票码去空格后每 4 位分组:`code.replace(/\s/g,'').replace(/(.{4})/g,'$1 ').trim()`。用于万达风格的取票码展示。

## 7. 交互/结构

- 保持现有拖拽(`handleDragStart`)、`Transition`、header(← / 取票码 / 截图 / ✕)。
- 仅重写 `wanda-official-content` 块(万达风格)结构与 CSS;`DEFAULT_TEMPLATE` 块做清理级调整。
- `settingsStore.ticketCodeTemplate` 切换逻辑不变。

## 8. 测试与验证

- `npm run typecheck` + `npm run check:all` 通过。
- 契约 `check:history-ticket-code` / `check:history-order-layout` 若锁定旧结构(class/文案),同步更新到新结构。
- 手动 E2E(留用户):默认/万达风格各双击订单,核对版式接近官方图、截图/复制可用、有码/无码(ticketTip)两态正常。

## 9. 范围外

- 官方顶部"电影已放映/去评价"、底部"发票说明/开具发票"不做(用不上)。
- 购票页(`TicketView.vue`)自己的取票码弹窗本次不动(结构不同,另议)。

## 10. 风险

- 海报字段 `moviePoster` 可能为空 → 用占位/隐藏,避免破图。
- 实付/下单时间需确认 `ticketDetail` 构造处能取到订单行数据。
