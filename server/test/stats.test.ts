import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { tokenWithPoints } from './helpers.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const H = (t: string) => ({ authorization: `Bearer ${t}` })

describe('储值卡统计上报', () => {
  it('上报快照 → 覆盖 total/disabled', async () => {
    const t = await tokenWithPoints(app, 'u1', 100)
    await app.inject({ method: 'POST', url: '/stats/stored-cards', headers: H(t), payload: { total: 5, disabled: 2 } })
    const u = await prisma.user.findFirst({ where: { username: 'u1' } })
    expect(u?.storedCardTotal).toBe(5)
    expect(u?.storedCardDisabled).toBe(2)
    // 再上报一次覆盖
    await app.inject({ method: 'POST', url: '/stats/stored-cards', headers: H(t), payload: { total: 3, disabled: 0 } })
    const u2 = await prisma.user.findFirst({ where: { username: 'u1' } })
    expect(u2?.storedCardTotal).toBe(3)
    expect(u2?.storedCardDisabled).toBe(0)
  })
  it('购买事件 → 累计 +1', async () => {
    const t = await tokenWithPoints(app, 'u1', 100)
    expect((await app.inject({ method: 'POST', url: '/stats/stored-card-purchase', headers: H(t) })).json().storedCardPurchased).toBe(1)
    expect((await app.inject({ method: 'POST', url: '/stats/stored-card-purchase', headers: H(t) })).json().storedCardPurchased).toBe(2)
  })
  it('负数/非法值 → 归 0', async () => {
    const t = await tokenWithPoints(app, 'u1', 100)
    await app.inject({ method: 'POST', url: '/stats/stored-cards', headers: H(t), payload: { total: -5, disabled: 'x' } })
    const u = await prisma.user.findFirst({ where: { username: 'u1' } })
    expect(u?.storedCardTotal).toBe(0)
    expect(u?.storedCardDisabled).toBe(0)
  })
  it('未授权 → 401', async () => {
    expect((await app.inject({ method: 'POST', url: '/stats/stored-cards', payload: { total: 1 } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/stats/stored-card-purchase' })).statusCode).toBe(401)
  })
  it('后台用户列表带储值卡统计', async () => {
    const t = await tokenWithPoints(app, 'u1', 100)
    await app.inject({ method: 'POST', url: '/stats/stored-cards', headers: H(t), payload: { total: 7, disabled: 1 } })
    await app.inject({ method: 'POST', url: '/stats/stored-card-purchase', headers: H(t) })
    const at = (await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })).json().token
    const item = (await app.inject({ method: 'GET', url: '/admin/users', headers: H(at) })).json().items.find((u: { username: string }) => u.username === 'u1')
    expect(item).toMatchObject({ storedCardTotal: 7, storedCardDisabled: 1, storedCardPurchased: 1 })
  })
})
