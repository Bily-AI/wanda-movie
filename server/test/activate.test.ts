import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany()
  await prisma.device.deleteMany()
  await prisma.card.deleteMany()
})

async function post(body: unknown) {
  return app.inject({ method: 'POST', url: '/auth/activate', payload: body })
}

describe('POST /auth/activate', () => {
  it('无效卡 → CARD_INVALID', async () => {
    const res = await post({ cardCode: 'NOPE', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_INVALID' })
  })

  it('新激活 → 建设备、给点数与到期、返回 token', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.remainingPoints).toBe(100)
    expect(typeof body.token).toBe('string')
    expect(new Date(body.expireAt).getTime()).toBeGreaterThan(Date.now())
    const card = await prisma.card.findUnique({ where: { code: 'C1' } })
    expect(card?.status).toBe('active')
  })

  it('同机重登 → 放行', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    expect(res.json().ok).toBe(true)
  })

  it('异机激活 → CARD_BOUND_OTHER', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
    await post({ cardCode: 'C1', fingerprint: 'fp1' })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp2' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_BOUND_OTHER' })
  })

  it('停用卡 → CARD_DISABLED', async () => {
    await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30, status: 'disabled' } })
    const res = await post({ cardCode: 'C1', fingerprint: 'fp1' })
    expect(res.json()).toMatchObject({ ok: false, code: 'CARD_DISABLED' })
  })
})
