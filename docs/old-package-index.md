# 旧 Electron 打包产物索引

旧包路径：D:\bily\win-ia32-unpacked\win-ia32-unpacked

## 旧应用信息

- 名称：wanda-ticket-tool
- 版本：2.8.7
- 描述：万达快速购票工具 - 现代化重构版
- 主入口：./out/main/index.js

## 旧 package dependencies

- @element-plus/icons-vue：^2.3.0
- axios：^1.6.0
- crypto-js：^4.2.0
- docx：^9.7.1
- element-plus：^2.4.0
- jsencrypt：^3.5.4
- pinia：^2.1.0
- pinyin-pro：^3.28.1
- qrcode：^1.5.0
- vue：^3.4.0
- vue-router：^4.2.0

## 关键文件

- package.json：D:\bily\win-ia32-unpacked\win-ia32-unpacked\resources\app\package.json
- 主进程：D:\bily\win-ia32-unpacked\win-ia32-unpacked\resources\app\out\main\index.js
- Preload：D:\bily\win-ia32-unpacked\win-ia32-unpacked\resources\app\out\preload\index.js
- 渲染资源目录：D:\bily\win-ia32-unpacked\win-ia32-unpacked\resources\app\out\renderer\assets
- 本地配置目录：D:\bily\win-ia32-unpacked\win-ia32-unpacked\config

## Wanda 主机

- card-api-prd-mx.wandafilm.com
- cinema-api-prd-mx.wandafilm.com
- coupon-api-prd-mx.wandafilm.com
- front-gateway-c.wandafilm.com
- mkt-activity-api-prd-mx.wandafilm.com
- user-api-prd-mx.wandafilm.com

## Wanda 接口路径

- /card/pay/list.api
- /card/user_card/list.api
- /cinema/by_cinemaid.api
- /coupon/bind.api
- /coupon/member/grouplist.api
- /coupon/present/canCouponPresent.api
- /coupon/present/idverify.api
- /coupon/present/present.api
- /coupon/present/sms/send_security_code.api
- /coupon/present/sms/valid_security_code.api
- /member/grade/gain_equity.api
- /member/grade/grade_equity_list.api
- /mkt/activity/secret/conponuse.api
- /mkt/activity/secret/list.api
- /mkt/activity/secret/ncoupons.api
- /mkt/activity/secret/selectcoupon.api
- /order/cancel.api
- /order/create_order.api
- /order/create.api
- /order/merge_payment.api
- /order/order_status.api
- /order/prepay.api
- /order/query_by_userid.api
- /order/query_order_list.api
- /order/query_pay_info_upgrade.api
- /order/real_time_seat.api
- /order/refund_order.api
- /pack_activity/activity/create_order.api
- /pack_activity/activity/detail.api
- /pack_activity/activity/list.api
- /showtime/by_cinema.api
- /sign_in/calendar.api
- /user/islogin.api
- /user/login_verify_code.api
- /user/login.api
- /wplus/member/plusDetail.api

## Wanda 签名盐值

- 是否检测到：是
- 说明：索引只记录是否存在，不输出完整盐值。

## 主进程 IPC

- ai-parse-ocr
- alipay-clear-session
- alipay-convert
- alipay-sync-device
- auto-order-process-ticket
- auto-order-report-result
- capture-element
- city-data-updated
- close-window
- copy-element-to-clipboard
- download-update
- fetch-proxy
- get-local-ip
- get-machine-info
- maximize-window
- minimize-window
- ocr-recognize
- open-auto-order-window
- proxy-clear-cache
- proxy-get-used
- read-accounts
- read-categories
- read-city-data
- read-clipboard-image
- read-clipboard-text
- read-proxy-settings
- restart-app
- update-download-progress
- wanda-http-get
- wanda-http-post
- write-accounts
- write-categories
- write-proxy-settings

## Preload 暴露 API

- aiParseOcr
- captureElement
- clearProxyCache
- close
- copyElementToClipboard
- fetchProxy
- getMachineInfo
- getUsedProxy
- maximize
- minimize
- ocrRecognize
- onCityDataUpdated
- openAutoOrderWindow
- readAccounts
- readCategories
- readCityData
- readClipboardImage
- readClipboardText
- readProxySettings
- reportAutoOrderResult
- sendAutoOrderTicket
- writeAccounts
- writeCategories
- writeProxySettings

## 外部服务

- 百度 OCR：https://aip.baidubce.com/oauth/2.0/token，https://aip.baidubce.com/rest/2.0/ocr/v1/accurate，https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic
- 支付宝：http://mcgw.alipay.com/gateway.do
- 旧软件鉴权：检测到线索（URL 1 条，标记 3 条，已脱敏）
- 旧更新地址：检测到线索（URL 2 条，已脱敏）

## 旧功能模块

- 软件登录页：证据：LoginView 资源；旧软件鉴权服务线索；归纳：本期按用户要求跳过软件鉴权
- 万达账号登录：证据：/user/login_verify_code.api；/user/login.api；read-accounts；write-accounts
- 购票查询：证据：TicketView 资源；cinemaApi 资源；/cinema/by_cinemaid.api；/showtime/by_cinema.api
- 动态座位图：证据：seatApi 资源；/order/real_time_seat.api；归纳：座位图来自实时接口，不使用固定模板
- 订单与支付：证据：/order/create.api；/order/prepay.api；/order/merge_payment.api；/order/order_status.api；支付宝网关
- 历史订单：证据：OrderHistoryView 资源；/order/query_order_list.api；/order/query_pay_info_upgrade.api
- 储值卡：证据：StoredValueCardView 资源；/card/user_card/list.api；/card/pay/list.api
- 兑换券：证据：ExchangeCouponView 资源；/coupon/member/grouplist.api；/coupon/bind.api；/coupon/present/*
- 会员权益：证据：VipView 资源；/member/grade/*；/wplus/member/plusDetail.api；/sign_in/calendar.api
- 活动礼包：证据：ActivityView 资源；/pack_activity/activity/*；/mkt/activity/secret/*
- OCR 识别：证据：百度 OCR 服务地址；百度 OCR token 地址；accurate/accurate_basic 识别地址；ocr-recognize；captureElement；readClipboardImage；aiParseOcr
- 代理与自动支付辅助：证据：fetch-proxy；proxy-get-used；proxy-clear-cache；alipay-sync-device；alipay-convert；alipay-clear-session
- 自动下单：证据：AutoOrderView 资源；open-auto-order-window；auto-order-process-ticket；auto-order-report-result
- 日志与设置：证据：LogView 资源；SettingsView 资源；readProxySettings；writeProxySettings；归纳：包含窗口、主题、请求参数等设置线索

## 旧业务模式

- 购票链路：证据：/cinema/by_cinemaid.api；/showtime/by_cinema.api；/order/real_time_seat.api；归纳：根据接口组合归纳为城市/影院/影片/日期/场次到座位的链路
- 座位来源：证据：/order/real_time_seat.api；归纳：座位状态来自旧 Wanda 实时座位接口
- 下单支付链路：证据：/order/create.api；/order/prepay.api；/order/merge_payment.api；/order/order_status.api；/order/cancel.api；/order/refund_order.api
- 支付宝辅助链路：证据：支付宝网关；alipay-sync-device；alipay-convert；alipay-clear-session
- OCR 辅助链路：证据：百度 OCR 服务地址；captureElement；readClipboardImage；aiParseOcr
- 卡券与会员链路：证据：/card/user_card/list.api；/card/pay/list.api；/coupon/member/grouplist.api；/member/grade/*；/wplus/member/plusDetail.api
- 网络与代理链路：证据：wanda-http-get；wanda-http-post；fetch-proxy；proxy-get-used；proxy-clear-cache

## 渲染资源统计

- JS 文件数：17
- ActivityView-BHIu0zWB.js（37969 字节）
- AutoOrderView-BHzDJJqS.js（33615 字节）
- cinemaApi-CaSvFp2C.js（1425 字节）
- ExchangeCouponView-D7pg-wzF.js（51793 字节）
- index-BIdfEfgb.js（2978330 字节）
- index.deobf.js（2978330 字节）
- log-RG7axmDi.js（1399 字节）
- LoginView-DqWPorSB.js（17718 字节）
- LogView-BdKV3f3s.js（6793 字节）
- OrderHistoryView-fzhX0-3e.js（35182 字节）
- seatApi-DRvI3y7l.js（48766 字节）
- seatApi.deobf.js（48766 字节）
- SettingsView-CW4vK-xR.js（23239 字节）
- StoredValueCardView-B0Nkeihd.js（37834 字节）
- TicketView-BMjvUszG.js（573188 字节）
- TicketView.deobf.js（573188 字节）
- VipView-BkMCWbzQ.js（46247 字节）
- CSS 文件数：11
- ActivityView-DxPQYAU5.css（6184 字节）
- AutoOrderView-6vjM1Asi.css（3470 字节）
- ExchangeCouponView-DY1s8ukE.css（5062 字节）
- index-Bi22a6Dm.css（377212 字节）
- LoginView-BQht6I71.css（8572 字节）
- LogView-B_pDONRO.css（555 字节）
- OrderHistoryView-Fke4vbmn.css（12102 字节）
- SettingsView-Cz3Ooeeg.css（3697 字节）
- StoredValueCardView-Fj-5FTIx.css（8020 字节）
- TicketView-DSqvVfpd.css（26394 字节）
- VipView-DFErTa5z.css（11786 字节）

## 本地配置文件

- accounts.json
- city.json
- proxy.json

> 只列出配置文件名，不写入旧包账号、CK 或代理配置内容。
