# 提交支付真实链路设计

## 背景

旧包 `seatApi-DRvI3y7l.js` 中已经存在影票合并支付函数 `submitPayment`，导出名为 `H`。当前重构版第四阶段只保留了支付前置检查，并在万达请求白名单里阻断了 `/order/prepay.api`、`/order/merge_payment.api` 与支付宝相关请求。

本阶段目标是先恢复用户手动点击后的影票真实提交支付链路，不做自动支付、不自动填写支付宝密码。

## 旧包证据

影票提交支付使用 `/order/merge_payment.api`，POST body 为：

- `cartSnackInfo=%5B%5D`
- `cinemaId=<订单影院 ID>`
- `mobilePhone=<订单手机号>`
- `orderId=<订单号>`
- `requestInfo=<encodeURIComponent(JSON.stringify(requestInfo))>`

签名 body 与提交 body 不完全相同：

- `requestInfo` 原始 JSON 需要先替换 `\\\\u003d` 为 `\u003d`
- 签名使用 `requestInfo=<escape(requestInfoJson)>`
- 提交使用 `requestInfo=<encodeURIComponent(requestInfoJson)>`

旧包没有在影票提交支付前调用 `/order/prepay.api`；该接口在旧包中用于储值卡订单预支付。

## 本阶段实现范围

- 保留真实订单、真实座位、真实支付前置数据。
- 新增 `submitTicketPayment`，按旧包 `submitPayment` 逻辑调用 `/order/merge_payment.api`。
- 页面“提交支付”按钮必须通过确认弹窗触发，避免误点。
- 提交成功后保留订单上下文，并尝试刷新订单状态与取票码。
- 不启用自动支付宝窗口、不保存支付宝账号密码、不自动付款。

## 不做事项

- 不自动打开或自动操作支付宝。
- 不模拟接口数据。
- 不改动登录鉴权策略。

## 本轮补充

- `merge_payment` 外层先检查 `code`，内层 `data` 按旧包 `AES-ECB + Pkcs7`、密钥 `6f34faeefba8fd39` 解密后再检查 `bizCode`。
- 提交支付不再依赖下单返回的 `requestInfo`，而是在点击提交时根据订单、活动、支付卡、兑换券实时构造。
- 兑换券模式先调用 `/mkt/activity/secret/selectcoupon.api`，再调用 `/mkt/activity/secret/conponuse.api` 获取真实券分摊价格和 `couponPaymentList`。
- 若 `externalPayment.paymentPrice > 0`，必须从合并支付返回中拿到 `tradeNo` 后调用 `/order/query_pay_info_upgrade.api` 获取外部支付参数。
- 本阶段仍不自动拉起支付宝，仅保留真实支付参数，后续再接自动支付。

## 支付参数展示补充

- 提交支付拿到 `/order/query_pay_info_upgrade.api` 返回后，购票页必须提供“支付参数”查看入口。
- 展示内容直接来自 `currentOrderPayInfo.payInfo`，若接口结构变化则回退读取原始返回里的 `data.payInfo` 或订单票务节点里的 `payInfo`。
- 该入口只读展示真实返回参数，不触发支付宝转换、不自动打开支付窗口、不保存支付宝账号密码。

## 接口诊断补充

- 所有万达 HTTP 传输失败都必须从统一请求层补充请求方法和接口路径，例如 `POST gateway.app.wandacinemas.com/order/merge_payment.api`。
- 错误提示保留底层返回的脱敏后原始错误，方便判断是网络、白名单、签名还是万达服务端拒绝。
- 接口路径只展示 `host/path`，不得展示 query 参数。
- 诊断信息不得拼接请求体、CK、手机号或支付参数，避免把敏感数据写进页面和日志。
