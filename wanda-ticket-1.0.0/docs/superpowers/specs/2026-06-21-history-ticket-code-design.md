# 历史订单取票码面板设计

## 目标

历史订单页在查询订单详情后，复用旧万达订单详情接口返回的取票码和二维码，提供和购票页一致的查看、截图保存、复制截图能力。该功能只展示真实接口数据，不补 mock 码。

## 范围

- 保留现有历史订单列表、筛选、分页、导出。
- 操作列的“支付信息”继续调用 `queryOrderByUserId`。
- 详情弹窗中增加可截图的取票码面板，展示影片、影院、场次、订单号、金额、取票码和二维码。
- 使用已有 Electron IPC：`captureElement` 和 `copyElementToClipboard`。
- “截图保存”落盘到图片目录，“复制截图”只写剪贴板。

## 数据流

1. 用户在历史订单页点击“支付信息”。
2. `ordersStore.queryOrderPayInfo(order)` 调用真实万达接口。
3. 弹窗基于 `ordersStore.currentPayInfo.ticketCodes` 和 `qrCodes` 渲染。
4. 截图按钮使用 `.history-ticket-code-panel` 捕获当前面板。

## 异常处理

- 没有登录账号、订单 ID 为空、接口失败时，沿用现有错误消息和日志。
- 没有取票码/二维码时，不显示假数据，只展示空态和接口返回的其他支付字段。
- Electron 桥不可用或截图失败时，使用页面消息提示。

## 验证

- 新增 `check:history-ticket-code` 契约检查历史订单页按钮、面板、截图/复制 API 调用。
- 保留原有阶段契约、流程契约、OCR 契约和生产构建验证。
