# 代理桥接恢复设计

旧 Electron 包在活动礼包和自动支付链路里提供了代理辅助 IPC：`fetch-proxy`、`proxy-get-used`、`proxy-clear-cache`。本阶段先恢复这三个桥接能力，保持 1.0.0 当前 `ok/data/error` 返回格式，供活动页和后续自动支付链路复用。

## 旧包依据

- `fetch-proxy` 从本地 `proxy.json` 的 `proxyApiUrl` 拉取代理。
- 支持 JSON 响应里的 `ip`、`host`、`proxy_ip` 和 `port`、`proxy_port`。
- 支持纯文本 `ip:port`。
- 成功后缓存代理 60 秒，并记录最后一次使用的 `host:port`。
- `proxy-clear-cache` 清空缓存和最后一次代理。
- `proxy-get-used` 返回最后一次代理。

## 1.0.0 行为

- 主进程新增代理处理模块，不在渲染进程直接请求代理 API。
- Preload 暴露 `fetchProxy`、`getUsedProxy`、`clearProxyCache`。
- 活动页保存代理设置后再拉取活动或下单，避免勾选代理但配置未落盘。
- `WandaHttpRequest` 支持 `useProxy` 标记；只有调用方显式传入时才使用代理，不把所有万达请求强制走代理。
- 活动礼包列表、详情、订单、支付参数链路传递 `settingsStore.useProxyIp`。
