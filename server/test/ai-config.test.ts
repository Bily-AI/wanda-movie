import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { tokenWithPoints } from './helpers.js'
import { encryptSecret } from '../src/crypto.js'

const app = await buildApp()
beforeAll(async () => { await app.ready() })
afterAll(async () => { await prisma.appConfig.deleteMany(); await app.close() })
beforeEach(async () => {
  await prisma.appConfig.deleteMany(); await prisma.adminLog.deleteMany()
  await prisma.feedbackMessage.deleteMany(); await prisma.feedback.deleteMany()
  await prisma.pointLedger.deleteMany(); await prisma.card.deleteMany(); await prisma.user.deleteMany()
})
const H = (t: string) => ({ authorization: `Bearer ${t}` })
async function adminToken() {
  return (await app.inject({ method: 'POST', url: '/admin/login', payload: { username: 'admin', password: 'admin888' } })).json().token
}

describe('AI 配置(百度OCR/DeepSeek)', () => {
  it('加密解密可逆', () => {
    const enc = encryptSecret('my-secret-key')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(enc).not.toContain('my-secret-key')
  })
  it('管理员保存 → 库里密文存储、GET 明文回读', async () => {
    const at = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/ai-config', headers: H(at), payload: {
      baiduApiKey: 'BK123', baiduSecretKey: 'SK456', deepseekApiKey: 'DS789',
      deepseekBaseUrl: 'https://api.deepseek.com/chat/completions', deepseekModel: 'deepseek-chat', deepseekEnabled: true
    } })
    // 库里应是密文
    const row = await prisma.appConfig.findUnique({ where: { key: 'ai.baiduApiKey' } })
    expect(row?.value).not.toBe('BK123')
    expect(row?.value?.startsWith('enc:v1:')).toBe(true)
    // 管理员读回明文
    const got = (await app.inject({ method: 'GET', url: '/admin/ai-config', headers: H(at) })).json().config
    expect(got).toMatchObject({ baiduApiKey: 'BK123', baiduSecretKey: 'SK456', deepseekApiKey: 'DS789', deepseekEnabled: true })
  })
  it('客户端登录后可拉取解密配置', async () => {
    const at = await adminToken()
    await app.inject({ method: 'POST', url: '/admin/ai-config', headers: H(at), payload: { baiduApiKey: 'BK', baiduSecretKey: 'SK', deepseekApiKey: 'DS', deepseekEnabled: false } })
    const ut = await tokenWithPoints(app, 'u1', 100)
    const cfg = (await app.inject({ method: 'GET', url: '/config/ai', headers: H(ut) })).json().config
    expect(cfg).toMatchObject({ baiduApiKey: 'BK', baiduSecretKey: 'SK', deepseekApiKey: 'DS' })
  })
  it('未登录拉取 → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/config/ai' })).statusCode).toBe(401)
  })
  it('无管理 token 读/写 → 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/ai-config' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/admin/ai-config', payload: {} })).statusCode).toBe(401)
  })
})
