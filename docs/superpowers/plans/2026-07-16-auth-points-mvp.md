# 鉴权 + 出票成功扣1积分(MVP)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给现有 Electron 出票客户端加一套自有后端:卡密激活 + 机器绑定 + JWT 会话 + 心跳 + 出票成功幂等扣 1 积分,客户端加登录闸门与积分展示。

**Architecture:** 新建独立后端服务 `server/`(Fastify + Prisma + PostgreSQL),对外 3 个 REST 接口(`/auth/activate`、`/auth/heartbeat`、`/points/deduct`),JWT 鉴权、服务端为准。现有客户端 `wanda-ticket-1.0.0/` 增加:主进程机器指纹(IPC)、渲染层鉴权服务/Pinia store/登录闸门/顶部积分展示/提交支付余额闸门/出票成功调扣点。卡密用 seed 脚本生成(后台 UI 后续做)。

**Tech Stack:** 后端 Node 22 + TypeScript + Fastify 4 + Prisma 5(**开发 SQLite / 生产 PostgreSQL**)+ jsonwebtoken + vitest + supertest;客户端沿用 Electron 30 + Vue3 + Pinia + TS + axios,契约测试沿用 `tools/check-*.mjs`。

## Global Constraints

- 后端目录:仓库根 `server/`(与 `wanda-ticket-1.0.0/` 平级),独立 `package.json`。
- 扣点时机:**出票成功**(客户端 `finalizeCurrentOrder` 时),按 `orderId` 幂等,单次扣 `deductPerPayment`(默认 1)。**不是提交支付就扣**。
- 服务端为准:积分/到期/闸门策略以服务端为准,客户端只展示。
- 每卡绑 `maxDevicesPerCard`(默认 1)台机;心跳 `heartbeatSec`(默认 60);JWT 有效期 7 天;客户端持久化 token 自动登录。
- 卡密模型:点数卡 + 有效期(激活时 `remainingPoints=card.points`,`expireAt=now+card.validDays天`)。
- 统一响应壳:`{ ok: boolean, code?: string, msg?: string, ...data }`。
- 机器指纹:`sha256(hostname|platform|arch|首个非虚拟网卡MAC|cpus[0].model)`。
- 客户端后端地址:`AUTH_SERVER_BASE_URL` 常量(默认 `http://localhost:3000`,生产改为用户域名)。
- 数据库:**开发用 SQLite**(`file:./dev.db`,免 Docker);生产切 PostgreSQL(改 Prisma `provider` + `DATABASE_URL` 后重新 `prisma migrate`),业务代码不变。
- 其余子项目(完整功能计价、后台管理、反馈、热更新、安装包)**先不做**。

---

## 文件结构

**后端(新建 `server/`)**
- `server/package.json`、`server/tsconfig.json`、`server/.env`、`server/docker-compose.yml`(本地 PostgreSQL)
- `server/prisma/schema.prisma` — 数据模型(card/device/appConfig/pointLedger)
- `server/prisma/seed.ts` — 写入默认 `app_config`
- `server/src/db.ts` — Prisma client 单例
- `server/src/config.ts` — 读取 `app_config` 到内存(带默认)
- `server/src/jwt.ts` — 签发/校验 JWT
- `server/src/app.ts` — 组装 Fastify 实例(注册路由/限流),`buildApp()` 供测试复用
- `server/src/routes/auth.ts` — `/auth/activate`、`/auth/heartbeat`
- `server/src/routes/points.ts` — `/points/deduct`
- `server/src/server.ts` — 启动入口
- `server/scripts/gen-cards.ts` — 生成卡密 CLI
- `server/test/*.test.ts` — vitest + supertest

**客户端(改 `wanda-ticket-1.0.0/`)**
- `src/shared/ipc.ts` — 加 `MACHINE_FINGERPRINT` 通道(修改)
- `src/main/machineId.ts` — 机器指纹(新建)
- `src/main/index.ts` — 注册指纹 IPC(修改)
- `src/preload/index.ts` — 暴露 `getMachineFingerprint`(修改)
- `src/renderer/config/authServer.ts` — 后端地址常量(新建)
- `src/renderer/services/authApi.ts` — 调后端(activate/heartbeat/deduct)(新建)
- `src/renderer/stores/auth.ts` — 鉴权 Pinia store(新建)
- `src/renderer/views/LoginView.vue` — 卡密登录页(新建)
- `src/renderer/router/index.ts` — 加 `/login` 路由 + 全局守卫(修改)
- `src/renderer/App.vue` — 顶部积分/到期展示(修改)
- `src/renderer/views/TicketView.vue` — 提交支付余额闸门(修改)
- `src/renderer/stores/ticket.ts` — `finalizeCurrentOrder` 里调扣点(修改)
- `tools/check-auth-gate-contract.mjs` — 新契约(新建)+ `package.json` 注册(修改)

---

# Part A —— 后端 `server/`

### Task A1: 后端脚手架 + 健康检查 + 测试环境

**Files:**
- Create: `server/package.json`、`server/tsconfig.json`、`server/.env`、`server/.gitignore`、`server/src/app.ts`、`server/src/server.ts`、`server/test/health.test.ts`

> 开发用 SQLite,不需要 Docker。生产切 PostgreSQL 时再加 `docker-compose.yml` 或直连用户 PG。

**Interfaces:**
- Produces: `buildApp(): FastifyInstance`(异步组装,注册所有路由);健康检查 `GET /health` → `{ ok: true }`

- [ ] **Step 1: 初始化 package 与依赖**

`server/package.json`:
```json
{
  "name": "wanda-auth-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "gen:cards": "tsx scripts/gen-cards.ts"
  },
  "dependencies": {
    "@fastify/rate-limit": "^9.1.0",
    "@prisma/client": "^5.20.0",
    "fastify": "^4.28.1",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.14.0",
    "prisma": "^5.20.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.1.0"
  }
}
```
Run: `cd server && npm install`

- [ ] **Step 2: tsconfig / .env / .gitignore**

`server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "bundler",
    "outDir": "dist", "rootDir": ".", "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "resolveJsonModule": true
  },
  "include": ["src", "prisma", "scripts", "test"]
}
```
`server/.env`(开发用 SQLite 文件库):
```
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"
PORT=3000
```
`server/.gitignore`:
```
node_modules
dist
.env
*.db
*.db-journal
```
(生产切 PostgreSQL:把 `DATABASE_URL` 换成 `postgresql://…`,并按 Task A2 备注改 provider 后重新 migrate。)

- [ ] **Step 3: 写失败测试(健康检查)**

`server/test/health.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

const app = await buildApp()
afterAll(() => app.close())

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd server && npm test`
Expected: FAIL — 找不到 `../src/app.js`

- [ ] **Step 5: 实现 app.ts / server.ts**

`server/src/app.ts`:
```ts
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(rateLimit, { global: false })
  app.get('/health', async () => ({ ok: true }))
  return app
}
```
`server/src/server.ts`:
```ts
import { buildApp } from './app.js'

const app = await buildApp()
const port = Number(process.env.PORT ?? 3000)
await app.listen({ port, host: '0.0.0.0' })
console.log(`auth server listening on :${port}`)
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd server && npm test`
Expected: PASS(1 passed)

- [ ] **Step 7: 提交**

```bash
git add server/package.json server/tsconfig.json server/.gitignore server/docker-compose.yml server/src/app.ts server/src/server.ts server/test/health.test.ts
git commit -m "feat(server): Fastify 脚手架 + 健康检查"
```

---

### Task A2: Prisma schema + 迁移 + 默认配置 seed

**Files:**
- Create: `server/prisma/schema.prisma`、`server/prisma/seed.ts`、`server/src/db.ts`、`server/src/config.ts`、`server/test/config.test.ts`

**Interfaces:**
- Produces:
  - Prisma 模型 `Card{id,code,points,validDays,status,boundDeviceId,activatedAt,createdAt}`、`Device{id,fingerprint,cardId,remainingPoints,expireAt,lastSeenAt,disabledAt,createdAt}`、`AppConfig{key,value}`、`PointLedger{id,deviceId,delta,reason,orderId,balance,createdAt}`
  - `prisma`(PrismaClient 单例,来自 `src/db.ts`)
  - `loadConfig(): Promise<AppConfigValues>`,`AppConfigValues = { deductPerPayment:number; maxDevicesPerCard:number; heartbeatSec:number; blockWhenExpired:boolean; blockWhenNoPoints:boolean }`

- [ ] **Step 1: schema.prisma**

`server/prisma/schema.prisma`(开发 SQLite;生产改 `provider = "postgresql"` 后重新 migrate,模型不变):
```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "sqlite"; url = env("DATABASE_URL") }

model Card {
  id            Int       @id @default(autoincrement())
  code          String    @unique
  points        Int
  validDays     Int
  status        String    @default("unactivated") // unactivated | active | disabled
  boundDeviceId Int?
  activatedAt   DateTime?
  createdAt     DateTime  @default(now())
  devices       Device[]
}

model Device {
  id              Int       @id @default(autoincrement())
  fingerprint     String    @unique
  cardId          Int
  card            Card      @relation(fields: [cardId], references: [id])
  remainingPoints Int
  expireAt        DateTime
  lastSeenAt      DateTime  @default(now())
  disabledAt      DateTime?
  createdAt       DateTime  @default(now())
  ledger          PointLedger[]
}

model AppConfig {
  key   String @id
  value String
}

model PointLedger {
  id        Int      @id @default(autoincrement())
  deviceId  Int
  device    Device   @relation(fields: [deviceId], references: [id])
  delta     Int
  reason    String
  orderId   String   @unique
  balance   Int
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: 迁移**

Run: `cd server && npx prisma migrate dev --name init`
Expected: 生成 migration 并建表成功

- [ ] **Step 3: db.ts(单例)**

`server/src/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'
export const prisma = new PrismaClient()
```

- [ ] **Step 4: 写失败测试(配置默认值)**

`server/test/config.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('config', () => {
  it('缺省时返回默认配置', async () => {
    const cfg = await loadConfig()
    expect(cfg.deductPerPayment).toBe(1)
    expect(cfg.maxDevicesPerCard).toBe(1)
    expect(cfg.heartbeatSec).toBe(60)
    expect(cfg.blockWhenExpired).toBe(true)
    expect(cfg.blockWhenNoPoints).toBe(true)
  })
})
```

- [ ] **Step 5: 运行确认失败**

Run: `cd server && npm test config`
Expected: FAIL — 找不到 `../src/config.js`

- [ ] **Step 6: 实现 config.ts + seed.ts**

`server/src/config.ts`:
```ts
import { prisma } from './db.js'

export interface AppConfigValues {
  deductPerPayment: number
  maxDevicesPerCard: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}

const DEFAULTS: AppConfigValues = {
  deductPerPayment: 1,
  maxDevicesPerCard: 1,
  heartbeatSec: 60,
  blockWhenExpired: true,
  blockWhenNoPoints: true
}

export async function loadConfig(): Promise<AppConfigValues> {
  const rows = await prisma.appConfig.findMany()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const num = (k: keyof AppConfigValues) =>
    map.has(k) ? Number(map.get(k)) : (DEFAULTS[k] as number)
  const bool = (k: keyof AppConfigValues) =>
    map.has(k) ? map.get(k) === 'true' : (DEFAULTS[k] as boolean)
  return {
    deductPerPayment: num('deductPerPayment'),
    maxDevicesPerCard: num('maxDevicesPerCard'),
    heartbeatSec: num('heartbeatSec'),
    blockWhenExpired: bool('blockWhenExpired'),
    blockWhenNoPoints: bool('blockWhenNoPoints')
  }
}
```
`server/prisma/seed.ts`:
```ts
import { prisma } from '../src/db.js'

const defaults: Record<string, string> = {
  deductPerPayment: '1',
  maxDevicesPerCard: '1',
  heartbeatSec: '60',
  blockWhenExpired: 'true',
  blockWhenNoPoints: 'true'
}

for (const [key, value] of Object.entries(defaults)) {
  await prisma.appConfig.upsert({ where: { key }, update: {}, create: { key, value } })
}
console.log('seeded app_config')
await prisma.$disconnect()
```

- [ ] **Step 7: 运行确认通过**

Run: `cd server && npm test config`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add server/prisma server/src/db.ts server/src/config.ts server/test/config.test.ts
git commit -m "feat(server): Prisma 模型 + 配置层(默认值)"
```

---

### Task A3: 生成卡密 CLI

**Files:**
- Create: `server/scripts/gen-cards.ts`、`server/test/gen-cards.test.ts`

**Interfaces:**
- Consumes: `prisma`(A2)
- Produces: `generateCards(count:number, points:number, validDays:number): Promise<string[]>`(返回卡密码列表)

- [ ] **Step 1: 写失败测试**

`server/test/gen-cards.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateCards } from '../scripts/gen-cards.js'
import { prisma } from '../src/db.js'

describe('generateCards', () => {
  it('生成 3 张卡且落库', async () => {
    const codes = await generateCards(3, 100, 30)
    expect(codes).toHaveLength(3)
    expect(new Set(codes).size).toBe(3)
    const row = await prisma.card.findUnique({ where: { code: codes[0] } })
    expect(row?.points).toBe(100)
    expect(row?.validDays).toBe(30)
    expect(row?.status).toBe('unactivated')
    await prisma.card.deleteMany({ where: { code: { in: codes } } })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npm test gen-cards`
Expected: FAIL — 找不到模块

- [ ] **Step 3: 实现 gen-cards.ts**

`server/scripts/gen-cards.ts`:
```ts
import { randomBytes } from 'node:crypto'
import { prisma } from '../src/db.js'

function newCode(): string {
  return randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

export async function generateCards(count: number, points: number, validDays: number): Promise<string[]> {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = newCode()
    await prisma.card.create({ data: { code, points, validDays } })
    codes.push(code)
  }
  return codes
}

// CLI: tsx scripts/gen-cards.ts <count> <points> <validDays>
if (process.argv[1]?.endsWith('gen-cards.ts')) {
  const [count, points, days] = process.argv.slice(2).map(Number)
  const codes = await generateCards(count || 1, points || 100, days || 30)
  console.log(codes.join('\n'))
  await prisma.$disconnect()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npm test gen-cards`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/scripts/gen-cards.ts server/test/gen-cards.test.ts
git commit -m "feat(server): 生成卡密 CLI"
```

---

### Task A4: JWT 工具

**Files:**
- Create: `server/src/jwt.ts`、`server/test/jwt.test.ts`

**Interfaces:**
- Produces: `signToken(payload:{deviceId:number;cardId:number}): string`、`verifyToken(token:string): {deviceId:number;cardId:number} | null`

- [ ] **Step 1: 写失败测试**

`server/test/jwt.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from '../src/jwt.js'

describe('jwt', () => {
  it('签发并校验', () => {
    const t = signToken({ deviceId: 7, cardId: 3 })
    expect(verifyToken(t)).toMatchObject({ deviceId: 7, cardId: 3 })
  })
  it('无效 token 返回 null', () => {
    expect(verifyToken('garbage')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npm test jwt`
Expected: FAIL

- [ ] **Step 3: 实现 jwt.ts**

`server/src/jwt.ts`:
```ts
import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'

export function signToken(payload: { deviceId: number; cardId: number }): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): { deviceId: number; cardId: number } | null {
  try {
    const d = jwt.verify(token, SECRET) as { deviceId: number; cardId: number }
    return { deviceId: d.deviceId, cardId: d.cardId }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npm test jwt`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/src/jwt.ts server/test/jwt.test.ts
git commit -m "feat(server): JWT 签发/校验"
```

---

### Task A5: `/auth/activate` 卡密激活 + 机器绑定

**Files:**
- Create: `server/src/routes/auth.ts`、`server/test/activate.test.ts`
- Modify: `server/src/app.ts`(注册路由)

**Interfaces:**
- Consumes: `prisma`、`loadConfig`、`signToken`
- Produces: `POST /auth/activate` body `{cardCode, fingerprint}` → `{ok:true, token, remainingPoints, expireAt, config}` 或 `{ok:false, code}`(code∈`CARD_INVALID|CARD_DISABLED|CARD_BOUND_OTHER`)。`config = {deductPerPayment, heartbeatSec, blockWhenExpired, blockWhenNoPoints}`

- [ ] **Step 1: 写失败测试(四分支)**

`server/test/activate.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany()
  await prisma.device.deleteMany()
  await prisma.card.deleteMany()
})

async function post(body: unknown) {
  return app.inject({ method: 'POST', url: '/auth/activate', payload: body })
}

describe('POST /auth/activate', () => {
  it('无效卡 → CARD_INVALID', async () => {
    const res = await post({ cardCode: 'NOPE', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_INVALID' })
  })

  it('新激活 → 建设备、给点数与到期、返回 token', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.remainingPoints).toBe(100)
    expect(typeof body.token).toBe('string')
    expect(new Date(body.expireAt).getTime()).toBeGreaterThan(Date.now())
    const card = await prisma.card.findUnique({ where: { code: 'C1' } })
    expect(card?.status).toBe('active')
  })

  it('同机重登 → 放行', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    expect(res.json().ok).toBe(true)
  })

  it('异机激活 → CARD_BOUND_OTHER', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp2' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_BOUND_OTHER' })
  })

  it('停用卡 → CARD_DISABLED', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30, status: 'disabled' } })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_DISABLED' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npm test activate`
Expected: FAIL — 路由不存在

- [ ] **Step 3: 实现 routes/auth.ts(先只 activate)+ 注册**

`server/src/routes/auth.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { signToken } from '../jwt.js'

function clientConfig(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    deductPerPayment: cfg.deductPerPayment,
    heartbeatSec: cfg.heartbeatSec,
    blockWhenExpired: cfg.blockWhenExpired,
    blockWhenNoPoints: cfg.blockWhenNoPoints
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/activate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { cardCode, fingerprint } = (req.body ?? {}) as { cardCode?: string; fingerprint?: string }
    if (!cardCode || !fingerprint) return reply.send({ ok: false, code: 'BAD_REQUEST' })

    const cfg = await loadConfig()
    const card = await prisma.card.findUnique({ where: { code: cardCode }, include: { devices: true } })
    if (!card) return reply.send({ ok: false, code: 'CARD_INVALID' })
    if (card.status === 'disabled') return reply.send({ ok: false, code: 'CARD_DISABLED' })

    let device = card.devices.find((d) => d.fingerprint === fingerprint)
    if (!device) {
      if (card.status === 'active' && card.devices.length >= cfg.maxDevicesPerCard) {
        return reply.send({ ok: false, code: 'CARD_BOUND_OTHER' })
      }
      const expireAt = new Date(Date.now() + card.validDays * 86400_000)
      device = await prisma.device.create({
        data: { fingerprint, cardId: card.id, remainingPoints: card.points, expireAt }
      })
      await prisma.card.update({
        where: { id: card.id },
        data: { status: 'active', boundDeviceId: device.id, activatedAt: card.activatedAt ?? new Date() }
      })
    } else if (device.disabledAt) {
      return reply.send({ ok: false, code: 'DEVICE_DISABLED' })
    }

    const token = signToken({ deviceId: device.id, cardId: card.id })
    return reply.send({
      ok: true, token,
      remainingPoints: device.remainingPoints,
      expireAt: device.expireAt.toISOString(),
      config: clientConfig(cfg)
    })
  })
}
```
`server/src/app.ts`(加注册):
```ts
import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { authRoutes } from './routes/auth.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(rateLimit, { global: false })
  app.get('/health', async () => ({ ok: true }))
  await app.register(authRoutes)
  return app
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npm test activate`
Expected: PASS(5 passed)

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/auth.ts server/src/app.ts server/test/activate.test.ts
git commit -m "feat(server): /auth/activate 卡密激活 + 机器绑定"
```

---

### Task A6: `/auth/heartbeat` 心跳保活

**Files:**
- Modify: `server/src/routes/auth.ts`
- Create: `server/test/heartbeat.test.ts`

**Interfaces:**
- Consumes: `verifyToken`、`prisma`、`loadConfig`
- Produces: `POST /auth/heartbeat`(Header `Authorization: Bearer <token>`)→ `{ok:true, remainingPoints, expireAt, config}`;token 失效/设备封禁/卡停用 → HTTP 401 `{ok:false, code}`

- [ ] **Step 1: 写失败测试**

`server/test/heartbeat.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.device.deleteMany(); await prisma.card.deleteMany()
})

async function activate() {
  await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
  const res = await app.inject({ method: 'POST', url: '/auth/activate', payload: { cardCode: 'C1', fingerprint: 'fp1' } })
  return res.json().token as string
}

describe('POST /auth/heartbeat', () => {
  it('有效 token → 返回点数与到期', async () => {
    const token = await activate()
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json().remainingPoints).toBe(100)
  })
  it('无 token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat' })
    expect(res.statusCode).toBe(401)
  })
  it('设备封禁 → 401', async () => {
    const token = await activate()
    await prisma.device.updateMany({ data: { disabledAt: new Date() } })
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npm test heartbeat`
Expected: FAIL

- [ ] **Step 3: 加 heartbeat 到 routes/auth.ts**

在 `authRoutes` 内追加(`import { verifyToken } from '../jwt.js'` 加到文件顶部):
```ts
  app.post('/auth/heartbeat', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })

    const device = await prisma.device.findUnique({ where: { id: claim.deviceId }, include: { card: true } })
    if (!device || device.disabledAt) return reply.code(401).send({ ok: false, code: 'DEVICE_DISABLED' })
    if (device.card.status === 'disabled') return reply.code(401).send({ ok: false, code: 'CARD_DISABLED' })

    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    const cfg = await loadConfig()
    return reply.send({
      ok: true,
      remainingPoints: device.remainingPoints,
      expireAt: device.expireAt.toISOString(),
      config: clientConfig(cfg)
    })
  })
```

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npm test heartbeat`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/src/routes/auth.ts server/test/heartbeat.test.ts
git commit -m "feat(server): /auth/heartbeat 心跳保活"
```

---

### Task A7: `/points/deduct` 出票成功幂等扣点

**Files:**
- Create: `server/src/routes/points.ts`、`server/test/deduct.test.ts`
- Modify: `server/src/app.ts`(注册)

**Interfaces:**
- Consumes: `verifyToken`、`prisma`、`loadConfig`
- Produces: `POST /points/deduct`(Header token)body `{orderId}` → `{ok:true, remainingPoints}`;按 orderId 幂等;余额不足 → `{ok:false, code:'NO_POINTS'}`;过期 → `{ok:false, code:'EXPIRED'}`;未授权 → 401

- [ ] **Step 1: 写失败测试(幂等 + 余额 + 过期)**

`server/test/deduct.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.device.deleteMany(); await prisma.card.deleteMany()
})

async function activate(points = 100, validDays = 30) {
  await prisma.card.create({ data: { code: 'C1', points, validDays } })
  const res = await app.inject({ method: 'POST', url: '/auth/activate', payload: { cardCode: 'C1', fingerprint: 'fp1' } })
  return res.json().token as string
}
function deduct(token: string, orderId: string) {
  return app.inject({ method: 'POST', url: '/points/deduct', headers: { authorization: `Bearer ${token}` }, payload: { orderId } })
}

describe('POST /points/deduct', () => {
  it('出票成功扣 1 点', async () => {
    const token = await activate()
    const res = await deduct(token, 'ORDER-1')
    expect(res.json()).toMatchObject({ ok: true, remainingPoints: 99 })
  })
  it('同一 orderId 幂等,只扣一次', async () => {
    const token = await activate()
    await deduct(token, 'ORDER-1')
    const res = await deduct(token, 'ORDER-1')
    expect(res.json().remainingPoints).toBe(99)
  })
  it('余额为 0 → NO_POINTS', async () => {
    const token = await activate(0, 30)
    const res = await deduct(token, 'ORDER-1')
    expect(res.json()).toMatchObject({ ok: false, code: 'NO_POINTS' })
  })
  it('已过期 → EXPIRED', async () => {
    const token = await activate(100, 30)
    await prisma.device.updateMany({ data: { expireAt: new Date(Date.now() - 1000) } })
    const res = await deduct(token, 'ORDER-1')
    expect(res.json()).toMatchObject({ ok: false, code: 'EXPIRED' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npm test deduct`
Expected: FAIL

- [ ] **Step 3: 实现 routes/points.ts + 注册**

`server/src/routes/points.ts`:
```ts
import type { FastifyInstance } from 'fastify'
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
    if (!orderId) return reply.send({ ok: false, code: 'BAD_REQUEST' })

    const cfg = await loadConfig()

    // 幂等:同 orderId 已扣过则直接返回当前余额
    const existing = await prisma.pointLedger.findUnique({ where: { orderId } })
    const device0 = await prisma.device.findUnique({ where: { id: claim.deviceId } })
    if (!device0 || device0.disabledAt) return reply.code(401).send({ ok: false, code: 'DEVICE_DISABLED' })
    if (existing) return reply.send({ ok: true, remainingPoints: device0.remainingPoints })

    if (cfg.blockWhenExpired && device0.expireAt.getTime() <= Date.now()) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }
    if (cfg.blockWhenNoPoints && device0.remainingPoints < cfg.deductPerPayment) {
      return reply.send({ ok: false, code: 'NO_POINTS' })
    }

    // 事务:扣点 + 写流水(orderId 唯一约束兜底并发重复)
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const d = await tx.device.update({
          where: { id: device0.id },
          data: { remainingPoints: { decrement: cfg.deductPerPayment } }
        })
        await tx.pointLedger.create({
          data: { deviceId: d.id, delta: -cfg.deductPerPayment, reason: 'ticket', orderId, balance: d.remainingPoints }
        })
        return d
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
    } catch {
      const d = await prisma.device.findUnique({ where: { id: device0.id } })
      return reply.send({ ok: true, remainingPoints: d?.remainingPoints ?? device0.remainingPoints })
    }
  })
}
```
`server/src/app.ts`(加 `import { pointsRoutes } from './routes/points.js'` 和 `await app.register(pointsRoutes)`)。

- [ ] **Step 4: 运行确认通过**

Run: `cd server && npm test deduct`
Expected: PASS(4 passed)

- [ ] **Step 5: 全量测试 + 提交**

Run: `cd server && npm test`
Expected: 全部 PASS
```bash
git add server/src/routes/points.ts server/src/app.ts server/test/deduct.test.ts
git commit -m "feat(server): /points/deduct 出票成功幂等扣点"
```

---

# Part B —— 客户端改造 `wanda-ticket-1.0.0/`

> 客户端用 `npm run typecheck` + `npm run check:all` 作为验证闸门(沿用项目约定)。渲染层直接用 axios 调后端。

### Task B1: 主进程机器指纹 + IPC

**Files:**
- Create: `src/main/machineId.ts`
- Modify: `src/shared/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`

**Interfaces:**
- Produces: `window.wandaApp.getMachineFingerprint(): Promise<string>`(64 位 hex)

- [ ] **Step 1: machineId.ts**

`src/main/machineId.ts`:
```ts
import { createHash } from 'node:crypto'
import os from 'node:os'

function firstRealMac(): string {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') return info.mac
    }
  }
  return ''
}

export function getMachineFingerprint(): string {
  const cpu = os.cpus()[0]?.model ?? ''
  const raw = [os.hostname(), os.platform(), os.arch(), firstRealMac(), cpu].join('|')
  return createHash('sha256').update(raw).digest('hex')
}
```

- [ ] **Step 2: 加 IPC 通道常量**

`src/shared/ipc.ts` 的 `IPC_CHANNELS` 对象里加一行:
```ts
  MACHINE_FINGERPRINT: 'machine-fingerprint',
```
并在 `wandaApp` 接口类型(同文件 preload API 类型定义处)加:
```ts
  getMachineFingerprint: () => Promise<string>
```

- [ ] **Step 3: main 注册 handler**

`src/main/index.ts` 引入并在现有 IPC 注册区加:
```ts
import { getMachineFingerprint } from './machineId'
// ...在 registerXxxHandlers 附近:
ipcMain.handle(IPC_CHANNELS.MACHINE_FINGERPRINT, () => getMachineFingerprint())
```

- [ ] **Step 4: preload 暴露**

`src/preload/index.ts` 的 `wandaApp` 对象里加:
```ts
  getMachineFingerprint: () => ipcRenderer.invoke(IPC_CHANNELS.MACHINE_FINGERPRINT),
```

- [ ] **Step 5: typecheck + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck`
Expected: 无报错
```bash
git add wanda-ticket-1.0.0/src/main/machineId.ts wanda-ticket-1.0.0/src/shared/ipc.ts wanda-ticket-1.0.0/src/main/index.ts wanda-ticket-1.0.0/src/preload/index.ts
git commit -m "feat(client): 主进程机器指纹 + IPC"
```

---

### Task B2: 后端地址常量 + 鉴权 API 服务

**Files:**
- Create: `src/renderer/config/authServer.ts`、`src/renderer/services/authApi.ts`

**Interfaces:**
- Produces:
  - `AUTH_SERVER_BASE_URL: string`
  - `activate(cardCode:string, fingerprint:string): Promise<ActivateResult>`
  - `heartbeat(token:string): Promise<HeartbeatResult>`
  - `deductPoint(token:string, orderId:string): Promise<DeductResult>`
  - 类型:`AuthConfig={deductPerPayment;heartbeatSec;blockWhenExpired;blockWhenNoPoints}`;`ActivateResult={ok;token?;remainingPoints?;expireAt?;config?;code?}`;`HeartbeatResult={ok;remainingPoints?;expireAt?;config?;code?}`;`DeductResult={ok;remainingPoints?;code?}`

- [ ] **Step 1: authServer.ts**

`src/renderer/config/authServer.ts`:
```ts
// 生产改成用户后端域名,如 https://api.你的域名.com
export const AUTH_SERVER_BASE_URL = 'http://localhost:3000'
```

- [ ] **Step 2: authApi.ts**

`src/renderer/services/authApi.ts`:
```ts
import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface AuthConfig {
  deductPerPayment: number
  heartbeatSec: number
  blockWhenExpired: boolean
  blockWhenNoPoints: boolean
}
export interface ActivateResult {
  ok: boolean; token?: string; remainingPoints?: number; expireAt?: string; config?: AuthConfig; code?: string
}
export interface HeartbeatResult {
  ok: boolean; remainingPoints?: number; expireAt?: string; config?: AuthConfig; code?: string
}
export interface DeductResult { ok: boolean; remainingPoints?: number; code?: string }

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 10000 })

export async function activate(cardCode: string, fingerprint: string): Promise<ActivateResult> {
  const { data } = await http.post('/auth/activate', { cardCode, fingerprint })
  return data as ActivateResult
}
export async function heartbeat(token: string): Promise<HeartbeatResult> {
  const { data } = await http.post('/auth/heartbeat', {}, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })
  return data as HeartbeatResult
}
export async function deductPoint(token: string, orderId: string): Promise<DeductResult> {
  const { data } = await http.post('/points/deduct', { orderId }, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })
  return data as DeductResult
}
```

- [ ] **Step 3: typecheck + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck`
Expected: 无报错
```bash
git add wanda-ticket-1.0.0/src/renderer/config/authServer.ts wanda-ticket-1.0.0/src/renderer/services/authApi.ts
git commit -m "feat(client): 鉴权 API 服务"
```

---

### Task B3: 鉴权 Pinia store

**Files:**
- Create: `src/renderer/stores/auth.ts`

**Interfaces:**
- Consumes: `authApi`、`window.wandaApp.getMachineFingerprint`
- Produces: `useAuthStore` — state `{token:string; loggedIn:boolean; remainingPoints:number; expireAt:string; config:AuthConfig; loginError:string}`;actions `activateCard(code)`、`bootstrap()`(启动读本地 token 并心跳)、`startHeartbeat()`、`logout()`;getter `canPay`(点数足够且未过期)

- [ ] **Step 1: auth.ts**

`src/renderer/stores/auth.ts`:
```ts
import { defineStore } from 'pinia'
import { activate, heartbeat, type AuthConfig } from '@renderer/services/authApi'

const TOKEN_KEY = 'wanda_auth_token'
const DEFAULT_CONFIG: AuthConfig = { deductPerPayment: 1, heartbeatSec: 60, blockWhenExpired: true, blockWhenNoPoints: true }

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: '' as string,
    loggedIn: false,
    remainingPoints: 0,
    expireAt: '' as string,
    config: { ...DEFAULT_CONFIG } as AuthConfig,
    loginError: '' as string
  }),
  getters: {
    canPay(state): boolean {
      if (!state.loggedIn) return false
      if (state.config.blockWhenExpired && state.expireAt && Date.now() >= new Date(state.expireAt).getTime()) return false
      if (state.config.blockWhenNoPoints && state.remainingPoints < state.config.deductPerPayment) return false
      return true
    }
  },
  actions: {
    async activateCard(code: string) {
      this.loginError = ''
      const fingerprint = await window.wandaApp!.getMachineFingerprint()
      const res = await activate(code.trim(), fingerprint)
      if (!res.ok) {
        this.loginError = mapCode(res.code)
        return false
      }
      this.applyLogin(res.token!, res.remainingPoints!, res.expireAt!, res.config!)
      localStorage.setItem(TOKEN_KEY, res.token!)
      this.startHeartbeat()
      return true
    },
    async bootstrap() {
      const token = localStorage.getItem(TOKEN_KEY)
      if (!token) return
      const res = await heartbeat(token)
      if (res.ok) {
        this.applyLogin(token, res.remainingPoints!, res.expireAt!, res.config!)
        this.startHeartbeat()
      } else {
        this.logout()
      }
    },
    applyLogin(token: string, points: number, expireAt: string, config: AuthConfig) {
      this.token = token; this.loggedIn = true
      this.remainingPoints = points; this.expireAt = expireAt; this.config = config
    },
    startHeartbeat() {
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      const ms = Math.max(15, this.config.heartbeatSec) * 1000
      heartbeatTimer = setInterval(async () => {
        if (!this.token) return
        const res = await heartbeat(this.token)
        if (res.ok) {
          this.remainingPoints = res.remainingPoints!; this.expireAt = res.expireAt!; this.config = res.config!
        } else if (res.code) {
          this.logout()
        }
      }, ms)
    },
    logout() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
      this.token = ''; this.loggedIn = false; this.remainingPoints = 0; this.expireAt = ''
      localStorage.removeItem(TOKEN_KEY)
    }
  }
})

function mapCode(code?: string): string {
  switch (code) {
    case 'CARD_INVALID': return '卡密无效'
    case 'CARD_DISABLED': return '卡密已停用'
    case 'CARD_BOUND_OTHER': return '卡密已在其他设备激活'
    case 'DEVICE_DISABLED': return '设备已被禁用'
    default: return '激活失败,请检查网络'
  }
}
```

- [ ] **Step 2: typecheck + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck`
Expected: 无报错
```bash
git add wanda-ticket-1.0.0/src/renderer/stores/auth.ts
git commit -m "feat(client): 鉴权 Pinia store"
```

---

### Task B4: 登录页 + 路由守卫

**Files:**
- Create: `src/renderer/views/LoginView.vue`
- Modify: `src/renderer/router/index.ts`、`src/renderer/main.ts`(启动 bootstrap)

**Interfaces:**
- Consumes: `useAuthStore`
- Produces: `/login` 路由;全局前置守卫:未登录跳 `/login`;`main.ts` 挂载前 `bootstrap()`

- [ ] **Step 1: LoginView.vue**

`src/renderer/views/LoginView.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const code = ref('')
const submitting = ref(false)

async function handleActivate() {
  submitting.value = true
  const ok = await auth.activateCard(code.value)
  submitting.value = false
  if (ok) { ElMessage.success('激活成功'); router.replace('/ticket') }
  else ElMessage.error(auth.loginError)
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <h2>激活卡密</h2>
      <el-input v-model="code" placeholder="请输入卡密" @keyup.enter="handleActivate" />
      <p v-if="auth.loginError" class="login-err">{{ auth.loginError }}</p>
      <el-button type="primary" :loading="submitting" :disabled="!code.trim()" @click="handleActivate">激活</el-button>
    </div>
  </div>
</template>

<style scoped>
.login-page { height: 100vh; display: grid; place-items: center; background: var(--app-bg, #f3f5f9); }
.login-box { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(31,42,68,.12); }
.login-box h2 { margin: 0 0 4px; font-size: 18px; }
.login-err { margin: 0; color: #f56c6c; font-size: 13px; }
</style>
```

- [ ] **Step 2: 路由加 /login + 守卫**

`src/renderer/router/index.ts`:import 加 `import LoginView from '../views/LoginView.vue'` 和 `import { useAuthStore } from '../stores/auth'`;`routes` 数组加:
```ts
  { path: '/login', name: 'login', component: LoginView, meta: { title: '激活', public: true } },
```
`export default router` 之前加守卫:
```ts
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) return true
  if (!auth.loggedIn) return { path: '/login' }
  return true
})
```

- [ ] **Step 3: main.ts 启动 bootstrap**

`src/renderer/main.ts`:在 `app.use(router)` 之后、`app.mount` 之前(或 mount 之后)调用:
```ts
import { useAuthStore } from './stores/auth'
// mount 后:
useAuthStore().bootstrap()
```
(pinia 需已 `app.use(pinia)`;bootstrap 异步,不阻塞挂载;守卫在无 token 时把用户留在 /login。)

- [ ] **Step 4: typecheck + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck`
Expected: 无报错
```bash
git add wanda-ticket-1.0.0/src/renderer/views/LoginView.vue wanda-ticket-1.0.0/src/renderer/router/index.ts wanda-ticket-1.0.0/src/renderer/main.ts
git commit -m "feat(client): 登录页 + 路由守卫 + 启动自动登录"
```

---

### Task B5: 顶部积分/到期展示

**Files:**
- Modify: `src/renderer/App.vue`(替换「本地模式 / 鉴权未启用」状态区)

**Interfaces:**
- Consumes: `useAuthStore`

- [ ] **Step 1: 定位现状态区**

Run: `cd wanda-ticket-1.0.0 && grep -n "鉴权未启用\|本地模式" src/renderer/App.vue`
Expected: 找到那段状态 chip

- [ ] **Step 2: 替换为积分/到期**

在 `App.vue` `<script setup>` 引入 `import { useAuthStore } from '@renderer/stores/auth'` 与 `const auth = useAuthStore()`;把状态 chip 文案改为:
```vue
<span class="auth-chip">
  积分 {{ auth.remainingPoints }} · 到期 {{ auth.expireAt ? auth.expireAt.slice(0, 10) : '-' }}
</span>
```
(保留原 chip 的样式类;仅替换内容。)

- [ ] **Step 3: typecheck + check:all + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck && npm run check:all`
Expected: typecheck 无报错;若 `check-*` 因删掉「鉴权未启用」字样失败,按提示更新对应契约标记(把断言从「鉴权未启用」改为「auth-chip」)。
```bash
git add wanda-ticket-1.0.0/src/renderer/App.vue wanda-ticket-1.0.0/tools/*.mjs
git commit -m "feat(client): 顶部显示积分/到期"
```

---

### Task B6: 提交支付余额闸门

**Files:**
- Modify: `src/renderer/views/TicketView.vue`(提交支付按钮 disabled 条件)

**Interfaces:**
- Consumes: `useAuthStore().canPay`

- [ ] **Step 1: 定位提交支付按钮**

Run: `cd wanda-ticket-1.0.0 && grep -n "提交支付\|canSubmitCurrentOrderPayment" src/renderer/views/TicketView.vue`
Expected: 找到提交支付 el-button 的 `:disabled`

- [ ] **Step 2: 加 canPay 到 disabled 条件 + 提示**

`TicketView.vue` `<script setup>` 引入 `import { useAuthStore } from '@renderer/stores/auth'` 与 `const authStore = useAuthStore()`;提交支付按钮 `:disabled` 追加 `|| !authStore.canPay`;在按钮下方或 OCR 状态位加提示:
```vue
<span v-if="!authStore.canPay" class="pay-blocked-tip">
  {{ authStore.remainingPoints < authStore.config.deductPerPayment ? '积分不足,请充值' : '卡密已过期' }}
</span>
```

- [ ] **Step 3: typecheck + check:all + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck && npm run check:all`
Expected: 全绿(如触发 check 契约,按提示同步)
```bash
git add wanda-ticket-1.0.0/src/renderer/views/TicketView.vue wanda-ticket-1.0.0/tools/*.mjs
git commit -m "feat(client): 提交支付余额/过期闸门"
```

---

### Task B7: 出票成功调扣点

**Files:**
- Modify: `src/renderer/stores/ticket.ts`(`finalizeCurrentOrder` 里调扣点)

**Interfaces:**
- Consumes: `useAuthStore`、`deductPoint`
- Produces: 出票成功(拿到取票码)后按 `orderId` 幂等扣点,刷新本地积分

- [ ] **Step 1: 定位 finalizeCurrentOrder**

Run: `cd wanda-ticket-1.0.0 && grep -n "finalizeCurrentOrder(" src/renderer/stores/ticket.ts`
Expected: 找到 action 定义(约 1097 行)

- [ ] **Step 2: 在 finalize 时调扣点**

`ticket.ts` 顶部引入 `import { deductPoint } from '@renderer/services/authApi'` 和 `import { useAuthStore } from '@renderer/stores/auth'`。在 `finalizeCurrentOrder(message?: string)` 里,拿到 orderId 后追加(orderId 用 finalize 前的 currentOrder.orderId 快照,因为 finalize 会清 currentOrderId):
```ts
      // 出票成功 → 幂等扣点(orderId 幂等,失败不影响已出的票)
      const orderIdForDeduct = this.currentOrder?.orderId
      if (orderIdForDeduct) {
        const auth = useAuthStore()
        if (auth.token) {
          void deductPoint(auth.token, orderIdForDeduct).then((res) => {
            if (res.ok && typeof res.remainingPoints === 'number') {
              auth.remainingPoints = res.remainingPoints
            }
          })
        }
      }
```
(放在方法体内、`currentOrderId=''` 之前,确保 `this.currentOrder?.orderId` 仍可读。)

- [ ] **Step 3: typecheck + 提交**

Run: `cd wanda-ticket-1.0.0 && npm run typecheck`
Expected: 无报错
```bash
git add wanda-ticket-1.0.0/src/renderer/stores/ticket.ts
git commit -m "feat(client): 出票成功幂等扣点"
```

---

### Task B8: 客户端鉴权契约脚本

**Files:**
- Create: `tools/check-auth-gate-contract.mjs`
- Modify: `package.json`(注册 `check:auth-gate` 并加进 `check:all`)

**Interfaces:**
- Produces: 字符串级契约,锁定关键接线不被回退

- [ ] **Step 1: check-auth-gate-contract.mjs**

`wanda-ticket-1.0.0/tools/check-auth-gate-contract.mjs`:
```js
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')
const has = (file, src, text) => assert.ok(src.includes(text), `${file} should include ${text}`)

const router = read('src/renderer/router/index.ts')
has('router', router, "path: '/login'")
has('router', router, 'router.beforeEach')

const authStore = read('src/renderer/stores/auth.ts')
has('auth store', authStore, 'getMachineFingerprint()')
has('auth store', authStore, 'canPay')
has('auth store', authStore, 'startHeartbeat')

const ticket = read('src/renderer/stores/ticket.ts')
has('ticket store', ticket, 'deductPoint(')

const ticketView = read('src/renderer/views/TicketView.vue')
has('TicketView', ticketView, 'authStore.canPay')

console.log('鉴权闸门契约检查通过')
```

- [ ] **Step 2: 注册脚本**

`wanda-ticket-1.0.0/package.json`:`scripts` 加 `"check:auth-gate": "node tools/check-auth-gate-contract.mjs"`,并把它追加到 `check:all` 串联命令末尾。

- [ ] **Step 3: 运行确认通过**

Run: `cd wanda-ticket-1.0.0 && npm run check:auth-gate && npm run check:all`
Expected: 两者都 PASS

- [ ] **Step 4: 提交**

```bash
git add wanda-ticket-1.0.0/tools/check-auth-gate-contract.mjs wanda-ticket-1.0.0/package.json
git commit -m "test(client): 鉴权闸门契约"
```

---

### Task B9: 端到端手测 + 收尾

**Files:** 无(手动验证)

- [ ] **Step 1: 起后端**

Run: `cd server && npm run db:migrate && npm run db:seed`(SQLite 文件库,无需 Docker)

- [ ] **Step 2: 造一张卡**

Run: `cd server && npm run gen:cards -- 1 100 30`
记下输出的卡密。另开终端:`cd server && npm run dev`

- [ ] **Step 3: 起客户端,验证闸门**

Run: `cd wanda-ticket-1.0.0 && npm run dev`
预期:①启动进 `/login`;②输错卡密报「卡密无效」;③输对卡密 → 进购票页,顶部显示「积分 100 · 到期 …」;④换台机器(改指纹)激活同卡 → 报「卡密已在其他设备激活」;⑤积分为 0 时「提交支付」禁用并提示;⑥走完一次真实出票 → 顶部积分 100→99,后端 `point_ledger` 有一条 reason=ticket 记录;⑦重启客户端 → 自动登录(不再要卡密)。

- [ ] **Step 4: 全量回归 + 收尾提交(如有 check 调整)**

Run: `cd server && npm test` 、 `cd wanda-ticket-1.0.0 && npm run typecheck && npm run check:all`
Expected: 全绿

---

## 备注

- **部署(用户侧)**:后端部署到用户服务器(`npm run build && npm start`,配 PostgreSQL 与 `.env` 的 `JWT_SECRET`/`DATABASE_URL`),客户端 `AUTH_SERVER_BASE_URL` 改成用户域名(建议 HTTPS)。
- **后续**:后台管理 UI(SP3)接管发卡密/封禁/解绑/调点/改配置;完整功能计价(SP2-full);热更新(SP5);一键安装包(SP0)。
</content>
