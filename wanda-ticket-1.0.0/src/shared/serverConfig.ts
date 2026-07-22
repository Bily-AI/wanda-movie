// ===== 后端地址:全局唯一配置源 =====
// 换服务器 / 换域名,只改下面这一行 SERVER_BASE_URL 就够了。
//
// 生产:  http://103.97.201.139:3000   (只用 IP)
//    或:  https://api.你的域名.com      (上了 Nginx+HTTPS,推荐)
//
// 本地开发:必须用 127.0.0.1,不要用 localhost —— Electron/Chromium 会把
// localhost 优先解析成 IPv6 ::1,而后端只监听 IPv4(0.0.0.0),会导致「连接服务器失败」。
export const SERVER_BASE_URL = 'http://127.0.0.1:3000'

// 认证 / 积分 / 反馈 / 统计 等 REST 接口基址(渲染进程用)
export const AUTH_SERVER_BASE_URL = SERVER_BASE_URL

// 客户端热更新 manifest / 安装包 基址(主进程用)
export const UPDATE_FEED_BASE = `${SERVER_BASE_URL}/updates`
