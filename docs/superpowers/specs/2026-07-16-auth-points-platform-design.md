# 万达出票工具 商业化平台 总体设计 + SP1(后端基座 + 鉴权)详细设计

> 日期：2026-07-16
> 状态：设计评审中(brainstorming 产物,待用户确认后进入实现计划)
> 前置参考:`docs/legacy-auth-points-update-rules.md`(旧版鉴权/点数/热更新逆向规则)

---

## 一、目标

把现有单机桌面工具 `wanda-ticket-1.0.0`(Electron + Vue3 + Pinia + TS)升级为**带后端的商业化产品**,新增六项能力:用户鉴权、扣点数计费、后台管理、用户问题反馈、客户端热更新、一键安装包。

本文覆盖:**总体架构 + 子项目拆分**,以及**第一个子项目 SP1(后端基座 + 鉴权)的详细设计**。SP2~SP5 各自单独出 spec。

---

## 二、已敲定的地基决策

| 决策点 | 结论 |
|---|---|
| 后端基础设施 | 用户自有**服务器 + 域名**,自建后端 + 数据库 |
| 鉴权/点数协议 | **自研干净协议(REST + JWT)**,复刻旧版行为,不照搬旧版第三方(sxjrj)加密协议,无需抓包 |
| 开通方式 | **后台发卡密 → 用户激活 → 绑机器**(复刻旧版) |
| 卡密模型 | **点数卡 + 有效期**:激活后有积分余额和到期时间 |
| 扣点模型(MVP) | **先只做:出票成功扣 1 积分**(拿到取票码 / 订单 finalize 时),按订单号幂等(同一单不重复扣)。单价走配置 `deductPerPayment`(默认 1),后台可改 |
| 扣点模型(后续) | 完整的「按功能、按次、按不同单价扣」(生成支付链接=3、图片识别=8、文本识别=1,复刻旧版)作为后续迭代;配置结构 `featurePricing` 先预留,MVP 不接 |
| 使用闸门 | **积分足够且未过期**才能提交支付;不足提示充值、禁用提交 |
| 规则可配置 | 扣点单价、每卡绑几台、心跳间隔、过期/点尽处理策略等**全部走后台可配的系统配置**,客户端从接口动态读,不写死 |
| 技术栈 | **Node/TS 全栈**:后端 Fastify + Prisma + PostgreSQL,后台管理 Vue,三端共享 `shared` 类型 |

---

## 三、总体架构

三个可部署单元:

1. **鉴权/点数后端**(Node + TS,Fastify + Prisma + PostgreSQL)—— 部署在用户服务器
2. **后台管理**(Vue 后台 SPA,与客户端同技术栈,共享类型)
3. **桌面客户端改造**(现有 Electron App:登录闸门、点数展示、反馈、更新)

```
┌────────────┐    REST+JWT    ┌─────────────────┐    ┌────────────┐
│ 桌面客户端  │ ─────────────► │  鉴权/点数后端   │ ◄── │ 后台管理    │
│ (Electron) │  激活/心跳/扣点 │ (Fastify+Prisma) │    │ (Vue SPA)  │
└────────────┘                └────────┬────────┘    └────────────┘
                                       │
                                 ┌─────▼─────┐
                                 │PostgreSQL │
                                 └───────────┘
```

### 核心数据模型(跨子项目共享,Prisma schema 一次建好)

| 表 | 关键字段 | 归属 SP |
|---|---|---|
| `card` 卡密 | code(唯一)、points、validDays、status(未激活/已激活/停用)、boundDeviceId、activatedAt、createdAt、batchId | SP1(生成在 SP3) |
| `device` 设备/用户 | fingerprint(唯一)、cardId、remainingPoints、expireAt、lastSeenAt、disabledAt、createdAt | SP1 |
| `app_config` 系统配置 | key、value(见下表)| SP1(改配置 UI 在 SP3) |
| `point_ledger` 点数流水 | deviceId、delta(+充值/−出票)、reason、orderId(唯一,幂等)、balance、createdAt | SP2 |
| `feedback` 反馈 | deviceId、fingerprint、content、contact、images、status、reply、createdAt | SP4 |
| `app_version` 版本 | version、url、notes、forced、createdAt | SP5 |
| `admin` 管理员 | username、passwordHash、createdAt | SP3 |

### 系统配置项 `app_config`

| key | 含义 | 默认 | 迭代 |
|---|---|---|---|
| `deductPerPayment` | **付款成功扣几积分**(本次迭代唯一扣点) | 1 | 本次 |
| `maxDevicesPerCard` | 每卡可绑几台机 | 1 | 本次 |
| `heartbeatSec` | 客户端心跳间隔(秒) | 60 | 本次 |
| `blockWhenExpired` | 过期是否硬停(禁用提交支付) | true | 本次 |
| `blockWhenNoPoints` | 余额不足是否硬停 | true | 本次 |
| `defaultCardPoints` | 生成卡密默认积分 | (填) | 本次 |
| `defaultCardValidDays` | 生成卡密默认有效天数 | (填) | 本次 |
| `featurePricing` | 各功能单价(生成链接3/图识8/文识1,复刻旧版) | 预留 | **后续** |

> **后续价目表(先不做,仅存档)**:生成支付链接 3、图片识别 8、文本识别 1(旧版实证 + 用户拍板)。等 MVP 跑通后再把「按功能按次扣」接上,`featurePricing` 配置结构先在 schema 预留。旧版那处 `UserReduceVipNumber(0.1)` 小额扣减未定位到功能,不复刻。

> 卡级可覆盖:生成卡密时按批设定 `points` / `validDays`(如「100 积分 30 天卡」)。
> 旧版还有 `UserReduceVipTime`(扣时长)、`UserReduceMoney`(扣钱)两种扣减,本产品按用户选择只用**积分(`UserReduceVipNumber` 对应)**;有效期为卡级到期时间(非按次消耗)。

---

## 四、子项目拆分与构建顺序

> ⚠️ **本次迭代范围(其余先不做)**:只做 **SP1 后端基座+鉴权** + **SP2-MVP(付款成功扣 1 积分)**。卡密先用 seed 脚本生成。
> SP0 安装包、SP3 后台管理、SP4 反馈、SP5 热更新,以及 SP2 的完整「按功能计价」,**全部后续迭代**。

| 子项目 | 内容 | 依赖 | 本次? |
|---|---|---|---|
| **SP1** 后端基座 + 鉴权 | 服务骨架 + 卡密激活 + 机器绑定 + JWT + 心跳 + 配置层 + 客户端登录闸门 | ★地基 | ✅ 本次 |
| **SP2-MVP** 扣点(简化) | 点数流水表 + **付款成功扣 1 积分**(按订单号幂等,扣失败回滚)+ 余额/过期禁用提交支付 | SP1 | ✅ 本次 |
| **SP2-full** 按功能计价 | 生成链接/图识/文识各单价,用前查余额→扣→执行 | SP2-MVP | 后续 |
| **SP0** 一键安装包 | electron-builder 换 NSIS 一键安装包(替代绿色文件夹) | 无 | 后续 |
| **SP3** 后台管理 | 管理员登录 + 批量生成卡密 + 管用户/设备 + 看流水 + 改配置 | SP1、SP2 | 后续 |
| **SP4** 用户反馈 | 客户端提交反馈 → 后端存储 → 后台查看/回复 | SP1、SP3 | 后续 |
| **SP5** 热更新 | 版本接口 + 客户端更新 | SP0 | 后续 |

每个子项目单独走「设计 spec → 实现计划 → 编码 → 契约测试」。

---

## 五、本次迭代详细设计:后端基座 + 鉴权(SP1) + 付款成功扣 1 积分(SP2-MVP)

### 5.1 范围

**含**:后端服务骨架(Fastify + Prisma + PostgreSQL)、Prisma schema(建全部核心表)、`app_config` 配置读取、卡密激活、机器绑定、JWT 会话、心跳、客户端登录闸门与积分/到期展示、生成卡密的 seed 脚本(供测试)、**付款成功扣 1 积分(幂等,见 5.9)**。

**不含(先不做)**:完整功能计价(SP2-full)、后台管理 UI(SP3)、反馈(SP4)、热更新(SP5)、一键安装包(SP0)。`featurePricing` 价目表仅在 schema 预留,不接。

### 5.2 机器指纹(客户端主进程)

复刻旧版采集项,合成稳定指纹:
```
fingerprint = sha256( hostname + '|' + platform + '|' + arch
                    + '|' + 首个非虚拟网卡 MAC
                    + '|' + cpus[0].model )
```
- 每次启动稳定,换硬件(主板/网卡)才变
- 主进程通过 IPC 暴露给渲染层;渲染层激活/心跳时带上

### 5.3 激活流程

```
1. 客户端无本地 token → 登录页输入卡密
2. POST /auth/activate { cardCode, fingerprint }
3. 服务端:
   - 卡密不存在        → 400  code=CARD_INVALID   「卡密无效」
   - status=disabled   → 403  code=CARD_DISABLED  「卡密已停用」
   - status=unactivated:
        建 device(fingerprint, cardId, remainingPoints=card.points,
                  expireAt = now + card.validDays 天)
        card.status = active, card.boundDeviceId = device.id, activatedAt = now
        → 200 返回 token + 状态
   - status=active:
        若已绑设备数 < maxDevicesPerCard 且该 fingerprint 未绑 → 追加绑定(默认 1 台即仅允许原机)
        若 fingerprint == 已绑设备 → 允许(同机重新登录)
        否则 → 403 code=CARD_BOUND_OTHER 「卡密已在其他设备激活」
4. 返回:{ ok:true, token, remainingPoints, expireAt, config:{deductPerTicket, heartbeatSec, blockWhenExpired, blockWhenNoPoints} }
5. 客户端持久化 token → 进主界面
```

### 5.4 会话与心跳

- **JWT**:payload `{ deviceId, cardId }`,有效期 **7 天**;客户端本地持久化 → **下次启动自动登录**(改进旧版每次关窗重登的体验)。
- **心跳**:`POST /auth/heartbeat`(带 `Authorization: Bearer <token>`),间隔由服务端下发的 `heartbeatSec`(默认 60s)控制:
  - 校验 device 未被禁用、card 未停用、fingerprint 匹配 → 更新 `lastSeenAt`,返回 `{ remainingPoints, expireAt, config }`
  - device 被封 / card 停用 / 换机 / token 失效 → 401/403 → 客户端清 token 回登录页
  - 网络抖动容忍:偶发失败不立即踢,仅明确的鉴权失败(401/403)才登出

### 5.5 登录闸门(客户端)

- App 启动:有 token → 心跳校验;通过进主界面,失败/无 token → 登录页
- 顶部 header「本地模式 / 鉴权未启用」→ 换成 **剩余点数 + 到期时间**
- **提交支付闸门**(本次迭代):
  - `blockWhenNoPoints && remainingPoints < deductPerPayment` → 禁用「提交支付」,提示余额不足去充值
  - `blockWhenExpired && now >= expireAt` → 禁用「提交支付」,提示已过期
  - 余额/到期/闸门策略均来自 activate/heartbeat 响应的 `config`,**客户端不写死**

### 5.6 接口契约(SP1)

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/auth/activate` | `{cardCode, fingerprint}` | `{ok, token, remainingPoints, expireAt, config}` 或 `{ok:false, code, msg}` |
| POST | `/auth/heartbeat` | Header token,body `{}` | `{ok, remainingPoints, expireAt, config}` 或 401/403 |
| POST | `/points/deduct` | Header token,`{orderId}` | `{ok, remainingPoints}`;按 orderId 幂等;余额不足/过期 → `{ok:false, code}` |

统一响应壳:`{ ok: boolean, code?: string, msg?: string, ...data }`。

### 5.7 错误处理与安全

- **卡密爆破防护**:同 IP / 同 fingerprint 的激活失败限速(如 10 次/分)
- **服务端为准**:点数、到期、闸门策略一律以服务端为准,客户端只展示,不可篡改放行
- 传输走 HTTPS(用户域名配证书)

### 5.8 测试

- **后端**:vitest + supertest 覆盖 `/auth/activate` 各分支(无效卡 / 停用 / 新激活 / 同机重登 / 异机拒)、`/auth/heartbeat` 各分支(正常 / 封禁 / 停用 / 换机 / 失效 token)、配置读取默认值
- **客户端**:沿用现有 `tools/check-*.mjs` 契约脚本风格,新增「登录闸门 + 点数展示 + 出票禁用」契约

### 5.9 SP2-MVP:付款成功扣 1 积分

- **触发点**:客户端**出票成功**(拿到取票码 / `finalizeCurrentOrder` 那一刻,与「今日出票只统计成功单」同口径)后,带 `orderId` 调 `POST /points/deduct`。
- **服务端**:按 `orderId` **幂等**扣 `deductPerPayment`(默认 1)积分;写 `point_ledger`(delta=−1、reason='ticket'、orderId);同一 orderId 重复请求只扣一次;余额不足/过期返回失败(客户端提交支付前闸门已拦,双保险)。
- **扣失败处理**:网络失败重试;服务端幂等保证不重复扣。
- **口径已定**:出票成功才扣(不是提交支付就扣),没出成票不扣,对用户友好。

### 5.10 本次迭代交付边界

完成后:能发卡密(seed 脚本)、激活绑机、启动自动登录、心跳保活、顶部显示积分/到期、余额不足或过期禁用提交支付、**付款成功扣 1 积分(幂等)**。**先不做**:完整功能计价、后台 UI、反馈、热更新、安装包。

---

## 六、待拍板 / 后续的业务数值

| 项 | 归属 | 说明 |
|---|---|---|
| 扣点时机 | 本次(SP2-MVP) | **已定:出票成功(拿到取票码)才扣**,幂等按订单号 |
| 每卡绑几台机 / 解绑换机 | 本次(SP1) | `maxDevicesPerCard` 默认 1;解绑 UI 属后续 SP3 |
| 生成卡密默认积分/天数 | 本次(SP1) | 有配置默认值,seed 生成时可覆盖 |
| 各功能单价(完整计价) | 后续 SP2-full | 生成链接=3、图识=8、文识=1,已存档 |
| 热更新方案 | 后续 SP5 | electron-updater vs 复刻旧版 zip |

---

## 七、开放问题(需用户后续确认)

1. 数据库确定用 PostgreSQL 还是 MySQL(默认 PostgreSQL,二选一不影响设计)。
2. 后台管理是否需要多级管理员/代理分销(当前设计单层管理员;若要代理体系需在 SP3 扩展)。
3. 充值动作的具体形态(用户再激活一张新卡自助充值,还是仅后台手动充点)——影响 SP2/SP3,SP1 已预留 `expireAt` 顺延语义(`max(当前expireAt, now) + 新卡validDays`)。
