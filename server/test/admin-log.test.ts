import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { registerWithPoints } from './helpers.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await prisma.appConfig.deleteMany(); await app.close() })
beforeEach(async () => {
  await prisma.adminLog.deleteMany(); await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
async function adminToken() {
  const r = await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })
  return r.json().token as string
}
const A = (t: string) => ({ authorization: `Bearer ${t}` })

describe('admin log', () => {
  it('生成卡记一条 card.generate', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/cards/generate', headers: A(t), payload: { count: 1, kind: 'point', points: 100 } })
    const res = await app.inject({ method: 'GET', url: '/admin/logs', headers: A(t) })
    expect(res.json().items.some((l: { action: string }) => l.action === 'card.generate')).toBe(true)
  })
  it('禁用用户记一条 user.disable', async () => {
    const t = await adminToken()
    await registerWithPoints(app, 'u1')
    const u = await prisma.user.findFirst()
    await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/disable`, headers: A(t) })
    const res = await app.inject({ method: 'GET', url: '/admin/logs', headers: A(t) })
    expect(res.json().items.some((l: { action: string }) => l.action === 'user.disable')).toBe(true)
  })
})
