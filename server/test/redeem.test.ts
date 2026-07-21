import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { pointCard, durationCard, tokenWithPoints } from './helpers.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const redeem = (token: string, cardCode: string) =>
  app.inject({ method: 'POST', url: '/cards/redeem', headers: { authorization: `Bearer ${token}` }, payload: { cardCode } })

describe('POST /cards/redeem', () => {
  it('充点卡 → 积分累加、账号到期不变、卡标记 used', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)   // 注册已给 100 分 + 账号到期 E
    const before = (await prisma.user.findFirst({ where: { username: 'u1' } }))!.expireAt!.getTime()
    const cardCode = await pointCard(50)
    const b = (await redeem(token, cardCode)).json()
    expect(b.ok).toBe(true)
    expect(b.remainingPoints).toBe(150)
    const after = (await prisma.user.findFirst({ where: { username: 'u1' } }))!.expireAt!.getTime()
    expect(after).toBe(before)                            // 点卡不改账号到期
    expect((await prisma.card.findUnique({ where: { code: cardCode } }))?.status).toBe('used')
  })
  it('充时长卡 → 订阅到期 + 套餐名,积分不变', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    const cardCode = await durationCard(90)
    const b = (await redeem(token, cardCode)).json()
    expect(b.ok).toBe(true)
    expect(b.remainingPoints).toBe(100)
    expect(b.subscriptionUntil).not.toBeNull()
    expect(b.plan).toBe('包季')
  })
  it('卡不存在 → CARD_INVALID', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    expect((await redeem(token, 'NOPE')).json()).toMatchObject({ ok: false, code: 'CARD_INVALID' })
  })
  it('已用卡 → CARD_USED', async () => {
    const token = await tokenWithPoints(app, 'u1', 100)
    const cardCode = await pointCard(50)
    await redeem(token, cardCode)
    expect((await redeem(token, cardCode)).json()).toMatchObject({ ok: false, code: 'CARD_USED' })
  })
})
