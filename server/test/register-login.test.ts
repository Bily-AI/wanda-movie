import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
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
