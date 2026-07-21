// 生产改成用户后端域名,如 https://api.你的域名.com
// 本地必须用 127.0.0.1 而非 localhost:Electron/Chromium 会把 localhost 优先解析成 IPv6 ::1,
// 而后端只监听 IPv4(0.0.0.0),会导致「连接服务器失败」。127.0.0.1 强制走 IPv4。
export const AUTH_SERVER_BASE_URL = 'http://127.0.0.1:3000'
