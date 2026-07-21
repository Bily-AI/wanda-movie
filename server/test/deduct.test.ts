import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { durationCard, tokenWithPoints } from './helpers.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const deduct = (token: string, orderId: string) =>
  app.inject({ method: 'POST', url: '/points/deduct', headers: { authorization: `Bearer ${token}` }, payload: { orderId } })

describe('POST /points/deduct', () => {
  it('点卡用户出票扣 1 点', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    expect((await deduct(token, 'O1')).json()).toMatchObject({ ok: true, remainingPoints: 99 })
  })
  it('同 orderId 幂等只扣一次', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    await deduct(token, 'O1')
    expect((await deduct(token, 'O1')).json().remainingPoints).toBe(99)
    expect(await prisma.pointLedger.count({ where: { orderId: 'O1' } })).toBe(1)
  })
  it('点数用完 → NO_POINTS', async () => {
    const token = await tokenWithPoints(app, 'u1', 1)
    expect((await deduct(token, 'O1')).json().remainingPoints).toBe(0)
    expect((await deduct(token, 'O2')).json()).toMatchObject({ ok: false, code: 'NO_POINTS' })
  })
  it('账号过期 → EXPIRED', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    await prisma.user.update({ where: { username: 'u1' }, data: { expireAt: new Date(Date.now() - 1000) } })
    expect((await deduct(token, 'O1')).json()).toMatchObject({ ok: false, code: 'EXPIRED' })
  })
  it('时长卡用户出票免点、不限次', async () => {
    const cardCode = await durationCard(30)
    const token = (await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1', cardCode } })).json().token
    for (const o of ['O1', 'O2', 'O3']) {
      expect((await deduct(token, o)).json()).toMatchObject({ ok: true, free: true, remainingPoints: 0 })
    }
    // 免点也记流水(delta=0),保证幂等
    expect(await prisma.pointLedger.count()).toBe(3)
  })
  it('缺 orderId → 400', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    const res = await app.inject({ method: 'POST', url: '/points/deduct', headers: { authorization: `Bearer ${token}` }, payload: {} })
    expect(res.statusCode).toBe(400)
  })
})
