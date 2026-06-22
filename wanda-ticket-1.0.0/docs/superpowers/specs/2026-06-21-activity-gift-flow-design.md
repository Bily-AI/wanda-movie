# 活动礼包真实订单链路设计

## 目标

活动页继续使用旧 Electron 打包产物里的万达真实接口，不做 mock。当前阶段补齐“礼包列表/详情、创建订单、订单详情、交易创建、交易详情轮询、展示支付参数”的最小闭环。旧包拿到 `appPayParam` 后会调用 `alipay-convert`，本项目 1.0.0 暂时只展示支付参数，不自动拉起支付宝或自动支付。

## 旧包接口依据

- 礼包列表：`/pack_activity/activity/list.api?cinemaId=<cinemaId>&json=true`
- 礼包详情：`/pack_activity/activity/detail.api?cinemaId=<cinemaId>&activityCode=<activityCode>&json=true`
- 创建礼包订单：`/pack_activity/activity/create_order.api`
- 我的礼包订单：`/giftshop/orders?pageIndex=<pageIndex>&pageSize=<pageSize>&json=true`
- 礼包订单详情：`/giftshop/orders/detail?id=<orderId>&json=true`
- 创建礼包交易：`/giftshop/transactions/create`
- 礼包交易详情：`/giftshop/transactions/detail?payId=<payId>&id=<transactionId>&json=true`

旧包创建订单时提交 JSON body：`cinemaId`、`activityCode`、`goodsNum`、`orderAmount`、`json: true`。签名 body 使用 `encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g, value => value.toLowerCase())`，请求头 `Content-Type` 使用 `application/json`。

旧包活动价格优先使用 `unitPrice`，缺失时再兼容 `price`、`salePrice`、`amount`。创建订单时 `orderAmount` 使用“单价分 * 数量”，避免接口只返回 `unitPrice` 时误传 0 元订单。

旧包礼包支付参数链路：

1. 创建礼包订单后得到 `orderId`。
2. 请求 `/giftshop/orders/detail?id=<orderId>&json=true`，从 `data.order.payId` 取 `payId`。
3. POST `/giftshop/transactions/create`，body 固定为 `payId=<payId>&payMethodId=1057&json=true`，其中 `payMethodId=1057` 来自旧包 `0x421`。
4. 最多轮询 10 次 `/giftshop/transactions/detail?payId=<payId>&id=<transactionId>&json=true`，每次间隔 1500ms。
5. 从交易详情 `data.payParams.appPayParam` 取得支付参数并在页面弹窗展示。

## 实现范围

1. 扩展万达接口白名单，允许活动下单和礼包订单查询路径。
2. 扩展通用万达 POST 封装，支持按旧包要求覆盖 `Content-Type`。
3. 在 `featureApi` 中新增活动礼包下单、订单详情、创建交易、交易详情轮询和礼包订单列表封装，统一做成功态校验和返回数据归一化。
4. 在活动页购买按钮前加确认弹窗，确认后创建真实订单并继续拉取支付参数；结果只展示，不自动支付。
5. 在活动页展示我的礼包订单，保留手动刷新入口，并给订单补“支付参数”操作。

## 风险控制

- 购买按钮必须经过确认弹窗才会发起真实下单。
- 创建订单后允许进入 `/giftshop/transactions/create` 和 `/giftshop/transactions/detail` 获取 `appPayParam`，但禁止进入 `alipay-convert` 或任何支付宝跳转链路。
- 支付参数弹窗只在本地展示和复制，不写入日志，不打印 CK、手机号、支付参数等敏感信息。
- 接口错误继续通过页面提示和日志显示，业务错误和传输错误都复用脱敏逻辑。

## 验证

- `npm run check:activity-gift`
- `npm run check:wanda-diagnostics`
- `npm run typecheck`
- `npm run build`
