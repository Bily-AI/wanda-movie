import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await prisma.feedback.deleteMany(); await prisma.user.deleteMany() })
async function userToken() {
  const r = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  return r.json().token as string
}
async function adminToken() {
  const r = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'admin888' } })
  return r.json().token as string
}
const A = (t: string) => ({ authorization: `Bearer ${t}` })

describe('admin feedback', () => {
  it('无管理 token → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/feedback' })).statusCode).toBe(401)
  })
  it('列出反馈(带用户名、图片解析成数组)', async () => {
    const ut = await userToken()
    await app.inject({ method: 'POST', url: '/feedback', headers: A(ut), payload: { type: 'problem', category: '出票', content: '出不了票', images: ['data:img1'] } })
    const at = await adminToken()
    const res = await app.inject({ method: 'GET', url: '/admin/feedback', headers: A(at) })
    const item = res.json().items[0]
    expect(item.username).toBe('u1')
    expect(item.content).toBe('出不了票')
    expect(Array.isArray(item.images)).toBe(true)
    expect(item.status).toBe('pending')
  })
  it('答复 → 状态与回复更新', async () => {
    const ut = await userToken()
    const post = await app.inject({ method: 'POST', url: '/feedback', headers: A(ut), payload: { type: 'problem', category: '出票', content: 'x' } })
    const id = post.json().id
    const at = await adminToken()
    await app.inject({ method: 'POST', url: `/admin/feedback/${id}/reply`, headers: A(at), payload: { reply: '已修复', status: 'fixed' } })
    const fb = await prisma.feedback.findUnique({ where: { id } })
    expect(fb?.status).toBe('fixed')
    expect(fb?.reply).toBe('已修复')
    expect(fb?.repliedAt).not.toBeNull()
  })
  it('非法 status → 400', async () => {
    const ut = await userToken()
    const post = await app.inject({ method: 'POST', url: '/feedback', headers: A(ut), payload: { type: 'problem', category: '出票', content: 'x' } })
    const at = await adminToken()
    const res = await app.inject({ method: 'POST', url: `/admin/feedback/${post.json().id}/reply`, headers: A(at), payload: { reply: 'hi', status: 'nonsense' } })
    expect(res.statusCode).toBe(400)
  })
})
