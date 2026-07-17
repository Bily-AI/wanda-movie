import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'
const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await app.close() })

describe('POST /admin/login', () => {
  it('密码对 → 发管理 token', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'admin888' } })
    expect(res.json().ok).toBe(true)
    expect(typeof res.json().token).toBe('string')
  })
  it('密码错 → BAD_PASSWORD', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/login', payload: { password: 'wrong' } })
    expect(res.json()).toMatchObject({ ok: false, code: 'BAD_PASSWORD' })
  })
})
