// PM2 进程守护配置。用法(在 server 目录):
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup   (按提示再跑一条命令,让 PM2 开机自启)
//   pm2 logs wanda-auth       (看日志)
//   pm2 restart wanda-auth    (更新代码后重启)
//
// 环境变量走 .env 文件:Node 22 用 --env-file=.env 直接加载,
// 不依赖 dotenv 包,.env 里所有变量都会进 process.env。
module.exports = {
  apps: [
    {
      name: 'wanda-auth',
      script: 'dist/src/server.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      autorestart: true,
      watch: false
    }
  ]
}
