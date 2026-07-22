#!/usr/bin/env bash
# 给 fast.761775970.xyz 配 Nginx 反代 + Let's Encrypt 证书
# 前提:① 后端已在 3000 跑起来(先跑 setup.sh) ② 域名 A 记录已指向本机 IP、且 Cloudflare 为「仅 DNS/灰云」
# 用法(在 server/ 目录):  bash deploy/setup-https.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="fast.761775970.xyz"

echo "==> 安装 nginx + certbot"
sudo apt install -y nginx certbot python3-certbot-nginx

echo "==> 部署 nginx 站点配置"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/wanda
sudo ln -sf /etc/nginx/sites-available/wanda /etc/nginx/sites-enabled/wanda
# Ubuntu 默认站点会抢 80,禁用它避免冲突
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> 申请 HTTPS 证书(会问你邮箱,填一个即可)"
sudo certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "admin@$DOMAIN" || \
  sudo certbot --nginx -d "$DOMAIN"

echo ""
echo "==> 完成!客户端后端地址填:  https://$DOMAIN"
echo "==> 可选:关掉 3000 对外(只留 Nginx):  sudo ufw delete allow 3000/tcp"
