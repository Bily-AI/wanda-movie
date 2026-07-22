import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'
import { requireAdmin } from '../admin/guard.js'
import { encryptSecret, decryptSecret } from '../crypto.js'

// AppConfig 里存 AI 配置的 key(密钥字段加密存储)
const KEYS = {
  baiduApiKey: 'ai.baiduApiKey',
  baiduSecretKey: 'ai.baiduSecretKey',
  deepseekApiKey: 'ai.deepseekApiKey',
  deepseekBaseUrl: 'ai.deepseekBaseUrl',
  deepseekModel: 'ai.deepseekModel',
  deepseekEnabled: 'ai.deepseekEnabled'
} as const

interface AiConfig {
  baiduApiKey: string
  baiduSecretKey: string
  deepseekApiKey: string
  deepseekBaseUrl: string
  deepseekModel: string
  deepseekEnabled: boolean
}

async function readAiConfig(): Promise<AiConfig> {
  const rows = await prisma.appConfig.findMany({ where: { key: { in: Object.values(KEYS) } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    baiduApiKey: decryptSecret(map.get(KEYS.baiduApiKey) ?? ''),
    baiduSecretKey: decryptSecret(map.get(KEYS.baiduSecretKey) ?? ''),
    deepseekApiKey: decryptSecret(map.get(KEYS.deepseekApiKey) ?? ''),
    deepseekBaseUrl: map.get(KEYS.deepseekBaseUrl) ?? '',
    deepseekModel: map.get(KEYS.deepseekModel) ?? '',
    deepseekEnabled: (map.get(KEYS.deepseekEnabled) ?? 'false') === 'true'
  }
}

async function upsert(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
}

export async function aiConfigRoutes(app: FastifyInstance): Promise<void> {
  // 客户端拉取(登录用户):返回解密后的配置供 OCR/AI 使用
  app.get('/config/ai', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const cfg = await readAiConfig()
    return reply.send({ ok: true, config: cfg })
  })

  // 管理员读取(用于后台编辑,返回明文)
  app.get('/admin/ai-config', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    return reply.send({ ok: true, config: await readAiConfig() })
  })

  // 管理员保存(密钥加密后存库)
  app.post('/admin/ai-config', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const body = (req.body ?? {}) as Partial<AiConfig>
    await upsert(KEYS.baiduApiKey, encryptSecret(String(body.baiduApiKey ?? '').trim()))
    await upsert(KEYS.baiduSecretKey, encryptSecret(String(body.baiduSecretKey ?? '').trim()))
    await upsert(KEYS.deepseekApiKey, encryptSecret(String(body.deepseekApiKey ?? '').trim()))
    await upsert(KEYS.deepseekBaseUrl, String(body.deepseekBaseUrl ?? '').trim())
    await upsert(KEYS.deepseekModel, String(body.deepseekModel ?? '').trim())
    await upsert(KEYS.deepseekEnabled, body.deepseekEnabled ? 'true' : 'false')
    await prisma.adminLog.create({ data: { adminUsername: admin, action: 'ai-config.set', detail: 'baidu/deepseek 密钥已更新' } })
    return reply.send({ ok: true })
  })
}
