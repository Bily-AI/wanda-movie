# 卡密双类型 + 账号有效期 + 强制卡密注册 设计

日期:2026-07-21

## 目标
把计费模型从「单一积分卡」升级为两种卡密 + 账号有效期,并强制注册需卡密。

## 卡密两类(Card.kind)
- `point` 点卡:`points=N`,`durationDays=null`。出票扣点(1/次),点数本身不过期。
- `duration` 时长卡:`points=0`,`durationDays=30/90/365`(包月/包季/包年)。有效期内出票**不限次、不扣点**。

## 用户字段
- `expireAt`:账号总有效期,过期账号停用。
- `subscriptionUntil`:时长订阅到期(null=无)。
- `plan`:显示用套餐名(包月/包季/包年/时长Nd)。
- `remainingPoints`:点数余额。

## 规则
### 注册(必须带卡密)
`register(username, password, fingerprint, cardCode)`
- 无 cardCode → `CARD_REQUIRED`;卡无效/已用/停用 → `CARD_INVALID`/`CARD_USED`/`CARD_DISABLED`。
- 点卡 → `remainingPoints=points`,`expireAt=now+365天`,无订阅。
- 时长卡 → `subscriptionUntil=expireAt=now+durationDays`,`plan=包X`,`remainingPoints=0`。

### 充值(登录后)
- 点卡 → `remainingPoints += points`;**expireAt 不变**(账号固定注册起 1 年,按用户拍板)。
- 时长卡 → `base = subscriptionUntil>now ? subscriptionUntil : now`;`subscriptionUntil = base + durationDays`;`expireAt = max(expireAt, subscriptionUntil)`;更新 `plan`。

### 出票扣费(优先级)
1. `now > expireAt` → 拒绝(账号过期)。
2. `subscriptionUntil && now <= subscriptionUntil` → 免点、不限次(不扣点,幂等按 orderId 记 delta=0)。
3. 否则扣 1 点;点数不足 → 拒绝(需充值)。

### 右上角显示
- 订阅有效 → `{plan} · 到期 {日期}`。
- 纯点卡用户 → 只显示 `积分 {N}`,不显示到期。

## 后台
- 生成卡密选类型:点卡(填点数)/ 时长卡(选 30/90/365)。
- 卡密列表加「类型」列。

## 套餐名映射
`durationDays`:30→包月,90→包季,365→包年,其它→`时长Nd`。

## 影响文件
schema+迁移;server: auth.ts / cards.ts / points.ts / admin.ts / scripts/gen-cards.ts / prisma/seed.ts;client: stores/auth.ts / views/LoginView.vue / services/authApi.ts / App.vue(右上角);server/public/admin.html;全套单测 + e2e 冒烟。
