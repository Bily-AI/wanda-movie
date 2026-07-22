#!/usr/bin/env bash
# 万达售票后端 一键部署脚本(在 server/ 目录运行:  bash deploy/setup.sh)
# 干的事:装 Node22/PM2 → 生成 .env(随机密钥)→ 装依赖 → 建库 → 编译 → PM2 启动
set -euo pipefail
cd "$(dirname "$0")/.."   # 切到 server/

echo "==> [1/6] 检查 Node 22"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  [ "$MAJOR" -ge 22 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" = "1" ]; then
  echo "    安装 Node 22 ..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi
node -v

echo "==> [2/6] 检查 PM2"
command -v pm2 >/dev/null 2>&1 || sudo npm i -g pm2

echo "==> [3/6] 准备 .env"
if [ ! -f .env ]; then
  JWT=$(openssl rand -hex 32)
  ENC=$(openssl rand -hex 32)
  ADM=$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9' | cut -c1-14)
  cat > .env <<EOF
DATABASE_URL="file:./prod.db"
JWT_SECRET="$JWT"
CONFIG_ENC_KEY="$ENC"
ADMIN_PASSWORD="$ADM"
PORT=3000
NODE_ENV=production
EOF
  echo "    .env 已生成(随机密钥)。"
  echo "    ================================================"
  echo "    管理后台账号: admin"
  echo "    管理后台密码: $ADM   <-- 请立刻记下来!"
  echo "    ================================================"
else
  echo "    已存在 .env,跳过(不覆盖你已有的密钥)。"
fi

echo "==> [4/6] 安装依赖"
npm ci || npm install

echo "==> [5/6] 生成 Prisma + 建库 + 编译"
npx prisma generate
npx prisma migrate deploy
npm run build

echo "==> [6/6] PM2 启动"
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart wanda-auth
pm2 save

echo ""
echo "==> 完成。自测:"
echo "    curl http://127.0.0.1:3000/health   # 应返回 {\"ok\":true}"
echo "==> 开机自启(按它打印的命令再执行一次):  pm2 startup"
echo "==> 下一步上 HTTPS:  bash deploy/setup-https.sh"
