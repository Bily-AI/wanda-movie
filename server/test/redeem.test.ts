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
