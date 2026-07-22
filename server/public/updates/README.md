# 客户端热更新目录

便携版客户端启动时会请求 `GET /updates/version.json`,与自身版本号比对,发现新版就下载、提示重启更新。

## 发新版流程
1. 在 `wanda-ticket-1.0.0/` 里改 `package.json` 的 `version`(比如 1.0.0 → 1.0.1)。
2. `npm run pack:win` 生成便携 exe:`wanda-ticket-1.0.0/dist/万达快速出票-1.0.1.exe`。
3. 把这个 exe 拷到本目录(`server/public/updates/`)。
4. 改本目录的 `version.json`:
   ```json
   { "version": "1.0.1", "url": "/updates/万达快速出票-1.0.1.exe", "notes": "本次更新内容…" }
   ```
5. 老客户端下次启动就会自动检测到 1.0.1 > 自身版本,下载后弹窗提示「立即重启更新」。

## 说明
- 更新源地址在 `wanda-ticket-1.0.0/src/main/portableUpdate.ts` 的 `UPDATE_FEED_BASE`(默认 `http://127.0.0.1:3000/updates`),生产改成你的域名。
- exe 文件较大,由后端 fastify-static 直接托管即可(本目录在 public 下,自动可访问)。
- `.exe` 已被 server/.gitignore 忽略,不会误提交进仓库。
