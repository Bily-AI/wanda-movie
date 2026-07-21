// 测试专用数据库准备:每次 `npm test` 前(pretest 钩子)重建独立的 test.db。
// 绝不碰 dev.db —— 以前测试直接跑 dev 库,beforeEach 的 deleteMany 会清空真实数据。
//
// 实现:直接把已迁移好的 dev.db 复制成 test.db。
// 为什么不用 `prisma db push`:被 node 进程 spawn 时,prisma schema engine 在本机
// (Windows/Git Bash 非 TTY)会不稳定地报 "Schema engine error"。复制 dev.db 是确定性的,
// schema 现成(dev 已经过 migrate),测试再靠 beforeEach 清 test.db 里的数据即可。
import { copyFileSync, existsSync, rmSync } from 'node:fs'

const DEV_DB = './prisma/dev.db'
const TEST_DB = './prisma/test.db'
const SIDE = ['-journal', '-wal', '-shm']

// 清掉旧 test.db 及其副本文件
for (const f of [TEST_DB, ...SIDE.map((s) => TEST_DB + s)]) {
  try { rmSync(f, { force: true }) } catch { /* 忽略 */ }
}

if (!existsSync(DEV_DB)) {
  console.error(`[test] 找不到 ${DEV_DB}。请先在 server 目录跑一次 \`npm run db:migrate\` 生成/迁移开发库。`)
  process.exit(1)
}

copyFileSync(DEV_DB, TEST_DB)
console.log('[test] 已从 dev.db 复制出独立 test.db')
