# 会员签到真实接口链路设计

## 目标

会员页的“每日签到”必须使用旧 Electron 包里的万达接口，不再展示固定写死的 7 天占位数据。

## 旧包依据

- 旧包函数名：`getSignInCalendar`
- 请求地址：`/sign_in/calendar.api`
- 请求方式：POST
- 请求 body：`{"ruleScene":1}`
- 签名 body：`encodeURIComponent(JSON.stringify({ ruleScene: 1 }))` 后把 `%XX` 转成小写
- Content-Type：`application/json`
- 响应读取：`data.data.consecutiveDays`、`data.data.signInStreak`、`data.data.dataList`

## 页面行为

- 账号缺少 `userIdentifier` 时使用旧包默认值 `YYDDJDKYHA`。
- 会员页加载 Rtime、W+ 权益时同步加载签到日历。
- 已签到日期按 `state === 1` 显示勾选状态。
- 今日按 `todayFlag` 高亮。
- 日期项展示接口返回的 `day`、`date`、`content`、`iconUrl`，不补 mock 数据。
- 接口失败时保留会员权益加载，不影响 Rtime/W+ 数据展示，并在日志里记录失败原因。
