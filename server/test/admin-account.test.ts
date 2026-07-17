import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await prisma.admin.deleteMany({ where: { username: { not: 'admin' } } }); await app.close() })
async function adminToken() {
  const r = await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })
  return r.json().token as string
}
describe('admin account', () => {
  it('创建新管理员并能登录', async () => {
    const t = await adminToken()
    const c = await app.inject({ method: 'POST', url: '/admin/admins', headers: { authorization: `Bearer ${t}` }, payload: { username: 'a2', password: 'p2' } })
    expect(c.json().ok).toBe(true)
    const login = await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'a2', password: 'p2' } })
    expect(login.json().ok).toBe(true)
  })
  it('重复用户名 → USERNAME_TAKEN', async () => {
    const t = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/admins', headers: { authorization: `Bearer ${t}` }, payload: { username: 'dup', password: 'p' } })
    const again = await app.inject({ method: 'POST', url: '/admin/admins', headers: { authorization: `Bearer ${t}` }, payload: { username: 'dup', password: 'p' } })
    expect(again.json()).toMatchObject({ ok: false, code: 'USERNAME_TAKEN' })
  })
})
