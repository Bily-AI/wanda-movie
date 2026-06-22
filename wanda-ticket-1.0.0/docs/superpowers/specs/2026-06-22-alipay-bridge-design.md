# 支付宝桥接恢复设计

旧 Electron 包提供 `alipay-clear-session`、`alipay-sync-device`、`alipay-convert` 三个 IPC，用于把万达返回的 `appPayParam` 转换成支付宝 H5 支付链接，并复用 `persist:alipay` 会话窗口。本阶段先恢复桥接能力，不把任意支付流程强制改成自动支付。

## 1.0.0 行为

- `alipay-convert` 接收真实 `appPayParam`，沿用旧包 `mcgw.alipay.com/gateway.do` 转换算法。
- `alipay-sync-device` 保存支付宝窗口使用的设备指纹、iOS 版本、屏幕尺寸和 build。
- `alipay-clear-session` 清理 `persist:alipay` 会话并关闭支付宝支付窗口。
- 支付宝窗口使用旧包默认的 iPhone User-Agent 和 `persist:alipay` 分区。
- 自动填手机号/支付密码只在显式传入 `autoPayment.enabled` 且本地配置有值时尝试执行。
- 本阶段不修改万达接口白名单，不把支付宝请求放进 `wanda-http`，避免和万达接口转发混在一起。
