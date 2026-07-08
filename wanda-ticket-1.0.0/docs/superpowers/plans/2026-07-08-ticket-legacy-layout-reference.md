# 旧版购票页（TicketView）完整结构参照 — 用于"首页完全对齐旧版"

> 来源：对 `win-ia32-unpacked` 旧打包 bundle 逆向（解字符串表混淆后）。
> 实际使用 chunk：`out/renderer/assets/TicketView-3q5SUv8Y.js`（`TicketView-Dx9dxHdC.js` 为旧构建，已弃用）。
> 本文档仅为参照 checklist，未改动任何工程代码。日期：2026-07-08。

## 1. 整体布局（两栏 + 独立底部栏）

```
div.page-container
├─ div.content-wrapper
│  ├─ div.left-panel
│  │  ├─ <TicketSearchPanel>   // 查询区（含影院列表）
│  │  └─ <SeatInfoPanel>       // 座位图 + 图例
│  └─ div.right-panel
│     ├─ <SelectedSeatList>    // 已选座位 + 合计/实付
│     ├─ el-card.order-status-card   // 订单信息卡（v-if 已下单+锁座才显示）
│     ├─ <PaymentPanel>        // 支付活动
│     ├─ <PayCardList>         // 支付卡
│     └─ <CouponList>          // 兑换券
├─ div.footer-bar             // 底部操作栏（跨两栏，页面底部，不在右栏内）
│  ├─ .footer-bar__left   刷新购票码 / 图片识别 / 文本识别
│  └─ .footer-bar__right  取消选择 / 确认选座 / 提交支付
├─ div.points-lock-overlay (v-if 积分不足)  「积分不足，请充值后再操作」
└─ Teleport(body) → 出票成功弹窗（可拖动）
```

## 2. 查询区 TicketSearchPanel
el-card 标题「购票查询」。从上到下：搜索框（首字母/汉字搜影院）→ 城市(remote) → 影院(filterable，跨城市搜索，选项 `.opt-cinema-main/sub/city-tag`，`is-cross-city`) → 影片(disabled 直到选影院) → 日期(disabled 直到选影片) → 场次+「刷新座位」按钮同行 → 影院列表 `.cinema-item`（name+city，点击选中）。
**自动链**：选影院→拉档期+自动展开影片下拉；选影片→自动展开日期；选日期→取场次+**默认选第一场次**+自动展开+请求座位；选场次→请求座位。下拉用 `.el-select__wrapper.click()` 自动展开。座位成功 toast「座位数据获取成功，共 X 座，可选 X 座，已售 X 座」。城市来自 `window.api.readCityData()`。

## 3. 座位区 SeatInfoPanel
el-card 标题「选座信息」，右侧「已选 N 座」。顶部 `.screen-bar`「银 幕」。`.seat-map`（Ctrl/Meta+滚轮缩放 0.4~2.5，首次 fitToContainer）。行号 `.row-label`「{label}排」，座位 `.seat-cell`（occupied/selected），title「{row}排{col}座 - {区名}」。
图例固定 6 区：**普通区/优选区/VIP区/W+会员区/情侣区/特惠区**。配色 normal`#f0a030` preferred`#7ec8e3` vip`#3a5a9f` wplus`#1a3a7a` couple`#e85d75` discount`#4caf50`。areaCode→zone：`36→wplus,33→discount,32→preferred,1→normal,其它→normal`。价格 `salesPrice/100`。

## 4. 已选座位 + 合计/实付 SelectedSeatList
el-card「已选座位」，右侧「N / 8」（**上限 8 座**）。座位 `el-tag closable`「{row}排{col}座」。汇总行：`合计` + `.total-original`「¥原价合计」(有优惠时划线) + `.total-price`「[实付] ¥显示价」。
**⚠️ 无折扣率输入框（无 ×0.87）**：合计=座位原价合计，实付=后端 payablePrice。空态「暂未选择座位」。

## 5. 右侧三面板（均 shadow=never 常驻展开，无折叠）
- **支付活动 PaymentPanel**：header「支付活动」+ `el-switch active-text=优惠`。body「活动价」+ `el-select`（选项名+`el-tag danger ¥price`，末尾「无活动」value=none）+ 右侧最便宜价。**默认自动选最便宜活动**；选活动会清空已选卡/券。
- **支付卡 PayCardList**：header「支付卡」+「已选 X / Y 张」。**默认 table 模式**（`localStorage.setting_paycard_display_mode==='card'` 才卡片模式）。表格列＝卡名称/卡号/余额(¥右对齐)。卡片模式渐变 4 档：不可用 gray、≥500元 gold、≥200元 purple、否则 blue。**普通点击=单选替换，Ctrl/Meta+点击=多选切换**。watch 活动推荐卡自动选中。
- **兑换券 CouponList**：header「兑换券」+「已选 X 张 | 可兑 {数} / 需 {seatCount} 张」(text-success/danger)。`el-table highlight-current-row`，列＝券名称(同名合并计数 `x{count}`)/类型(`el-tag warning`)/有效期。**普通点击=按座位数覆盖填充，Ctrl/Meta+点击=累加**，总可兑不超过座位数。

## 6. 订单信息卡（右栏，v-if orderId && lockSeatTime>0）
header「订单信息」，三行：手机号 / 订单号 / 剩余支付时间（mm:ss 倒计时，≤60s 加 `--urgent`）。倒计时到 0：toast「支付时间已到，订单已自动失效」→ 重置 → 刷新座位。

## 7. 底部操作栏 footer-bar（所有按钮以 pointsInsufficient 禁用）
左：**刷新购票码**（手动查取票码，无确认）/ **图片识别**（读剪贴板图，非时长用户扣 8 积分，本地解析+AI 兜底回填）/ **文本识别**（读剪贴板文本，同解析）。
右：**取消选择**(warning，若有 orderId 先调后端 cancelOrder 再清空，写「取消订单 ID:」日志，无弹窗) / **确认选座**(success，submitOrder，成功设 orderId+启动状态轮询) / **提交支付**(primary large，见 §9)。
**⚠️ 无独立「取消订单」按钮**；取消订单能力挂在「取消选择」里。均无二次确认弹窗。

## 8. 出票成功弹窗（Teleport body，可拖动）
触发：取票码轮询命中 `payStatus===3 && electronicQR` 时自动弹出。含 取票码/脱敏手机号/二维码/广告 banner「W+会员开通赠3张IMAX券」/订单详情(片名+版本 tag+时间/影院/影厅/座位)/「申请退单」/「定制专属亮话」/「截图」。

## 9. 提交支付流程（勿改逻辑，仅记录）
1. 校验 orderId。2. 非时长用户扣 0.1 积分。3. 构造 requestInfo：兑换券模式(`ticketVoucher`+`couponPaymentList`) 或 卡/活动模式(`activity`+`cardPayment`+`storedCardPayments` 最多 5 卡分摊)；公共 `externalPayment{paySdkId:1057,paymentType:1057,returnUrl:'wandafilm/pay/finished'}`。4. `mergePayment` → AES-ECB(Pkcs7) hex 密文(key `6f34faeefba8fd39`)解密取 tradeNo。5. 分支：`externalPaymentPrice>0` → queryPaymentInfo 取 appPayParam → IPC `alipay-convert` → 系统浏览器开支付宝 → 取票码轮询；`===0`(全额抵扣) → 跳过支付宝直接轮询。6. 取票码轮询每 2s、最多 120 次。
接口：getSeatData/submitOrder/selectCoupon/conponuse/mergePayment/queryPaymentInfo/queryOrderStatus/queryTicketCode/getPayActivities/getCoupons/getPayCards/cancelOrder；档期 `fetchCinemaShowtime`；userIdentifier 缺省 `YYDDJDKYHA`。

## 10. 新版易漏点 checklist
1. 两栏 + 独立底部栏（footer 跨栏，不在右栏内）。
2. 座位上限 8，显示「X / 8」。
3. **无折扣率输入框**（合计=原价，实付=后端价）。※ 当前新版保留了 ×0.87 折扣率，属用户主动保留的偏离。
4. 订单信息卡是条件渲染 + 倒计时（≤60s 变色）。
5. 支付卡默认 table 模式；卡片渐变 4 档。
6. 多选靠 Ctrl/Meta+点击；普通点击覆盖式。
7. 兑换券受座位数上限约束，header「可兑 X / 需 Y」变色。
8. 选完自动展开下一级下拉 + 日期后自动选首场次并请求座位（体验核心）。
9. 图片/文本识别都读剪贴板；图片扣 8 积分、提交支付扣 0.1；积分不足禁用整栏 + 遮罩。
10. 「取消选择」有 orderId 时真正调后端取消订单；无独立取消订单按钮。
11. mergePayment 返回 AES-ECB(Pkcs7) hex 密文，key `6f34faeefba8fd39`。
12. 支付两条路：需第三方走 `alipay-convert` 开支付宝；全额抵扣跳过直接轮询。
13. 出票弹窗 Teleport body 可拖，手机号脱敏。
14. 影院搜索支持拼音首字母 + 跨城市。
15. 图例 6 区配色/区码映射(36/33/32/1)照搬，否则着色错。
