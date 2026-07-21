import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })
beforeEach(async () => { await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany(); await prisma.user.deleteMany() })
async function token(username = 'u1') {
  const r = await app.inject({ method: 'POST', url: '/auth/register', payload: { username, password: 'p1', fingerprint: 'fp1' } })
  return r.json().token as string
}
const post = (t: string, b: unknown) => app.inject({ method: 'POST', url: '/feedback', headers: { authorization: `Bearer ${t}` }, payload: b })
const A = (t: string) => ({ authorization: `Bearer ${t}` })

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
  it('我的反馈 → 只看自己的(带图片、消息数组)', async () => {
    const t = await token()
    await post(t, { type: 'feature', category: '界面', content: '想要暗色', images: ['data:img1'] })
    const res = await app.inject({ method: 'GET', url: '/feedback/mine', headers: A(t) })
    expect(res.json().items).toHaveLength(1)
    const item = res.json().items[0]
    expect(item.content).toBe('想要暗色')
    expect(item.images).toEqual(['data:img1'])
    expect(Array.isArray(item.messages)).toBe(true)
    expect(item.messages).toHaveLength(0)
  })

  it('用户追问自己的工单 → 追加 user 消息、状态回 pending', async () => {
    const ut = await token()
    const id = (await post(ut, { type: 'problem', category: '出票', content: 'x' })).json().id
    const at = (await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })).json().token
    // 管理员先回复 → replied
    await app.inject({ method: 'POST', url: `/admin/feedback/${id}/reply`, headers: A(at), payload: { reply: '收到', status: 'replied' } })
    // 用户追问
    const r = await app.inject({ method: 'POST', url: `/feedback/${id}/reply`, headers: A(ut), payload: { content: '还是不行' } })
    expect(r.json().ok).toBe(true)
    const mine = await app.inject({ method: 'GET', url: '/feedback/mine', headers: A(ut) })
    const item = mine.json().items[0]
    expect(item.status).toBe('pending')
    expect(item.messages.map((m: { sender: string; content: string }) => [m.sender, m.content]))
      .toEqual([['admin', '收到'], ['user', '还是不行']])
  })

  it('用户不能追问别人的工单 → 403', async () => {
    const t1 = await token('u1')
    const id = (await post(t1, { type: 'problem', category: '出票', content: 'x' })).json().id
    const t2 = await token('u2')
    const r = await app.inject({ method: 'POST', url: `/feedback/${id}/reply`, headers: A(t2), payload: { content: '插一脚' } })
    expect(r.statusCode).toBe(403)
  })

  it('追问空内容 → 400', async () => {
    const t = await token()
    const id = (await post(t, { type: 'problem', category: '出票', content: 'x' })).json().id
    const r = await app.inject({ method: 'POST', url: `/feedback/${id}/reply`, headers: A(t), payload: { content: '   ' } })
    expect(r.statusCode).toBe(400)
  })

  it('工单被完结后 → 用户追问被拒 (409 FEEDBACK_CLOSED)', async () => {
    const ut = await token()
    const id = (await post(ut, { type: 'problem', category: '出票', content: 'x' })).json().id
    const at = (await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })).json().token
    await app.inject({ method: 'POST', url: `/admin/feedback/${id}/close`, headers: A(at) })
    const r = await app.inject({ method: 'POST', url: `/feedback/${id}/reply`, headers: A(ut), payload: { content: '还想说点啥' } })
    expect(r.statusCode).toBe(409)
    expect(r.json().code).toBe('FEEDBACK_CLOSED')
  })
})
