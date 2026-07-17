# 后台管理员账号 + 操作日志 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。逐任务执行。
> 前置:后台已有(单密码登录 + 用户/卡密/流水/配置/反馈管理 + /admin 网页)。本计划把后台登录改成**账号密码 + 可创建管理员**,并加**操作日志**。

**Goal:** 后台用管理员账号密码登录、可创建更多管理员;所有后台写操作记审计日志,后台可查看。

## Global Constraints

- 新增 `Admin` 表(username 唯一 + bcrypt passwordHash);**默认管理员** username `admin`、密码取 `process.env.ADMIN_PASSWORD ?? 'admin888'`,在 `buildApp` 里幂等确保存在(`ensureDefaultAdmin`)。
- 登录 `POST /admin/login {username, password}`,bcrypt 校验,成功发管理 JWT(payload `{role:'admin', username}`)。
- 管理 JWT 带管理员用户名;`requireAdmin` 校验成功返回**用户名字符串**,失败 send 401 返回 null。
- 新增 `AdminLog` 表;每个后台**写操作**成功后记一条(who/action/detail/time)。
- 只有已登录管理员能创建管理员、查日志。
- SQLite 开发;统一响应壳。

---

## Task L1: Admin + AdminLog 表 + 默认管理员

**Files:** Modify `server/prisma/schema.prisma`;新增迁移;Create `server/src/admin/bootstrap.ts`;Modify `server/src/app.ts`。

- [ ] **Step 1:** schema 追加两个 model:
```prisma
model Admin {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
}

model AdminLog {
  id            Int      @id @default(autoincrement())
  adminUsername String
  action        String
  detail        String   @default("")
  createdAt     DateTime @default(now())
}
```

- [ ] **Step 2:** `cd server && npx prisma migrate dev --name admin_accounts`(Windows 静默失败设 `RUST_LOG=trace`)。

- [ ] **Step 3:** `server/src/admin/bootstrap.ts`:
```ts
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'

export async function ensureDefaultAdmin(): Promise<void> {
  const username = 'admin'
  const exists = await prisma.admin.findUnique({ where: { username } })
  if (!exists) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'admin888', 10)
    await prisma.admin.create({ data: { username, passwordHash } })
  }
}
```

- [ ] **Step 4:** `server/src/app.ts` 的 `buildApp()` 内、注册路由后、`return app` 前加:
```ts
import { ensureDefaultAdmin } from './admin/bootstrap.js'
// ...
await ensureDefaultAdmin()
```

- [ ] **Step 5:** `cd server && npm test` 应仍全绿(现有 admin-login 用 `{password}` 还兼容旧路由——本任务未改 login,只加表;若旧 admin 测试因 login 仍是旧单密码逻辑不受影响,应仍 36 passed)。提交:
```
git add -A server/prisma server/src/admin/bootstrap.ts server/src/app.ts
git commit -m "feat(server): Admin/AdminLog 表 + 默认管理员 bootstrap"
```

---

## Task L2: 管理员账号密码登录 + 创建管理员

**Files:** Modify `server/src/jwt.ts`、`server/src/admin/guard.ts`、`server/src/routes/admin.ts`;Modify `server/test/admin-login.test.ts`、`server/test/admin-manage.test.ts`、`server/test/admin-feedback.test.ts`(adminToken 改用户名密码)。

- [ ] **Step 1:** `server/src/jwt.ts` 改两个 admin 函数(签名带 username,校验返回 username):
```ts
export function signAdminToken(username: string): string {
  return jwt.sign({ role: 'admin', username }, SECRET, { expiresIn: '1d' })
}
export function verifyAdminToken(token: string): string | null {
  try {
    const d = jwt.verify(token, SECRET) as { role?: string; username?: string }
    return d.role === 'admin' && d.username ? d.username : null
  } catch {
    return null
  }
}
```

- [ ] **Step 2:** `server/src/admin/guard.ts` 改成返回用户名或 null:
```ts
import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAdminToken } from '../jwt.js'

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): string | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const username = token ? verifyAdminToken(token) : null
  if (!username) {
    reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    return null
  }
  return username
}
```

- [ ] **Step 3:** `server/src/routes/admin.ts`:
  - 顶部加 `import bcrypt from 'bcryptjs'`。
  - **改 login** 为账号密码:
```ts
  app.post('/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    if (!username || !password) return reply.send({ ok: false, code: 'BAD_LOGIN' })
    const admin = await prisma.admin.findUnique({ where: { username } })
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return reply.send({ ok: false, code: 'BAD_LOGIN' })
    }
    return reply.send({ ok: true, token: signAdminToken(username) })
  })
```
  - **把所有 `if (!requireAdmin(req, reply)) return` 改成** `const admin = requireAdmin(req, reply); if (!admin) return`(每个受保护 handler 首行;`admin` 变量供 L3 记日志用,本任务先取到即可,未用可加 `void admin` 或留待 L3)。
  - **新增创建/列出管理员**:
```ts
  app.post('/admin/admins', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    if (!username || !password) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    if (await prisma.admin.findUnique({ where: { username } })) return reply.send({ ok: false, code: 'USERNAME_TAKEN' })
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.admin.create({ data: { username, passwordHash } })
    return reply.send({ ok: true })
  })
  app.get('/admin/admins', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.admin.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ ok: true, items: rows.map((a) => ({ id: a.id, username: a.username, createdAt: a.createdAt.toISOString() })) })
  })
```
  (`signAdminToken` 引入名不变;`prisma`、`requireAdmin` 已 import。)

- [ ] **Step 4: 改测试**:
  - `admin-login.test.ts`:密码对的用例改成 `payload: { username: 'admin', password: 'admin888' }`;密码错用例 code 期望改 `BAD_LOGIN`。
  - `admin-manage.test.ts` 与 `admin-feedback.test.ts` 里的 `adminToken()` 改成 `payload: { username: 'admin', password: 'admin888' }`。
  - 追加一个用例(可放 admin-manage 或新文件)`server/test/admin-account.test.ts`:管理员登录 → 创建新管理员 `POST /admin/admins {username:'a2',password:'p2'}` → 用 a2 登录成功;重复用户名 → USERNAME_TAKEN。

- [ ] **Step 5:** `cd server && npm test` 全绿。提交:
```
git add server/src/jwt.ts server/src/admin/guard.ts server/src/routes/admin.ts server/test/admin-login.test.ts server/test/admin-manage.test.ts server/test/admin-feedback.test.ts server/test/admin-account.test.ts
git commit -m "feat(server): 管理员账号密码登录 + 创建管理员"
```

---

## Task L3: 操作日志

**Files:** Modify `server/src/routes/admin.ts`;Create `server/test/admin-log.test.ts`。

- [ ] **Step 1:** 在 `admin.ts` 顶部加日志 helper:
```ts
async function writeLog(adminUsername: string, action: string, detail = ''): Promise<void> {
  await prisma.adminLog.create({ data: { adminUsername, action, detail } })
}
```

- [ ] **Step 2:** 在每个**写操作** handler 成功处调用 `await writeLog(admin, '动作', '细节')`(admin 是 requireAdmin 返回的用户名)。逐个:
  - 禁用/启用用户:`writeLog(admin, 'user.disable'/'user.enable', 'userId='+id)`
  - 调积分:`writeLog(admin, 'user.adjust', 'userId='+id+' delta='+delta)`
  - 清绑定:`writeLog(admin, 'user.unbind', 'userId='+id)`
  - 生成卡:`writeLog(admin, 'card.generate', 'count='+count+' points='+points+' days='+validDays)`
  - 停用卡:`writeLog(admin, 'card.disable', 'cardId='+id)`
  - 改配置:`writeLog(admin, 'config.set', key+'='+value)`
  - 答复反馈:`writeLog(admin, 'feedback.reply', 'id='+id+' status='+status)`
  - 创建管理员:`writeLog(admin, 'admin.create', 'username='+username)`
  (读操作 GET 不记。)

- [ ] **Step 3:** 加查询接口:
```ts
  app.get('/admin/logs', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.adminLog.findMany({ orderBy: { id: 'desc' }, take: 200 })
    return reply.send({ ok: true, items: rows.map((l) => ({ id: l.id, adminUsername: l.adminUsername, action: l.action, detail: l.detail, createdAt: l.createdAt.toISOString() })) })
  })
```

- [ ] **Step 4: 测试** `server/test/admin-log.test.ts`:管理员登录 → 生成卡 → GET /admin/logs 里能看到一条 `card.generate`;禁用某用户 → 日志多一条 `user.disable`。`beforeEach` 记得 `await prisma.adminLog.deleteMany()`(以及现有 feedback/ledger/card/user 清理)。

- [ ] **Step 5:** `cd server && npm test` 全绿。提交:
```
git add server/src/routes/admin.ts server/test/admin-log.test.ts
git commit -m "feat(server): 后台操作日志(审计)+ 查询接口"
```

---

## Task L4: 后台网页 — 账号密码登录 + 管理员/日志 Tab

**Files:** Modify `server/public/admin.html`。

- [ ] **Step 1:** 把登录框从「只填密码」改成「**用户名 + 密码**」两个输入,提交 `POST /admin/login {username,password}`(默认可提示 `admin / admin888`)。
- [ ] **Step 2:** Tab 栏加两个:**管理员** 和 **日志**。
  - **管理员**:表格 GET /admin/admins(用户名、创建时间)+ 新建表单(用户名/密码 → POST /admin/admins,成功刷新;USERNAME_TAKEN 提示)。
  - **日志**:表格 GET /admin/logs(时间、管理员、动作 action、细节 detail),倒序。
- [ ] **Step 3: 手测**:重启后端,`http://localhost:3000/admin` 用 `admin/admin888` 登录 → 各 Tab 正常 → 新建一个管理员能登录 → 做几个操作后「日志」Tab 有记录。提交:
```
git add server/public/admin.html
git commit -m "feat(server): 后台网页 账号密码登录 + 管理员/日志 Tab"
```

---

## 备注
- 默认管理员 `admin/admin888`,上线务必登录后改密码(或加改密接口,后续)。
- 日志只记后台写操作;用户端行为(注册/充值/出票)已有 point_ledger 可追。
</content>
