import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

function userId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token ? (verifyToken(token)?.userId ?? null) : null
}

const clampInt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0)

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  // 客户端上报储值卡快照(名下所有账号合计):总数 + 禁用数,覆盖式更新
  app.post('/stats/stored-cards', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { total, disabled } = (req.body ?? {}) as { total?: number; disabled?: number }
    const user = await prisma.user.findUnique({ where: { id: uid } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })
    await prisma.user.update({
      where: { id: uid },
      data: { storedCardTotal: clampInt(total), storedCardDisabled: clampInt(disabled) }
    })
    return reply.send({ ok: true })
  })

  // 客户端上报「付款成功购买储值卡」事件(轮询检测到新增才上报),累计 +count(默认1)
  app.post('/stats/stored-card-purchase', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { count } = (req.body ?? {}) as { count?: number }
    const inc = typeof count === 'number' && Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1
    const user = await prisma.user.findUnique({ where: { id: uid } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })
    const u = await prisma.user.update({ where: { id: uid }, data: { storedCardPurchased: { increment: inc } } })
    return reply.send({ ok: true, storedCardPurchased: u.storedCardPurchased })
  })
}
