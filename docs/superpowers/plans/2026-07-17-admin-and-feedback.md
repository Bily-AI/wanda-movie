# 后台管理 + 用户反馈工单 实现计划(SP3 + SP4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。逐任务执行。
> 前置:账号模型后端(`server/`,Fastify+Prisma+SQLite,User/Card/AppConfig/PointLedger,JWT{userId})已完成。

**Goal:** 加一个网页后台(一个管理密码登录)管卡密/用户/流水/配置/反馈;客户端加反馈工单入口(提交问题/需求带图,查看管理员答复)。

**Tech Stack:** 后端复用 Fastify+Prisma;后台是**单文件 HTML(Vue3 CDN)**由 Fastify 托管;客户端 Vue3+Pinia。

## Global Constraints

- 后台登录:`.env` 的 `ADMIN_PASSWORD`(默认 `admin888`);`POST /admin/login {password}` → 管理 JWT(payload `{role:'admin'}`,1 天);管理接口用 `requireAdmin`(校验 Bearer 管理 JWT)。
- 反馈:类型 `type`∈`problem|feature`(问题/需求);`category` 预设「出票/支付/账号登录/界面/其它」;`images` 存 base64 dataURL 的 JSON 字符串;状态 `status`∈`pending|replied|fixed`。
- 反馈归属登录用户(userId,来自用户 JWT)。
- 统一响应壳 `{ok, code?, msg?, ...}`;管理接口未授权 401。
- 后台网页在 `GET /admin` 返回单文件 HTML;所有管理操作走 `/admin/*` REST。
- SQLite 开发;生产切 PostgreSQL 不变。

---

## Task A1: Feedback 表 + 迁移

**Files:** Modify `server/prisma/schema.prisma`;新增迁移。

- [ ] **Step 1:** 在 `schema.prisma` 追加 model(并给 User 加反关系 `feedbacks Feedback[]`):
```prisma
model Feedback {
  id         Int       @id @default(autoincrement())
  userId     Int
  user       User      @relation(fields: [userId], references: [id])
  type       String    // problem | feature
  category   String
  content    String
  contact    String?
  images     String    @default("[]") // JSON array of base64 dataURL
  status     String    @default("pending") // pending | replied | fixed
  reply      String?
  createdAt  DateTime  @default(now())
  repliedAt  DateTime?
}
```
在 `model User { ... }` 里加一行:`feedbacks Feedback[]`。

- [ ] **Step 2:** `cd server && npx prisma migrate dev --name feedback`(Windows 静默失败设 `RUST_LOG=trace`)。确认建表 + client 重新生成。全量 `npm test` 应仍 21 passed(未动现有逻辑)。

- [ ] **Step 3:** 提交:
```
git add -A server/prisma
git commit -m "feat(server): Feedback 表 + 迁移"
```

---

## Task A2: 管理员登录(密码)+ requireAdmin

**Files:** Modify `server/src/jwt.ts`、`server/.env`;Create `server/src/admin/guard.ts`、`server/src/routes/admin.ts`;Modify `server/src/app.ts`;Create `server/test/admin-login.test.ts`。

- [ ] **Step 1:** `.env` 追加一行:`ADMIN_PASSWORD="admin888"`。

- [ ] **Step 2:** `server/src/jwt.ts` 追加(保留现有 signToken/verifyToken):
```ts
export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '1d' })
}
export function verifyAdminToken(token: string): boolean {
  try {
    const d = jwt.verify(token, SECRET) as { role?: string }
    return d.role === 'admin'
  } catch {
    return false
  }
}
```

- [ ] **Step 3:** `server/src/admin/guard.ts`:
```ts
import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAdminToken } from '../jwt.js'

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !verifyAdminToken(token)) {
    reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    return false
  }
  return true
}
```

- [ ] **Step 4: 写失败测试** `server/test/admin-login.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })

describe('POST /admin/login', () => {
  it('密码对 → 发管理 token', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'admin888' } })
    expect(res.json().ok).toBe(true)
    expect(typeof res.json().token).toBe('string')
  })
  it('密码错 → BAD_PASSWORD', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'wrong' } })
    expect(res.json()).toMatchObject({ ok: false, code: 'BAD_PASSWORD' })
  })
})
```
`cd server && npm test admin-login` → 失败。

- [ ] **Step 5:** `server/src/routes/admin.ts`(本任务先只放 login;后续任务往这里加管理接口):
```ts
import type { FastifyInstance } from 'fastify'
import { signAdminToken } from '../jwt.js'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { password } = (req.body ?? {}) as { password?: string }
    if (!password || password !== (process.env.ADMIN_PASSWORD ?? 'admin888')) {
      return reply.send({ ok: false, code: 'BAD_PASSWORD' })
    }
    return reply.send({ ok: true, token: signAdminToken() })
  })
}
```
`server/src/app.ts` 加 `import { adminRoutes } from './routes/admin.js'` 与 `await app.register(adminRoutes)`。

- [ ] **Step 6:** `cd server && npm test admin-login` → 2 passed。提交:
```
git add server/src/jwt.ts server/src/admin/guard.ts server/src/routes/admin.ts server/src/app.ts server/test/admin-login.test.ts
git commit -m "feat(server): 管理员密码登录 + requireAdmin"
```
(`.env` 不提交。)

---

## Task A3: 客户端反馈接口(用户侧)

**Files:** Create `server/src/routes/feedback.ts`、`server/test/feedback.test.ts`;Modify `server/src/app.ts`。

**接口(用户 Bearer token)**:
- `POST /feedback {type, category, content, contact?, images?}` → `{ok:true, id}`;缺 type/category/content → BAD_REQUEST;未授权 401。
- `GET /feedback/mine` → `{ok:true, items:[{id,type,category,content,status,reply,createdAt,repliedAt}]}`(仅本人,倒序)。

- [ ] **Step 1: 写失败测试** `server/test/feedback.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await prisma.feedback.deleteMany(); await prisma.user.deleteMany() })
async function token() {
  const r = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  return r.json().token as string
}
const post = (t: string, b: unknown) => app.inject({ method: 'POST', url: '/feedback', headers: { authorization: `Bearer ${t}` }, payload: b })

describe('feedback', () => {
  it('提交反馈 → 成功', async () => {
    const t = await token()
    const res = await post(t, { type: 'problem', category: '出票', content: '出不了票', contact: 'qq123' })
    expect(res.json().ok).toBe(true)
  })
  it('缺内容 → BAD_REQUEST', async () => {
    const t = await token()
    expect((await post(t, { type: 'problem', category: '出票' })).json()).toMatchObject({ ok: false, code: 'BAD_REQUEST' })
  })
  it('未授权 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/feedback', payload: { type: 'problem', category: '出票', content: 'x' } })
    expect(res.statusCode).toBe(401)
  })
  it('我的反馈 → 只看自己的', async () => {
    const t = await token()
    await post(t, { type: 'feature', category: '界面', content: '想要暗色' })
    const res = await app.inject({ method: 'GET', url: '/feedback/mine', headers: { authorization: `Bearer ${t}` } })
    expect(res.json().items).toHaveLength(1)
    expect(res.json().items[0].content).toBe('想要暗色')
  })
})
```
`cd server && npm test feedback` → 失败。

- [ ] **Step 2:** `server/src/routes/feedback.ts`:
```ts
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

function userId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token ? (verifyToken(token)?.userId ?? null) : null
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/feedback', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { type, category, content, contact, images } = (req.body ?? {}) as {
      type?: string; category?: string; content?: string; contact?: string; images?: string[]
    }
    if (!type || !category || !content) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const fb = await prisma.feedback.create({
      data: { userId: uid, type, category, content, contact: contact ?? null, images: JSON.stringify(images ?? []) }
    })
    return reply.send({ ok: true, id: fb.id })
  })

  app.get('/feedback/mine', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const rows = await prisma.feedback.findMany({ where: { userId: uid }, orderBy: { id: 'desc' } })
    return reply.send({
      ok: true,
      items: rows.map((r) => ({
        id: r.id, type: r.type, category: r.category, content: r.content,
        status: r.status, reply: r.reply, createdAt: r.createdAt.toISOString(),
        repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null
      }))
    })
  })
}
```
`server/src/app.ts` 加 `import { feedbackRoutes } from './routes/feedback.js'` 与 `await app.register(feedbackRoutes)`。

- [ ] **Step 3:** `cd server && npm test feedback` → 4 passed。提交:
```
git add server/src/routes/feedback.ts server/src/app.ts server/test/feedback.test.ts
git commit -m "feat(server): 用户反馈提交/查询接口"
```

---

## Task A4: 管理接口 — 用户/卡密/流水/配置/反馈

**Files:** Modify `server/src/routes/admin.ts`;Create `server/test/admin-manage.test.ts`。

所有接口需 `requireAdmin`(在 handler 开头 `if (!requireAdmin(req, reply)) return`)。

**接口**:
- `GET /admin/users` → `{ok, items:[{id,username,remainingPoints,expireAt,boundFingerprint,disabledAt,createdAt}]}`
- `POST /admin/users/:id/disable` / `POST /admin/users/:id/enable` → `{ok}`(设/清 disabledAt)
- `POST /admin/users/:id/adjust {delta}` → `{ok, remainingPoints}`(积分 += delta,写 point_ledger reason='admin')
- `POST /admin/users/:id/unbind` → `{ok}`(boundFingerprint=null,换机)
- `GET /admin/cards` → `{ok, items:[{id,code,points,validDays,status,usedByUserId,usedAt,createdAt}]}`
- `POST /admin/cards/generate {count,points,validDays}` → `{ok, codes:string[]}`(复用 `generateCards`)
- `POST /admin/cards/:id/disable` → `{ok}`(status='disabled',仅 unused 可停)
- `GET /admin/ledger` → `{ok, items:[{id,userId,delta,reason,orderId,balance,createdAt}]}`(倒序,取最近 200)
- `GET /admin/config` → `{ok, items:[{key,value}]}`;`POST /admin/config {key,value}` → `{ok}`(upsert)

- [ ] **Step 1: 写失败测试** `server/test/admin-manage.test.ts`(覆盖:需管理 token、生成卡、列用户、调积分、禁用/启用、改配置)。示例:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany() })
async function adminToken() {
  const r = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'admin888' } })
  return r.json().token as string
}
const A = (t: string) => ({ authorization: `Bearer ${t}` })

describe('admin manage', () => {
  it('无管理 token → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/users' })).statusCode).toBe(401)
  })
  it('生成卡 + 列卡', async () => {
    const t = await adminToken()
    const gen = await app.inject({ method: 'POST', url: '/admin/cards/generate', headers: A(t), payload: { count: 2, points: 100, validDays: 30 } })
    expect(gen.json().codes).toHaveLength(2)
    const list = await app.inject({ method: 'GET', url: '/admin/cards', headers: A(t) })
    expect(list.json().items.length).toBe(2)
  })
  it('调积分写流水', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
    const u = await prisma.user.findFirst()
    const res = await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/adjust`, headers: A(t), payload: { delta: 50 } })
    expect(res.json().remainingPoints).toBe(50)
  })
  it('禁用启用', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
    const u = await prisma.user.findFirst()
    await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/disable`, headers: A(t) })
    expect((await prisma.user.findUnique({ where: { id: u!.id } }))?.disabledAt).not.toBeNull()
    await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/enable`, headers: A(t) })
    expect((await prisma.user.findUnique({ where: { id: u!.id } }))?.disabledAt).toBeNull()
  })
  it('改配置', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/config', headers: A(t), payload: { key: 'deductPerPayment', value: '2' } })
    const res = await app.inject({ method: 'GET', url: '/admin/config', headers: A(t) })
    expect(res.json().items.find((i: { key: string }) => i.key === 'deductPerPayment').value).toBe('2')
  })
})
```
`cd server && npm test admin-manage` → 失败。

- [ ] **Step 2:** 在 `server/src/routes/admin.ts` 的 `adminRoutes` 里,login 之后追加以上所有接口。用 `import { requireAdmin } from '../admin/guard.js'`、`import { prisma } from '../db.js'`、`import { generateCards } from '../../scripts/gen-cards.js'`。每个 handler 首行 `if (!requireAdmin(req, reply)) return`。adjust 用 `prisma.$transaction` 更新 user 并写 `pointLedger`(reason='admin',orderId 用 `'admin-'+Date 无法用,改用唯一串:`admin-${userId}-${随自增}`——用 `crypto.randomUUID()` 作 orderId 保证唯一)。unbind 设 boundFingerprint=null。cards/generate 复用 `generateCards(count,points,validDays)`。config 用 `prisma.appConfig.upsert`。
> 注意:`generateCards` 里含「若以 gen-cards.ts 直接运行则跑 CLI」的判断,import 它不会触发 CLI(argv 判断),放心复用。

- [ ] **Step 3:** `cd server && npm test admin-manage` → 全绿。提交:
```
git add server/src/routes/admin.ts server/test/admin-manage.test.ts
git commit -m "feat(server): 管理接口 用户/卡密/流水/配置"
```

---

## Task A5: 管理接口 — 反馈列表/答复

**Files:** Modify `server/src/routes/admin.ts`;Create `server/test/admin-feedback.test.ts`。

**接口(requireAdmin)**:
- `GET /admin/feedback` → `{ok, items:[{id,username,type,category,content,contact,images,status,reply,createdAt,repliedAt}]}`(倒序;images 解析回数组)
- `POST /admin/feedback/:id/reply {reply, status}` → `{ok}`(status∈replied|fixed;设 reply+status+repliedAt)

- [ ] **Step 1: 写失败测试** `server/test/admin-feedback.test.ts`(注册用户→提交反馈→管理列出→答复→状态变)。`cd server && npm test admin-feedback` → 失败。
- [ ] **Step 2:** 在 `admin.ts` 追加两个接口。GET 用 `prisma.feedback.findMany({ include:{ user:true }, orderBy:{id:'desc'} })`,map 出 username 与 `JSON.parse(images)`。reply 用 `prisma.feedback.update`。
- [ ] **Step 3:** `cd server && npm test`(全量,应 21 + admin-login 2 + feedback 4 + admin-manage 5 + admin-feedback ≈ **34+**)。提交:
```
git add server/src/routes/admin.ts server/test/admin-feedback.test.ts
git commit -m "feat(server): 管理接口 反馈列表/答复"
```

---

## Task A6: 托管后台网页 /admin(单文件 Vue3 CDN)

**Files:** Create `server/public/admin.html`;Modify `server/src/app.ts`(加静态托管 + `GET /admin`)。

- [ ] **Step 1:** 装静态插件:`cd server && npm install @fastify/static`。
- [ ] **Step 2:** `server/src/app.ts` 注册静态并加 /admin 路由:
```ts
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
// buildApp 内,注册路由前后均可:
await app.register(fastifyStatic, { root: join(__dirname, '../public'), prefix: '/static/' })
app.get('/admin', async (_req, reply) => reply.type('text/html').sendFile('admin.html'))
```
(`sendFile` 由 @fastify/static 提供,root 指 public;确认 `admin.html` 在 `server/public/`。若 sendFile 找不到,改 root 到 public 并用 `reply.sendFile('admin.html')`。)
- [ ] **Step 3:** 建 `server/public/admin.html` —— **单文件后台**(用 Vue 3 CDN `https://unpkg.com/vue@3/dist/vue.global.js` + 原生 fetch,不依赖构建)。要求:
  - 顶部未登录时显示**密码登录框**(POST /admin/login,存 token 到内存变量,后续所有请求带 `Authorization: Bearer`)。
  - 登录后显示 5 个 Tab:**卡密 / 用户 / 流水 / 配置 / 反馈**。
  - **卡密**:表单(数量/积分/天数)→ 生成(POST /admin/cards/generate,把返回 codes 显示出来可复制)+ 表格列出(GET /admin/cards:code/积分/天数/状态/使用者/使用时间)+ 每行「停用」(POST /admin/cards/:id/disable,仅 unused)。
  - **用户**:表格(GET /admin/users:用户名/积分/到期/绑定机器/状态/注册时间)+ 每行操作:禁用·启用、调积分(输入 delta 调 POST adjust)、清绑定(POST unbind 换机)。
  - **流水**:表格(GET /admin/ledger:用户id/±积分/原因/订单号/结余/时间)。
  - **配置**:GET /admin/config 列出 key/value,每行可编辑 value → 保存(POST /admin/config)。
  - **反馈**:表格(GET /admin/feedback:用户名/类型(问题/需求)/分类/内容/图片(缩略图,点开大图)/联系方式/状态/时间/已有答复)+ 每行「答复」(填回复内容 + 选状态 已回复/已修复 → POST reply)。
  - 简洁样式即可(内联 CSS),中文界面。所有 fetch 失败给个 alert 提示。
- [ ] **Step 4: 手测**:重启后端(`npm run dev`),浏览器开 `http://localhost:3000/admin` → 输密码 `admin888` → 各 Tab 能用。提交:
```
git add server/public/admin.html server/src/app.ts server/package.json server/package-lock.json
git commit -m "feat(server): 托管后台网页 /admin(卡密/用户/流水/配置/反馈)"
```

---

## Task C1: 客户端反馈入口(提交 + 我的反馈)

**Files:** Create `wanda-ticket-1.0.0/src/renderer/services/feedbackApi.ts`、`src/renderer/views/FeedbackView.vue`;Modify `src/renderer/router/index.ts`(加 /feedback 路由)、`src/renderer/App.vue`(导航加「反馈」项)。

- [ ] **Step 1:** `feedbackApi.ts`:用 authApi 的 baseURL 与用户 token 调 `POST /feedback`、`GET /feedback/mine`。函数:`submitFeedback(token, {type,category,content,contact,images})`、`myFeedback(token)`。类型含 `FeedbackItem`。
- [ ] **Step 2:** `FeedbackView.vue`:两块——
  - **提交**:类型单选(问题/需求)、分类下拉(出票/支付/账号登录/界面/其它)、内容 textarea、联系方式 input、图片上传(`<input type=file multiple accept=image/*>`,读成 base64 dataURL 数组,最多 3 张,给缩略图预览)、提交按钮 → `submitFeedback(useAuthStore().token, ...)` → 成功 ElMessage + 清空 + 刷新我的反馈。
  - **我的反馈**:`myFeedback` 列表,每条显示类型/分类/内容/状态(待处理/已回复/已修复)/管理员答复(有则显示)。
- [ ] **Step 3:** 路由加 `{ path: '/feedback', name: 'feedback', component: FeedbackView, meta: { title: '反馈' } }`;App.vue `navItems` 加 `{ path: '/feedback', label: '反馈', icon: ChatDotRound }`(从 `@element-plus/icons-vue` 引入 `ChatDotRound`)。
- [ ] **Step 4:** `cd wanda-ticket-1.0.0 && npm run typecheck && npm run check:all` 全绿(check-renderer 若枚举导航项可能需加 /feedback,按提示更新)。提交:
```
git add wanda-ticket-1.0.0/src/renderer/services/feedbackApi.ts wanda-ticket-1.0.0/src/renderer/views/FeedbackView.vue wanda-ticket-1.0.0/src/renderer/router/index.ts wanda-ticket-1.0.0/src/renderer/App.vue wanda-ticket-1.0.0/tools
git commit -m "feat(client): 反馈入口(提交问题/需求带图 + 我的反馈看答复)"
```

---

## 备注
- 后台登录是单密码(`.env` ADMIN_PASSWORD),生产务必改强密码。
- 反馈图片 base64 存 DB(MVP);量大后改对象存储。
- 后台网页 Vue CDN 需能访问外网;离线部署可把 vue.global.js 下到 public/ 本地引用。
</content>
