import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { pointCard, durationCard, registerWithPoints } from './helpers.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const reg = (b: unknown) => app.inject({ method: 'POST', url: '/auth/register', payload: b })
const login = (b: unknown) => app.inject({ method: 'POST', url: '/auth/login', payload: b })

describe('register/login', () => {
  it('点卡注册成功 → 加点数、账号+365天、绑机、发 token', async () => {
    const cardCode = await pointCard(100)
    const res = await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1', cardCode })
    const b = res.json()
    expect(b.ok).toBe(true)
    expect(typeof b.token).toBe('string')
    expect(b.remainingPoints).toBe(100)
    expect(b.expireAt).not.toBeNull()      // 点卡注册 → 账号 1 年有效期
    expect(b.subscriptionUntil).toBeNull() // 点卡无订阅
    expect(b.config.deductPerPayment).toBe(1)
  })
  it('时长卡注册 → 订阅到期 + 套餐名', async () => {
    const cardCode = await durationCard(30)
    const b = (await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1', cardCode })).json()
    expect(b.ok).toBe(true)
    expect(b.remainingPoints).toBe(0)
    expect(b.subscriptionUntil).not.toBeNull()
    expect(b.plan).toBe('包月')
  })
  it('无卡密注册 → CARD_REQUIRED', async () => {
    const res = await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_REQUIRED' })
  })
  it('无效卡密注册 → CARD_INVALID,且不建号', async () => {
    const res = await reg({ username: 'u1', password: 'p1', fingerprint: 'fp1', cardCode: 'NOPE' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_INVALID' })
    expect(await prisma.user.findUnique({ where: { username: 'u1' } })).toBeNull()
  })
  it('用户名重复 → USERNAME_TAKEN', async () => {
    await registerWithPoints(app, 'u1')
    const cardCode = await pointCard(100)
    const res = await reg({ username: 'u1', password: 'p2', fingerprint: 'fp1', cardCode })
    expect(res.json()).toMatchObject({ ok: false, code: 'USERNAME_TAKEN' })
  })
  it('登录成功(同机)', async () => {
    await registerWithPoints(app, 'u1')
    const res = await login({ username: 'u1', password: 'p1', fingerprint: 'fp1' })
    expect(res.json().ok).toBe(true)
  })
  it('密码错 → BAD_LOGIN', async () => {
    await registerWithPoints(app, 'u1')
    const res = await login({ username: 'u1', password: 'wrong', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'BAD_LOGIN' })
  })
  it('异机登录 → MACHINE_BOUND_OTHER', async () => {
    await registerWithPoints(app, 'u1')
    const res = await login({ username: 'u1', password: 'p1', fingerprint: 'fp2' })
    expect(res.json()).toMatchObject({ ok: false, code: 'MACHINE_BOUND_OTHER' })
  })
})
