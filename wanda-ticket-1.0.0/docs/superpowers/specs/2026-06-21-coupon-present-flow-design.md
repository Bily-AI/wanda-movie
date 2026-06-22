# 兑换券真实赠送链路设计

## 背景

当前兑换券页已经能通过旧万达接口读取会员兑换券，但“批量赠送”和行内“赠送”仍是占位提示。旧 Electron 打包产物里保留了完整转赠链路，本阶段按旧包实现接回真实接口，不造本地 mock。

## 旧包接口顺序

1. 校验券是否可赠送：`/coupon/present/canCouponPresent.api?voucherNos=...`
2. 判断是否需要身份验证：`/coupon/present/idverify.api?voucherNos=...`
3. 需要验证时发送短信：`/coupon/present/sms/send_security_code.api?mobile=...&imageCode=&businessType=1&ip=...`
4. 校验短信验证码：`/coupon/present/sms/valid_security_code.api?mobile=...&requestId=...&securityCode=...`
5. 提交赠送：`/coupon/present/present.api`

## 请求细节

- `voucherNos` 取选中兑换券的 `couponNo`，多个用英文逗号拼接，再用旧包同款 `encodeURIComponent(...).replace(/%[0-9A-F]{2}/g, lower)` 处理。
- `canCouponPresent.api` 和 `idverify.api` 用 GET，并把编码后的 `voucherNos` 直接放进 path，避免二次编码影响签名。
- 发送短信需要旧包同款本机 IP 参数，因此在 Electron 主进程补 `app:get-local-ip` 桥接，由 preload 暴露 `window.wandaApp.getLocalIp()`。
- `present.api` 用表单 POST，body 保持旧包字段顺序：`voucherNos`、`shareMemo`、`targetMobile`、`requestId`、`securityCode`、`memberPhone`。
- 签名继续走现有 `wandaPostForm`，以旧接口 path 和表单 body 参与签名。

## 页面行为

- 批量赠送使用表格已选兑换券；行内赠送只赠送当前行。
- 打开赠送前先调用可赠送校验，再调用身份验证检查。
- 如果万达返回需要短信验证，弹窗展示当前账号手机号、获取验证码、验证码输入和校验动作。
- 如果不需要短信验证，直接允许输入接收手机号并提交赠送。
- 短信验证通过后单独保存“已验证验证码”；验证码输入一旦变化，立即清空已验证状态，提交时只使用已验证验证码。
- 每次赠送准备、弹窗关闭、账号切换都会刷新操作序号；旧账号或已关闭弹窗的异步请求返回后不得回写页面状态。
- 兑换券列表加载同样带账号与加载序号校验，避免账号切换时旧列表覆盖新账号数据。
- 提交成功后刷新兑换券列表，并清空本次赠送状态。
- 详情按钮展示当前接口返回的原始券数据，便于继续对照旧包字段。

## 验证

- 新增 `check:coupon-present` 契约，检查设计文档、Electron 本机 IP 桥接、服务层真实接口函数、兑换券页按钮接线和占位提示清理。
- 完成后运行 `check:coupon-present`、类型检查、全部现有契约检查和构建。
