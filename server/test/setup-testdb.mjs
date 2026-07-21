// 测试专用数据库准备:每次 `npm test` 前(pretest 钩子)重建独立的 test.db。
// 绝不碰 dev.db —— 以前测试直接跑 dev 库,beforeEach 的 deleteMany 会清空真实数据。
//
// 实现:用 node 内置 node:sqlite,按 prisma/migrations 里的迁移 SQL 顺序建表。
// 为什么不用 `prisma db push`:被 node 进程 spawn 时,prisma schema engine 在本机
// (Windows/Git Bash 非 TTY)会不稳定地报 "Schema engine error"。
// 为什么不直接复制 dev.db:dev 服务运行时 dev.db 处于 WAL 模式,最新的表可能还在
// -wal 里没落盘,复制会缺表。从迁移 SQL 建库是完全确定性的,且不依赖 dev.db / 运行中的服务。
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DB = './prisma/test.db'
const MIGRATIONS_DIR = './prisma/migrations'

// 清掉旧 test.db 及其副本文件
for (const s of ['', '-wal', '-shm', '-journal']) {
  try { rmSync(TEST_DB + s, { force: true }) } catch { /* 忽略 */ }
}

// 按目录名(时间戳前缀)排序,依次应用每个 migration.sql
const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

const db = new DatabaseSync(TEST_DB)
for (const dir of dirs) {
  const sql = readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8')
  db.exec(sql)
}
db.close()
console.log(`[test] 已从 ${dirs.length} 个迁移建出独立 test.db`)
