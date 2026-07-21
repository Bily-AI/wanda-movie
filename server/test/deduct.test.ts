import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
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
  it('新账号未充值 → EXPIRED 或 NO_POINTS', async () => {
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
