import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
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
