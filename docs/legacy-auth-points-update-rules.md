# 旧版「鉴权 + 扣点数 + 热更新」机制逆向规则

> 目的：把旧版打包程序（`win-ia32-unpacked`，混淆过）里已有的鉴权 / 扣点数 / 心跳 / 充值 / 热更新机制扒清楚，作为在**我们自己服务器上复刻**的规则依据。
>
> 结论分三档：**✅ 已确认**（来自未混淆的主进程代码或字符串字面量）、**🟡 高置信推断**（逻辑可推但无直接证据）、**❓ 未确认**（混淆太重，需运行时抓包才能定）。
>
> 逆向来源文件：
> - `resources/app/out/renderer/assets/index-BJJNIRyY.js`（渲染层主逻辑，重度混淆）
> - `resources/app/out/main/index.js`（主进程，基本未混淆）
> - `resources/app/out/renderer/assets/LoginView-*.js`、`VipView-*.js`

---

## 0. 总体判断

旧版**没有自建账号系统**，而是接入了一套**第三方网络验证平台**（卡密/点数系统）：

| 项 | 值 |
|---|---|
| 验证后端 | `http://fn1.sxjrj.cn/Api?AppId=10002` |
| 充值/授权页 | `http://qp.sxjrj.cn/sc.php?qh=…`、`http://qp.sxjrj.cn?qh=…` |
| 热更新包 | `http://qp.sxjrj.cn/update/update.zip` |
| App 版本标识 | `appVer 2.0.0`、`AppId 10002` |
| 加密 | RSA（JSEncrypt，1024-bit 公钥）+ AES（CryptoJS，带 `AES_IV`）+ MD5 签名 |

**「复刻旧版扣点」= 在你们自己的服务器上，复刻这套「卡密登录 + 机器码绑定 + 按票扣点 + 心跳 + 充值 + zip 热更新」的行为**，不必照搬 sxjrj 第三方的加密协议（那套静态扒不全，我们自己设计更干净的协议即可）。

---

## 1. 鉴权 / 登录 ✅🟡

- **✅ 验证方式**：卡密 / 激活码 + 机器码绑定（单机登录）。登录页为独立的 `LoginView`，会员/点数页为 `VipView`（当前重构版都还没有）。
- **✅ 本地存储键**（`localStorage`，主进程 `main/index.js` L337–341 在窗口关闭时清空这几项）：
  | 键 | 含义 |
  |---|---|
  | `fn_login_status` | 登录状态 |
  | `fn_user_info` | 用户信息 |
  | `fn_remaining_points` | 剩余点数 |
  | `kyToken` | 认证 Token |
  | `CryptoKeyAes` | 会话 AES 密钥 |
- **✅ 加密**：敏感字段用 RSA 公钥加密；请求体用 AES（有 `AES_IV`）；配 MD5 签名（含签名盐）。
- **🟡 登录流程**：输入卡密 → RSA 加密 → POST `fn1.sxjrj.cn/Api?AppId=10002` → 后端校验并返回 Token + 剩余点数 → 存入 localStorage。
- **❓ 未确认**：请求的操作类型字段名与取值（如 `Type=Login`）、完整请求/响应字段名、机器码是否实时上报服务端做绑定校验。

## 2. 机器码 / 设备指纹 ✅

- **✅ 主进程 `main/index.js` L348–356 采集**：`hostname`、`platform`、`arch`、`cpus`、`memory`、`networkInterfaces`（MAC）。这些组合成设备指纹，用于单机绑定。
- **🟡 用途**：登录时随卡密一起上报，服务端把卡密绑定到某台机器，换机需解绑/重新授权。

## 3. 点数规则 ✅（实证：非按出票扣，而是「按功能按次扣」）

- **✅ 扣点接口**：`UserReduceVipNumber(n)`（扣积分）。平台还提供 `UserReduceVipTime`（扣时长）、`UserReduceMoney`（扣钱）、`GetVipData` / `GetAppUserVipNumber`（查余额），均在 `FORCE_RSA_APIS` 里强制 RSA 加密。
- **✅ 扣点方式**：**按功能、按次、按不同单价，在使用该功能的当下扣**——先查余额够不够 → 够则扣 → 再执行；不够则提示「当前积分不足（剩余…，需要 N 积分），请充值后再使用」并中止。**不是出票成功才扣。**
- **✅ 已确认单价**（日志字面量实证）：

  | 功能 | 单价（积分） | 证据 |
  |---|---|---|
  | 生成支付链接 | **3** | `[生成链接] 开始扣积分，参数: VipNumber=3`、`userReduceVipNumber(0x3)` |
  | 图片识别 | **8** | `[图片识别] 开始扣积分，参数: VipNumber=8`、`已扣除 8 积分` |
  | 文本识别 | **1** | 用户拍板(旧版静态未见明确扣积分) |
  | 某小额动作 | 0.1 | `UserReduceVipNumber(0.1)`（具体功能未定，本产品暂不复刻） |

- **✅ 余额展示**：本地键 `fn_remaining_points`，会员页 `VipView` 展示；查询用 `GetAppUserVipNumber`，扣点成功后刷新。
- **价目定稿**：生成支付链接 3、图片识别 8、文本识别 1（用户拍板）。做成后台可配的 `featurePricing`，随时可调；0.1 那次动作暂不复刻。

## 4. 心跳 / 掉线 ❓

- **❓ 未在主进程找到明确心跳逻辑**，可能在 Vue 组件生命周期里定时轮询。间隔、掉线处理均**未确认**。
- **🟡 推断**：定时（30s–5min）带 Token 请求验证接口保活；掉线则清 Token 回登录页。

## 5. 充值 / qh ❓

- **✅ 域名/路径**：`http://qp.sxjrj.cn/sc.php?qh=<值>`、`http://qp.sxjrj.cn?qh=<值>`；某处校验返回 `'ok'` 后用 `navigator.clipboard`/外部浏览器打开该页。
- **❓ 未确认**：`qh` 的确切含义与格式（推断是用户/卡密标识），充值后是否有回调刷新点数。
- **🟡 触发**：点「充值」按钮或点数不足时打开该页。

## 6. 热更新 ✅（主进程，未混淆，最可靠）

主进程 `main/index.js` 的 `ipcMain.handle("download-update", …)`：

1. **下载**：HTTP GET `http://qp.sxjrj.cn/update/update.zip`（L1011）
   - 处理 301/302 重定向；`User-Agent: WandaTicketTool/Updater`；实时推送下载进度。
2. **解压**：PowerShell `Expand-Archive`（L1101）到临时目录 `%TEMP%/wanda-update-extract`，解压后为 `out/` 子目录。
3. **部署**：
   - 备份旧 `out/` 目录；
   - 若检测到 `.asar`，先用 `npx @electron/asar` 解包；
   - 用新的 `out/` 覆盖应用目录；
   - 把 `package.json` 版本号更新为 `electron.app.getVersion()`。
4. **覆盖位置**：生产 `<exe 路径>/../app/out/`；开发 `<项目根>/out/`。
- **❓ 未确认**：版本号比对逻辑（推断在渲染层向服务端查最新版本号后触发下载）。

## 7. 未登录 / 点数为 0 的客户端行为 🟡

- **✅** 窗口关闭时清空全部 `fn_*` + `kyToken` + `CryptoKeyAes`（每次启动都要重新登录）。
- **🟡 推断**：未登录禁止进出票页、跳登录页；点数为 0 时弹警告 / 禁止出票 / 引导充值。**确切控制逻辑在混淆层，未能提取。**

---

## 8. 证据索引

| 项 | 位置 | 摘要 |
|---|---|---|
| FN_CONFIG | `index-BJJNIRyY.js` 头部 | `appWeb='http://fn1.sxjrj.cn/Api?AppId=10002'` + RSA 公钥 |
| localStorage 键 | `main/index.js` L337–341 | `fn_login_status/fn_user_info/fn_remaining_points/kyToken/CryptoKeyAes` |
| 机器信息采集 | `main/index.js` L348–356 | hostname/platform/arch/cpus/memory/networkInterfaces |
| 热更新 URL | `main/index.js` L1011 | `http://qp.sxjrj.cn/update/update.zip` |
| 解压方式 | `main/index.js` L1101 | PowerShell `Expand-Archive` |

---

## 9. 复刻时需要你拍板 / 补充的空白

1. **每票扣几点**（业务数值，只有你知道）——决定点数账本口径。
2. 卡密由**后台生成分发**还是允许**自助注册**？（推断是后台发卡密）
3. 机器绑定是否**支持解绑/换机**、每卡限几台机？
4. **热更新协议**：沿用旧版「服务端放一个 update.zip + 版本号接口」的简单方案，还是升级成 electron-updater 标准方案（配一键安装包 differential 更新）。
5. 是否需要**运行时抓包**把 sxjrj 第三方的精确接口也扒下来（如果你想 1:1 兼容旧卡密体系），还是**另起一套干净的自有协议**（推荐，反正后端换成你们自己的）。

> 上述 ❓ 项若要 1:1 复刻 sxjrj 协议，需要在真机上跑旧版 + 抓 HTTP 流量（Fiddler/Wireshark）或 Frida hook；若采用「复刻行为、自研协议」路线则无需抓包。
