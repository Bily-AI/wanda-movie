import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await prisma.feedback.deleteMany(); await prisma.user.deleteMany() })
async function token() {
  const r = await app.inject({ method: 'POST', url: '/auth/register', payload: { username: 'u1', password: 'p1', fingerprint: 'fp1' } })
  return r.json().token as string
}
const post = (t: string, b: unknown) => app.inject({ method: 'POST', url: '/feedback', headers: { authorization: `Bearer ${t}` }, payload: b })

describe('feedback', () => {
  it('提交反馈 → 成功', async () => {
    const t = await token()
    const res = await post(t, { type: 'problem', category: '出票', content: '出不了票', contact: 'qq123' })
    expect(res.json().ok).toBe(true)
  })
  it('缺内容 → BAD_REQUEST', async () => {
    const t = await token()
    expect((await post(t, { type: 'problem', category: '出票' })).json()).toMatchObject({ ok: false, code: 'BAD_REQUEST' })
  })
  it('未授权 → 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/feedback', payload: { type: 'problem', category: '出票', content: 'x' } })
    expect(res.statusCode).toBe(401)
  })
  it('我的反馈 → 只看自己的', async () => {
    const t = await token()
    await post(t, { type: 'feature', category: '界面', content: '想要暗色' })
    const res = await app.inject({ method: 'GET', url: '/feedback/mine', headers: { authorization: `Bearer ${t}` } })
    expect(res.json().items).toHaveLength(1)
    expect(res.json().items[0].content).toBe('想要暗色')
  })
})
