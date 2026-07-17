import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
// 本文件的「改配置」用例会写 app_config,测试结束清掉,避免污染其它读配置的测试
afterAll(async () => { await prisma.appConfig.deleteMany(); await app.close() })
beforeEach(async () => { await prisma.appConfig.deleteMany(); await prisma.feedback.deleteMany(); await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany() })
async function adminToken() {
  const r = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'admin888' } })
  return r.json().token as string
}
const A = (t: string) => ({ authorization: `Bearer ${t}` })

describe('admin manage', () => {
  it('无管理 token → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/users' })).statusCode).toBe(401)
  })
  it('生成卡 + 列卡', async () => {
    const t = await adminToken()
    const gen = await app.inject({ method: 'POST', url: '/admin/cards/generate', headers: A(t), payload: { count: 2, points: 100, validDays: 30 } })
    expect(gen.json().codes).toHaveLength(2)
    const list = await app.inject({ method: 'GET', url: '/admin/cards', headers: A(t) })
    expect(list.json().items.length).toBe(2)
  })
  it('调积分写流水', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
    const u = await prisma.user.findFirst()
    const res = await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/adjust`, headers: A(t), payload: { delta: 50 } })
    expect(res.json().remainingPoints).toBe(50)
  })
  it('禁用启用', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
    const u = await prisma.user.findFirst()
    await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/disable`, headers: A(t) })
    expect((await prisma.user.findUnique({ where: { id: u!.id } }))?.disabledAt).not.toBeNull()
    await app.inject({ method: 'POST', url: `/admin/users/${u!.id}/enable`, headers: A(t) })
    expect((await prisma.user.findUnique({ where: { id: u!.id } }))?.disabledAt).toBeNull()
  })
  it('改配置', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/config', headers: A(t), payload: { key: 'deductPerPayment', value: '2' } })
    const res = await app.inject({ method: 'GET', url: '/admin/config', headers: A(t) })
    expect(res.json().items.find((i: { key: string }) => i.key === 'deductPerPayment').value).toBe('2')
  })
})
