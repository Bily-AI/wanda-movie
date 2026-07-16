import { describe, it, expect, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

const app = await buildApp()
afterAll(() => app.close())

describe('health', () => {
  it('GET /health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})
