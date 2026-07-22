# 万达售票后端 —— Ubuntu VPS 部署手册

> 你自己在 VPS 上按顺序执行即可。命令里凡是「← 换成…」的地方都要改。
> 我不会用你的密码登你的服务器,请你亲自操作。

## 0. 安全前置(务必先做)

1. **改 root 密码**(你之前把密码发到聊天里了,那个已不安全):
   ```bash
   passwd
   ```
2. 建议以后用 SSH 密钥登录、禁用密码登录。至少先把 root 密码换掉。

## 1. 环境说明 / 端口规划

- 系统:Ubuntu
- 这台机器已装 **3x-ui**(翻墙面板)。风险:IP 若因翻墙被墙,售票后端会一起连不上。**有条件建议另开一台干净 VPS 只跑后端。** 先共存也能跑。
- 后端占用端口 **3000**。先确认没被 3x-ui 占:
  ```bash
  ss -ltnp | grep -E ':3000|:2053|:54321'   # 看 3000 是否空闲
  ```
  若 3000 被占,改 `.env` 里的 `PORT`,并同步改本手册后面所有 3000 的地方。

## 2. 装 Node 22 + PM2 + git

```bash
# Node 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git

node -v      # 应显示 v22.x
npm -v

sudo npm i -g pm2
```

## 3. 上传代码到服务器

**只传 `server/` 这个目录**(客户端不用上服务器)。任选一种:

- 用 git(推荐):在 VPS 上 `git clone 你的仓库`,然后 `cd 仓库/server`。
- 或本地打包上传:本地 `server/` 里**不要**带 `node_modules`、`dev.db`、`.env`,压缩后用 `scp` 传上去解压。

进入目录:
```bash
cd ~/wanda/server      # ← 换成你实际路径
```

## 4. 配置环境变量 .env

```bash
cp .env.example .env

# 生成两个随机密钥
openssl rand -hex 32     # 复制结果 → 填 JWT_SECRET
openssl rand -hex 32     # 再复制一个 → 填 CONFIG_ENC_KEY

nano .env
```
`.env` 必改项:
- `JWT_SECRET` = 上面第一个随机串
- `CONFIG_ENC_KEY` = 上面第二个随机串(**设过密钥后就别再改这个,否则后台已存的百度/DeepSeek 密钥会解不开**)
- `ADMIN_PASSWORD` = 你的强密码(别用 admin888)
- `DATABASE_URL="file:./prod.db"`(保持即可)
- `PORT=3000`

> 注意:默认管理员 `admin` 只在**数据库首次初始化、且该账号不存在时**用 `ADMIN_PASSWORD` 创建。若你之后想改后台密码,要么在后台里改,要么删库重来。

## 5. 安装依赖 + 生成 Prisma + 建库 + 编译

```bash
npm ci                       # 按 lock 装依赖(没有 lock 就 npm install)
npx prisma generate          # 生成 Prisma Client
npx prisma migrate deploy    # 按 migrations 建 prod.db(生产用 deploy,不是 migrate dev)
npm run build                # tsc 编译到 dist/
```

## 6. 用 PM2 启动 + 开机自启

```bash
pm2 start ecosystem.config.cjs
pm2 logs wanda-auth --lines 30     # 看到 "auth server listening on :3000" 就成了
pm2 save
pm2 startup                        # 按它打印的那条命令再执行一次,实现开机自启
```

自测(在 VPS 本机):
```bash
curl http://127.0.0.1:3000/health || curl -i http://127.0.0.1:3000/
```

## 7. 放行防火墙

```bash
# 若用 ufw:
sudo ufw allow 3000/tcp      # 直接用 IP+3000 时需要
# 若走 Nginx/HTTPS,则放 80/443,3000 不必对外
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```
**云厂商的「安全组/防火墙」也要放行对应端口**(在你买 VPS 的服务商控制台里),否则外网连不上。

## 8. 客户端指向服务器(关键,不然客户端还是连本地)

客户端里后端地址目前写死为本地。你要改成 VPS 地址后**重新打包客户端**发给用户:

- 文件 `wanda-ticket-1.0.0/src/renderer/config/authServer.ts`
  把 `http://127.0.0.1:3000` 改成:
  - 有域名+HTTPS:`https://api.你的域名.com`
  - 只用 IP:`http://103.97.201.139:3000`
- 文件 `wanda-ticket-1.0.0/src/main/portableUpdate.ts`
  把 `UPDATE_FEED_BASE` 的 `http://127.0.0.1:3000/updates` 改成同样的服务器地址 `.../updates`
- 然后 `cd wanda-ticket-1.0.0 && npm run pack:win` 重新出便携 exe。

> 我可以帮你把这两处改成「读环境变量/配置」的形式,打包时一处改全生效。需要的话说一声。

## 9. (可选但推荐)Nginx + HTTPS

只用 IP 是明文 HTTP,登录密码/JWT 走明网,不安全。有域名的话:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# 把 deploy/nginx.conf 拷到 /etc/nginx/sites-available/wanda,改好 server_name
sudo cp deploy/nginx.conf /etc/nginx/sites-available/wanda
sudo ln -s /etc/nginx/sites-available/wanda /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.你的域名.com    # 自动配 HTTPS
```
之后客户端连 `https://api.你的域名.com`,3000 端口不必对外(ufw 里可去掉)。

## 10. 日常运维

```bash
# 更新代码后
git pull                      # 或重新上传
npm ci && npx prisma migrate deploy && npm run build
pm2 restart wanda-auth

# 备份数据库(SQLite 就是一个文件,定期拷走)
cp prisma/prod.db ~/backup/prod-$(date +%F).db

pm2 logs wanda-auth           # 看日志
pm2 monit                     # 看资源
```

## 常见坑

- **外网连不上**:先在 VPS 本机 `curl 127.0.0.1:3000` 通不通 → 通了就是防火墙/安全组没放行。
- **客户端「连接服务器失败」**:多半是第 8 步没改客户端地址,或没用 HTTPS 但客户端写了 https。
- **改了 CONFIG_ENC_KEY 后台密钥全乱**:换了加密密钥导致旧密文解不开,把 key 改回去,或在后台重填密钥。
- **数据库被测试清空**:生产机千万别在 `server/` 里跑 `npm test`(测试会建 test.db,不碰 prod.db,但别手滑跑 `migrate dev`/`db push` 指向生产库)。
