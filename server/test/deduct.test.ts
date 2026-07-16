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
