# 鉴权改造:账号密码 + 卡密充值(账号绑单机)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。逐任务执行,checkbox 跟踪。
> 前置:已完成「卡密激活」版(分支 `feat/auth-points-mvp`)。本计划把鉴权层从「卡密激活」改成「账号密码登录 + 卡密充值」,点数/扣点/心跳/配置/客户端出票扣点接线尽量复用。

**Goal:** 用户自助注册账号密码登录(绑单机),卡密变成充值码(登录后输卡密给账号加积分/延到期),出票成功仍按 orderId 幂等扣 1 积分。

**Tech Stack:** 后端 Fastify + Prisma(SQLite 开发)+ JWT + **bcryptjs**;客户端 Electron+Vue3+Pinia+axios。

## Global Constraints

- 复用现有 `server/`(A1 脚手架、A3 gen-cards、config 层)与客户端(顶部积分展示 B5、提交支付闸门 B6、出票扣点接线 B7 均不变——因 `deductPoint(token, orderId)` 签名不变)。
- 数据源从 `device` 换成 **`user`**;jwt payload 从 `{deviceId,cardId}` 换成 `{userId}`。
- 新账号 `remainingPoints=0`、`expireAt=null`,**必须充值(redeem 卡密)才能出票**。
- 机器绑定:register/首次 login 写 `user.boundFingerprint`;之后校验一致,异机拒 `MACHINE_BOUND_OTHER`。
- 密码用 **bcryptjs**(纯 JS,免 Windows 原生编译)哈希。
- 过期口径:`expireAt` 为 null 或已过 → 视为不可出票(EXPIRED)。
- 幂等扣点:`point_ledger.orderId` 唯一;deduct 的 catch 仅吞 P2002。
- 统一响应壳 `{ok, code?, msg?, ...}`;鉴权失败用 401,BAD_REQUEST 用 400。
- 开发 SQLite(`file:./dev.db`);生产切 PostgreSQL(改 provider 重新 migrate)。

---

## Task R1: 重构 Prisma schema(device→user、card 加充值字段、ledger.userId)

**Files:** Modify `server/prisma/schema.prisma`;重建 `server/prisma/migrations`;Modify `server/prisma/seed.ts`(不变,确认)。

- [ ] **Step 1: 改 schema.prisma**(把 `Device` 模型整体换成 `User`,`Card` 加充值字段,`PointLedger` 改 userId):
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id              Int       @id @default(autoincrement())
  username        String    @unique
  passwordHash    String
  remainingPoints Int       @default(0)
  expireAt        DateTime?
  boundFingerprint String?
  disabledAt      DateTime?
  createdAt       DateTime  @default(now())
  ledger          PointLedger[]
  cards           Card[]
}

model Card {
  id           Int       @id @default(autoincrement())
  code         String    @unique
  points       Int
  validDays    Int
  status       String    @default("unused") // unused | used | disabled
  usedByUserId Int?
  usedBy       User?     @relation(fields: [usedByUserId], references: [id])
  usedAt       DateTime?
  createdAt    DateTime  @default(now())
}

model AppConfig {
  key   String @id
  value String
}

model PointLedger {
  id        Int      @id @default(autoincrement())
  userId    Int
  user      User     @relation(fields: [userId], references: [id])
  delta     Int
  reason    String
  orderId   String   @unique
  balance   Int
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: 重建迁移**(开发库无数据,直接重置):
Run(在 `server/`):`rm -rf prisma/migrations prisma/dev.db && npx prisma migrate dev --name account_model`
(Windows PowerShell 等价:`Remove-Item -Recurse -Force prisma/migrations, prisma/dev.db -ErrorAction SilentlyContinue; npx prisma migrate dev --name account_model`。若 Prisma 引擎静默失败,设 `RUST_LOG=trace` 重试。)
Expected:生成新 migration、建表成功、Prisma client 重新生成。

- [ ] **Step 3: 确认 seed.ts 不受影响**(它只写 app_config,不动)。跑 `cd server && npm run db:seed`,应打印 seeded app_config。

- [ ] **Step 4: 提交**:
```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "refactor(server): schema 改为账号模型(User + 充值码 Card + ledger.userId)"
```

---

## Task R2: JWT payload 改 {userId} + 安装 bcryptjs

**Files:** Modify `server/src/jwt.ts`、`server/package.json`;Modify `server/test/jwt.test.ts`。

- [ ] **Step 1: 装 bcryptjs**:Run `cd server && npm install bcryptjs && npm install -D @types/bcryptjs`

- [ ] **Step 2: 改 jwt.test.ts**(payload 改 userId):
```ts
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from '../src/jwt.js'

describe('jwt', () => {
  it('签发并校验', () => {
    const t = signToken({ userId: 7 })
    expect(verifyToken(t)).toMatchObject({ userId: 7 })
  })
  it('无效 token 返回 null', () => {
    expect(verifyToken('garbage')).toBeNull()
  })
})
```
Run `cd server && npm test jwt` → 失败(类型/断言不符)。

- [ ] **Step 3: 改 jwt.ts**(payload 类型 userId,保留生产 fail-fast):
```ts
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量在生产环境必须设置')
}

export function signToken(payload: { userId: number }): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    const d = jwt.verify(token, SECRET) as { userId: number }
    return { userId: d.userId }
  } catch {
    return null
  }
}
```
Run `cd server && npm test jwt` → 2 passed。

- [ ] **Step 4: 提交**:
```bash
git add server/src/jwt.ts server/test/jwt.test.ts server/package.json server/package-lock.json
git commit -m "refactor(server): JWT payload 改 userId + 装 bcryptjs"
```

---

## Task R3: /auth/register + /auth/login(替换 activate)

**Files:** Rewrite `server/src/routes/auth.ts`;Delete `server/test/activate.test.ts`;Create `server/test/register-login.test.ts`。

**Interfaces produced:**
- `POST /auth/register {username,password,fingerprint}` → `{ok:true, token, remainingPoints, expireAt, config}` 或 `{ok:false, code}`(USERNAME_TAKEN|BAD_REQUEST)
- `POST /auth/login {username,password,fingerprint}` → 成功同上;失败 code∈ BAD_LOGIN(用户名或密码错)|MACHINE_BOUND_OTHER|USER_DISABLED|BAD_REQUEST
- `config = {deductPerPayment, heartbeatSec, blockWhenExpired, blockWhenNoPoints}`

- [ ] **Step 1: 删旧 activate 测试**:Run `cd server && git rm test/activate.test.ts`

- [ ] **Step 2: 写失败测试 `server/test/register-login.test.ts`**:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const reg = (b: unknown) => app.inject({ method: 'POST', url: '/auth/register', payload: b })
const login = (b: unknown) => app.inject({ method: 'POST', url: '/auth/login', payload: b })

describe('register/login', () => {
  it('注册成功 → 建账号(0积分/无到期)、绑机、发 token', async () => {
    const res = await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    const b = res.json()
    expect(b.ok).toBe(true)
    expect(typeof b.token).toBe('string')
    expect(b.remainingPoints).toBe(0)
    expect(b.expireAt).toBeNull()
    expect(b.config.deductPerPayment).toBe(1)
  })
  it('用户名重复 → USERNAME_TAKEN', async () => {
    await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    const res = await reg({ username: 'u1', password: 'p2', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'USERNAME_TAKEN' })
  })
  it('登录成功(同机)', async () => {
    await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    const res = await login({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    expect(res.json().ok).toBe(true)
  })
  it('密码错 → BAD_LOGIN', async () => {
    await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    const res = await login({ username: 'u1', password: 'wrong', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'BAD_LOGIN' })
  })
  it('异机登录 → MACHINE_BOUND_OTHER', async () => {
    await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    const res = await login({ username: 'u1', password: 'p1', fingerprint: 'fp2' })
    expect(res.json()).toMatchObject({ ok: false, code: 'MACHINE_BOUND_OTHER' })
  })
})
```
Run `cd server && npm test register-login` → 失败。

- [ ] **Step 3: 重写 `server/src/routes/auth.ts`**(register + login + heartbeat,heartbeat 见 R5;本步先放 register/login + clientConfig + heartbeat 占位一起写全):
```ts
import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { signToken, verifyToken } from '../jwt.js'

export function clientConfig(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    deductPerPayment: cfg.deductPerPayment,
    heartbeatSec: cfg.heartbeatSec,
    blockWhenExpired: cfg.blockWhenExpired,
    blockWhenNoPoints: cfg.blockWhenNoPoints
  }
}

function sessionPayload(user: { id: number; remainingPoints: number; expireAt: Date | null }, token: string, cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    ok: true, token,
    remainingPoints: user.remainingPoints,
    expireAt: user.expireAt ? user.expireAt.toISOString() : null,
    config: clientConfig(cfg)
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { username, password, fingerprint } = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string }
    if (!username || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const exists = await prisma.user.findUnique({ where: { username } })
    if (exists) return reply.send({ ok: false, code: 'USERNAME_TAKEN' })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { username, passwordHash, boundFingerprint: fingerprint } })
    const cfg = await loadConfig()
    return reply.send(sessionPayload(user, signToken({ userId: user.id }), cfg))
  })

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { username, password, fingerprint } = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string }
    if (!username || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.send({ ok: false, code: 'BAD_LOGIN' })
    }
    if (user.disabledAt) return reply.send({ ok: false, code: 'USER_DISABLED' })
    if (!user.boundFingerprint) {
      await prisma.user.update({ where: { id: user.id }, data: { boundFingerprint: fingerprint } })
    } else if (user.boundFingerprint !== fingerprint) {
      return reply.send({ ok: false, code: 'MACHINE_BOUND_OTHER' })
    }
    const cfg = await loadConfig()
    return reply.send(sessionPayload(user, signToken({ userId: user.id }), cfg))
  })

  app.post('/auth/heartbeat', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })
    const cfg = await loadConfig()
    return reply.send({
      ok: true,
      remainingPoints: user.remainingPoints,
      expireAt: user.expireAt ? user.expireAt.toISOString() : null,
      config: clientConfig(cfg)
    })
  })
}
```

- [ ] **Step 4:** Run `cd server && npm test register-login` → 5 passed。再全量 `npm test`(activate 已删,heartbeat 测试见 R5 会更新)。若此刻 heartbeat.test.ts 仍是旧 device 版会失败——**R5 会重写它**;本步可先只跑 register-login,把全量留到 R5 后。

- [ ] **Step 5: 提交**:
```bash
git add server/src/routes/auth.ts server/test/register-login.test.ts server/test/activate.test.ts
git commit -m "feat(server): /auth/register + /auth/login(账号密码+机器绑定)"
```

---

## Task R4: /cards/redeem 卡密充值

**Files:** Create `server/src/routes/cards.ts`、`server/test/redeem.test.ts`;Modify `server/src/app.ts`(注册)。

**Interfaces:** `POST /cards/redeem {cardCode}`(Bearer token)→ `{ok:true, remainingPoints, expireAt}`;失败 code∈ CARD_INVALID|CARD_USED|CARD_DISABLED|UNAUTHORIZED|BAD_REQUEST

- [ ] **Step 1: 写失败测试 `server/test/redeem.test.ts`**:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
async function registerToken() {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  return res.json().token as string
}
const redeem = (token: string, cardCode: string) =>
  app.inject({ method: 'POST', url: '/cards/redeem', headers: { authorization: `Bearer ${token}` }, payload: { cardCode } })

describe('POST /cards/redeem', () => {
  it('充值成功 → 加积分、设到期、卡标记 used', async () => {
    const token = await registerToken()
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    const res = await redeem(token, 'C1')
    const b = res.json()
    expect(b.ok).toBe(true)
    expect(b.remainingPoints).toBe(100)
    expect(new Date(b.expireAt).getTime()).toBeGreaterThan(Date.now())
    const card = await prisma.card.findUnique({ where: { code: 'C1' } })
    expect(card?.status).toBe('used')
  })
  it('再充一张 → 积分累加、到期顺延', async () => {
    const token = await registerToken()
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await prisma.card.create({ data: { code: 'C2', points: 50, validDays: 30 } })
    await redeem(token, 'C1')
    const res = await redeem(token, 'C2')
    expect(res.json().remainingPoints).toBe(150)
  })
  it('卡不存在 → CARD_INVALID', async () => {
    const token = await registerToken()
    expect((await redeem(token, 'NOPE')).json()).toMatchObject({ ok: false, code: 'CARD_INVALID' })
  })
  it('已用卡 → CARD_USED', async () => {
    const token = await registerToken()
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await redeem(token, 'C1')
    expect((await redeem(token, 'C1')).json()).toMatchObject({ ok: false, code: 'CARD_USED' })
  })
})
```
Run `cd server && npm test redeem` → 失败。

- [ ] **Step 2: 实现 `server/src/routes/cards.ts`**:
```ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

export async function cardRoutes(app: FastifyInstance): Promise<void> {
  app.post('/cards/redeem', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { cardCode } = (req.body ?? {}) as { cardCode?: string }
    if (!cardCode) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const card = await prisma.card.findUnique({ where: { code: cardCode } })
    if (!card) return reply.send({ ok: false, code: 'CARD_INVALID' })
    if (card.status === 'disabled') return reply.send({ ok: false, code: 'CARD_DISABLED' })
    if (card.status === 'used') return reply.send({ ok: false, code: 'CARD_USED' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    const base = user.expireAt && user.expireAt.getTime() > Date.now() ? user.expireAt.getTime() : Date.now()
    const newExpire = new Date(base + card.validDays * 86400_000)

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.card.updateMany({
          where: { id: card.id, status: 'unused' },
          data: { status: 'used', usedByUserId: user.id, usedAt: new Date() }
        })
        if (c.count === 0) throw new Error('CARD_ALREADY_USED')
        return tx.user.update({
          where: { id: user.id },
          data: { remainingPoints: { increment: card.points }, expireAt: newExpire }
        })
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints, expireAt: updated.expireAt?.toISOString() ?? null })
    } catch {
      return reply.send({ ok: false, code: 'CARD_USED' })
    }
  })
}
```

- [ ] **Step 3: 注册路由** `server/src/app.ts`:加 `import { cardRoutes } from './routes/cards.js'` 与 `await app.register(cardRoutes)`。

- [ ] **Step 4:** Run `cd server && npm test redeem` → 4 passed。

- [ ] **Step 5: 提交**:
```bash
git add server/src/routes/cards.ts server/src/app.ts server/test/redeem.test.ts
git commit -m "feat(server): /cards/redeem 卡密充值(加积分+顺延到期,原子标记已用)"
```

---

## Task R5: heartbeat 重写测试 + /points/deduct 改 user

**Files:** Rewrite `server/test/heartbeat.test.ts`;Modify `server/src/routes/points.ts`;Rewrite `server/test/deduct.test.ts`。

- [ ] **Step 1: 重写 `server/test/heartbeat.test.ts`**(用 register 拿 token,断言 user 语义):
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
async function registerToken() {
  const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  return res.json().token as string
}

describe('POST /auth/heartbeat', () => {
  it('有效 token → 返回积分与到期', async () => {
    const token = await registerToken()
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json().remainingPoints).toBe(0)
    expect(res.json().expireAt).toBeNull()
  })
  it('无 token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat' })
    expect(res.statusCode).toBe(401)
  })
  it('账号禁用 → 401', async () => {
    const token = await registerToken()
    await prisma.user.updateMany({ data: { disabledAt: new Date() } })
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: 改 `server/src/routes/points.ts`**(device→user):把 handler 整体替换为:
```ts
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { verifyToken } from '../jwt.js'

export async function pointsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/points/deduct', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })

    const { orderId } = (req.body ?? {}) as { orderId?: string }
    if (!orderId) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    const existing = await prisma.pointLedger.findUnique({ where: { orderId } })
    if (existing) return reply.send({ ok: true, remainingPoints: user.remainingPoints })

    const cfg = await loadConfig()
    if (cfg.blockWhenExpired && (!user.expireAt || user.expireAt.getTime() <= Date.now())) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }
    if (cfg.blockWhenNoPoints && user.remainingPoints < cfg.deductPerPayment) {
      return reply.send({ ok: false, code: 'NO_POINTS' })
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: user.id },
          data: { remainingPoints: { decrement: cfg.deductPerPayment } }
        })
        await tx.pointLedger.create({
          data: { userId: u.id, delta: -cfg.deductPerPayment, reason: 'ticket', orderId, balance: u.remainingPoints }
        })
        return u
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const u = await prisma.user.findUnique({ where: { id: user.id } })
        return reply.send({ ok: true, remainingPoints: u?.remainingPoints ?? user.remainingPoints })
      }
      throw err
    }
  })
}
```

- [ ] **Step 3: 重写 `server/test/deduct.test.ts`**(register + redeem 充值后再扣):
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
async function ready(points = 100) {
  const r = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  const token = r.json().token as string
  if (points > 0) {
    await prisma.card.create({ data: { code: 'C1', points, validDays: 30 } })
    await app.inject({ method: 'POST', url: '/cards/redeem', headers: { authorization: `Bearer ${token}` }, payload: { cardCode: 'C1' } })
  }
  return token
}
const deduct = (token: string, orderId: string) =>
  app.inject({ method: 'POST', url: '/points/deduct', headers: { authorization: `Bearer ${token}` }, payload: { orderId } })

describe('POST /points/deduct', () => {
  it('出票成功扣 1 点', async () => {
    const token = await ready(100)
    expect((await deduct(token, 'O1')).json()).toMatchObject({ ok: true, remainingPoints: 99 })
  })
  it('同 orderId 幂等只扣一次', async () => {
    const token = await ready(100)
    await deduct(token, 'O1')
    expect((await deduct(token, 'O1')).json().remainingPoints).toBe(99)
    expect(await prisma.pointLedger.count({ where: { orderId: 'O1' } })).toBe(1)
  })
  it('新账号未充值(0积分且无到期) → EXPIRED 或 NO_POINTS', async () => {
    const token = await ready(0)
    const code = (await deduct(token, 'O1')).json().code
    expect(['EXPIRED', 'NO_POINTS']).toContain(code)
  })
  it('缺 orderId → 400', async () => {
    const token = await ready(100)
    const res = await app.inject({ method: 'POST', url: '/points/deduct', headers: { authorization: `Bearer ${token}` }, payload: {} })
    expect(res.statusCode).toBe(400)
  })
})
```
(注:新账号 expireAt=null,按 deduct 逻辑先判 EXPIRED,故断言允许 EXPIRED 或 NO_POINTS。)

- [ ] **Step 4:** Run `cd server && npm test`(全量,应 register-login 5 + redeem 4 + heartbeat 3 + deduct 4 + jwt 2 + config 1 + gen-cards 1 + health 1 = **21 passed**,无 device 残留)。

- [ ] **Step 5: 提交**:
```bash
git add server/src/routes/points.ts server/test/heartbeat.test.ts server/test/deduct.test.ts
git commit -m "refactor(server): heartbeat/deduct 改 user + 测试改账号模型"
```

---

## Task R6: 客户端 authApi 改账号模型

**Files:** Modify `wanda-ticket-1.0.0/src/renderer/services/authApi.ts`。

- [ ] **Step 1:** 把 `authApi.ts` 整体替换为(activate→register/login,加 redeem,expireAt 允许 null):
```ts
import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface AuthConfig {
  deductPerPayment: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}
export interface SessionResult {
  ok: boolean; token?: string; remainingPoints?: number; expireAt?: string | null; config?: AuthConfig; code?: string
}
export interface HeartbeatResult {
  ok: boolean; remainingPoints?: number; expireAt?: string | null; config?: AuthConfig; code?: string
}
export interface RedeemResult { ok: boolean; remainingPoints?: number; expireAt?: string | null; code?: string }
export interface DeductResult { ok: boolean; remainingPoints?: number; code?: string }

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 10000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })

export async function register(username: string, password: string, fingerprint: string): Promise<SessionResult> {
  const { data } = await http.post('/auth/register', { username, password, fingerprint }, { validateStatus: () => true })
  return data as SessionResult
}
export async function login(username: string, password: string, fingerprint: string): Promise<SessionResult> {
  const { data } = await http.post('/auth/login', { username, password, fingerprint }, { validateStatus: () => true })
  return data as SessionResult
}
export async function redeemCard(token: string, cardCode: string): Promise<RedeemResult> {
  const { data } = await http.post('/cards/redeem', { cardCode }, auth(token))
  return data as RedeemResult
}
export async function heartbeat(token: string): Promise<HeartbeatResult> {
  const { data } = await http.post('/auth/heartbeat', {}, auth(token))
  return data as HeartbeatResult
}
export async function deductPoint(token: string, orderId: string): Promise<DeductResult> {
  const { data } = await http.post('/points/deduct', { orderId }, auth(token))
  return data as DeductResult
}
```

- [ ] **Step 2:** Run `cd wanda-ticket-1.0.0 && npm run typecheck`(此刻 auth store 仍引用旧 `activate` 会报错——R7 修;可先只确认 authApi 本身语法,或与 R7 连做后统一 typecheck。建议 R6+R7 连续做,末尾统一 typecheck)。

- [ ] **Step 3: 提交**:
```bash
git add wanda-ticket-1.0.0/src/renderer/services/authApi.ts
git commit -m "refactor(client): authApi 改账号模型(register/login/redeem)"
```

---

## Task R7: 客户端 auth store 改账号模型

**Files:** Rewrite `wanda-ticket-1.0.0/src/renderer/stores/auth.ts`。

- [ ] **Step 1:** 把 `auth.ts` 整体替换为:
```ts
import { defineStore } from 'pinia'
import { register, login, redeemCard, heartbeat, type AuthConfig } from '@renderer/services/authApi'

const TOKEN_KEY = 'wanda_auth_token'
const DEFAULT_CONFIG: AuthConfig = { deductPerPayment: 1, heartbeatSec: 60, blockWhenExpired: true, blockWhenNoPoints: true }
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    loggedIn: false,
    remainingPoints: 0,
    expireAt: null as string | null,
    config: { ...DEFAULT_CONFIG } as AuthConfig,
    authError: '' as string
  }),
  getters: {
    canPay(state): boolean {
      if (!state.loggedIn) return false
      if (state.config.blockWhenExpired && (!state.expireAt || Date.now() >= new Date(state.expireAt).getTime())) return false
      if (state.config.blockWhenNoPoints && state.remainingPoints < state.config.deductPerPayment) return false
      return true
    }
  },
  actions: {
    async register(username: string, password: string) {
      this.authError = ''
      const fp = await window.wandaApp!.getMachineFingerprint()
      const res = await register(username.trim(), password, fp)
      return this.handleSession(res)
    },
    async login(username: string, password: string) {
      this.authError = ''
      const fp = await window.wandaApp!.getMachineFingerprint()
      const res = await login(username.trim(), password, fp)
      return this.handleSession(res)
    },
    handleSession(res: { ok: boolean; token?: string; remainingPoints?: number; expireAt?: string | null; config?: AuthConfig; code?: string }) {
      if (!res.ok) { this.authError = mapCode(res.code); return false }
      this.applyLogin(res.token!, res.remainingPoints ?? 0, res.expireAt ?? null, res.config!)
      localStorage.setItem(TOKEN_KEY, res.token!)
      this.startHeartbeat()
      return true
    },
    async redeem(cardCode: string) {
      this.authError = ''
      const res = await redeemCard(this.token, cardCode.trim())
      if (!res.ok) { this.authError = mapCode(res.code); return false }
      this.remainingPoints = res.remainingPoints ?? this.remainingPoints
      this.expireAt = res.expireAt ?? this.expireAt
      return true
    },
    async bootstrap() {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return
      try {
        const res = await heartbeat(token)
        if (res.ok) {
          this.applyLogin(token, res.remainingPoints ?? 0, res.expireAt ?? null, res.config!)
          this.startHeartbeat()
        } else { this.logout() }
      } catch { /* 离线冷启动:保留 token,等联网 */ }
    },
    applyLogin(token: string, points: number, expireAt: string | null, config: AuthConfig) {
      this.token = token; this.loggedIn = true
      this.remainingPoints = points; this.expireAt = expireAt; this.config = config
    },
    startHeartbeat() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      const ms = Math.max(15, this.config.heartbeatSec) * 1000
      heartbeatTimer = setInterval(async () => {
        if (!this.token) return
        try {
          const res = await heartbeat(this.token)
          if (res.ok) {
            this.remainingPoints = res.remainingPoints ?? 0; this.expireAt = res.expireAt ?? null; this.config = res.config!
          } else if (res.code) { this.logout() }
        } catch { /* 网络抖动忽略 */ }
      }, ms)
    },
    logout() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      this.token = ''; this.loggedIn = false; this.remainingPoints = 0; this.expireAt = null
      localStorage.removeItem(TOKEN_KEY)
    }
  }
})

function mapCode(code?: string): string {
  switch (code) {
    case 'USERNAME_TAKEN': return '用户名已被占用'
    case 'BAD_LOGIN': return '用户名或密码错误'
    case 'MACHINE_BOUND_OTHER': return '该账号已绑定其他设备'
    case 'USER_DISABLED': return '账号已被禁用'
    case 'CARD_INVALID': return '充值卡无效'
    case 'CARD_USED': return '该卡已被使用'
    case 'CARD_DISABLED': return '该卡已停用'
    default: return '操作失败,请检查网络'
  }
}
```

- [ ] **Step 2:** Run `cd wanda-ticket-1.0.0 && npm run typecheck`(应无报错;若 LoginView 仍调旧 `activateCard`/`loginError` 会报错——R8 修;R7+R8 连做后统一 typecheck)。

- [ ] **Step 3: 提交**:
```bash
git add wanda-ticket-1.0.0/src/renderer/stores/auth.ts
git commit -m "refactor(client): auth store 改账号模型(register/login/redeem, expireAt 可空)"
```

---

## Task R8: 登录页改账号密码 登录/注册 + 充值入口

**Files:** Rewrite `wanda-ticket-1.0.0/src/renderer/views/LoginView.vue`;Modify `wanda-ticket-1.0.0/src/renderer/App.vue`(加充值入口)。

- [ ] **Step 1: 重写 `LoginView.vue`**(登录/注册切换):
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) return
  submitting.value = true
  const ok = mode.value === 'login'
    ? await auth.login(username.value, password.value)
    : await auth.register(username.value, password.value)
  submitting.value = false
  if (ok) { ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功'); router.replace('/ticket') }
  else ElMessage.error(auth.authError)
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>
      <el-input v-model="username" placeholder="用户名" />
      <el-input v-model="password" type="password" placeholder="密码" show-password @keyup.enter="submit" />
      <p v-if="auth.authError" class="login-err">{{ auth.authError }}</p>
      <el-button type="primary" :loading="submitting" :disabled="!username.trim() || !password" @click="submit">
        {{ mode === 'login' ? '登录' : '注册' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.login-page { height: 100vh; display: grid; place-items: center; background: var(--app-bg, #f3f5f9); }
.login-box { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(31,42,68,.12); }
.login-tabs { display: flex; gap: 8px; }
.login-tabs button { flex: 1; padding: 8px; border: none; background: #eef1f6; border-radius: 6px; cursor: pointer; color: #6b7280; }
.login-tabs button.active { background: var(--app-accent, #2f6fed); color: #fff; }
.login-err { margin: 0; color: #f56c6c; font-size: 13px; }
</style>
```

- [ ] **Step 2: App.vue 加充值入口**:在顶部积分/到期 chip 旁加一个「充值」按钮,点开输入卡密调 `auth.redeem`。`<script setup>` 里(auth 已引入)加:
```ts
import { ElMessageBox, ElMessage } from 'element-plus'
async function handleRecharge() {
  try {
    const { value } = await ElMessageBox.prompt('请输入充值卡密', '充值', { confirmButtonText: '充值', cancelButtonText: '取消' })
    if (!value) return
    const ok = await auth.redeem(value)
    if (ok) ElMessage.success('充值成功'); else ElMessage.error(auth.authError)
  } catch { /* 用户取消 */ }
}
```
模板里在积分 chip 旁加:`<el-button size="small" @click="handleRecharge">充值</el-button>`(若 App.vue 已 import ElMessage,勿重复 import;按现有 import 情况调整)。

- [ ] **Step 3:** Run `cd wanda-ticket-1.0.0 && npm run typecheck && npm run check:all`。若 `check-auth-gate` 因断言 `getMachineFingerprint()`/`canPay`/`startHeartbeat` 仍存在(都还在)应通过;若断言了 `router.beforeEach`/`path: '/login'`(仍在)也通过。若因 auth store 改名(如 `activateCard`→无)导致某契约失败,更新该条契约为新的方法名(如断言 `login`/`register`/`redeem`)。

- [ ] **Step 4: 提交**:
```bash
git add wanda-ticket-1.0.0/src/renderer/views/LoginView.vue wanda-ticket-1.0.0/src/renderer/App.vue wanda-ticket-1.0.0/tools
git commit -m "feat(client): 登录页改账号密码 登录/注册 + 顶部充值入口"
```

---

## Task R9: 更新鉴权契约 + 端到端手测

**Files:** Modify `wanda-ticket-1.0.0/tools/check-auth-gate-contract.mjs`(如需)。

- [ ] **Step 1:** 更新 `check-auth-gate-contract.mjs` 里对 auth store 的断言,改成账号模型的实际方法/文本(如断言 `stores/auth.ts` 含 `redeemCard`、`register`、`login`;`services/authApi.ts` 含 `/auth/register`、`/cards/redeem`;LoginView 含「注册」)。跑 `npm run check:all` 全绿。

- [ ] **Step 2: 端到端手测**:
  - 后端:`cd server && npm run db:seed && npm run gen:cards -- 1 100 30`(记卡密),`npm run dev`
  - 客户端:`cd wanda-ticket-1.0.0 && npm run dev`
  - 预期:进登录页 → 注册账号 → 进主界面(积分 0、无到期,提交支付禁用提示充值)→ 点「充值」输卡密 → 积分变 100、到期 30 天后 → 出票成功积分 100→99 → 重启自动登录 → 退出重登(同机)成功、异机拒。

- [ ] **Step 3: 提交(如改了契约)**:
```bash
git add wanda-ticket-1.0.0/tools/check-auth-gate-contract.mjs
git commit -m "test(client): 鉴权契约改账号模型"
```

---

## 备注
- 复用未改:客户端顶部积分展示(B5)、提交支付闸门(B6)、出票扣点接线 ticket.ts(B7)——因 `deductPoint(token, orderId)` 与 `canPay`/`remainingPoints`/`expireAt` 接口不变。
- 后续(SP3 后台):管理员建/禁账号、清 boundFingerprint 换绑、生成/停用充值卡、看流水、改配置。
</content>
