import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await prisma.pointLedger.deleteMany(); await prisma.device.deleteMany(); await prisma.card.deleteMany()
})

async function activate() {
  await prisma.card.create({ data: { code: 'C1', points: 100, validDays: 30 } })
  const res = await app.inject({ method: 'POST', url: '/auth/activate', payload: { cardCode: 'C1', fingerprint: 'fp1' } })
  return res.json().token as string
}

describe('POST /auth/heartbeat', () => {
  it('有效 token → 返回点数与到期', async () => {
    const token = await activate()
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(res.json().remainingPoints).toBe(100)
  })
  it('无 token → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat' })
    expect(res.statusCode).toBe(401)
  })
  it('设备封禁 → 401', async () => {
    const token = await activate()
    await prisma.device.updateMany({ data: { disabledAt: new Date() } })
    const res = await app.inject({ method: 'POST', url: '/auth/heartbeat', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(401)
  })
})
