# 储值卡真实操作链路设计

当前储值卡页已经能读取当前账号的储值卡，但“卡片”“购买储值卡”“获取全部账号支付卡”“详情”“充值”“赠送”等入口仍有占位逻辑。本阶段以旧 Electron 打包产物为准，恢复旧包里能确认的真实万达储值卡接口，不使用 mock 数据。

## 旧包接口

- 储值卡列表：`/card/user_card/list.api?category=1&json=true`，读取 `data.res.items` 与 `data.res.balanceInfo`。
- 订单支付卡：`/card/pay/list.api?orderId=...`，用于后续订单支付卡读取。
- 赠送储值卡：`/card/transfer.version?verify_code=&verify_context_id=&card_no=...&gift_mark=&target_user_mobile=...&order_id=`。
- 购买储值卡建单：`/order/create.api?cinemaId=5911&coverCode=13002428&salePrice=...&postponeCode=&activityCode=CS202401080004&isGift=2&source=1&json=true`。
- 购买储值卡预支付：`/order/prepay.api?orderId=...&payType=1057&returnUrl=wandafilm%2Fpay%2Ffinished`。
- 储值卡充值：`/card/recharge.version?amount=...&card_no=...&return_url=wandafilm%2Fpay%2Ffinished&pay_type=1057&activityCode=CS202401080004`。

## 页面行为

- 列表读取当前账号储值卡，并展示卡名、卡号、余额、赠送余额、状态、有效期和持有人。
- “卡片”按钮切换列表/卡片展示模式，保留在本地状态，不发接口。
- “获取全部账号支付卡”遍历所有有 `ck` 的账号，逐个调用旧包储值卡列表接口并合并展示。
- “详情”只展示列表接口已返回的原始字段，不再额外请求。
- “充值”弹窗选择旧包面值后调用充值接口，拿到 `appPayParam` 后展示支付参数，不自动拉起支付宝。
- “购买储值卡”弹窗选择旧包面值后先建单，再预支付，拿到 `appPayParam` 后展示支付参数，不自动拉起支付宝。
- “赠送”弹窗校验 11 位手机号，确认后调用旧包转赠接口。

## 风险控制

- 所有真实写动作都只在用户点击确认后调用。
- 充值和购买会真实创建支付相关结果，但不自动打开支付宝。
- 接口错误统一通过万达返回的 `bizMsg/msg` 显示，并写入日志。
- 账号切换、批量加载和弹窗关闭都不得把旧账号请求结果回写到当前页面。
