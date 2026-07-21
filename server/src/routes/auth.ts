import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { signToken, verifyToken } from '../jwt.js'
import { cardUpdateData } from '../cards/apply.js'

export function clientConfig(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    deductPerPayment: cfg.deductPerPayment,
    heartbeatSec: cfg.heartbeatSec,
    blockWhenExpired: cfg.blockWhenExpired,
    blockWhenNoPoints: cfg.blockWhenNoPoints
  }
}

type SessionUser = { remainingPoints: number; expireAt: Date | null; subscriptionUntil: Date | null; plan: string | null }
function sessionPayload(user: SessionUser, token: string, cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    ok: true, token,
    remainingPoints: user.remainingPoints,
    expireAt: user.expireAt ? user.expireAt.toISOString() : null,
    subscriptionUntil: user.subscriptionUntil ? user.subscriptionUntil.toISOString() : null,
    plan: user.plan,
    config: clientConfig(cfg)
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string; cardCode?: string }
    const uname = body.username?.trim()
    const password = body.password
    const fingerprint = body.fingerprint
    const cardCode = body.cardCode?.trim()
    if (!uname || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    if (!cardCode) return reply.send({ ok: false, code: 'CARD_REQUIRED' })
    const exists = await prisma.user.findUnique({ where: { username: uname } })
    if (exists) return reply.send({ ok: false, code: 'USERNAME_TAKEN' })
    const passwordHash = await bcrypt.hash(password, 10)
    // 注册与卡密兑换放进一个事务:先校验并占用卡,再建号,任一步失败整体回滚,避免建出无卡的空号
    try {
      const user = await prisma.$transaction(async (tx) => {
        const card = await tx.card.findUnique({ where: { code: cardCode } })
        if (!card) throw new Error('CARD_INVALID')
        if (card.status === 'disabled') throw new Error('CARD_DISABLED')
        if (card.status === 'used') throw new Error('CARD_USED')
        const claimed = await tx.card.updateMany({ where: { id: card.id, status: 'unused' }, data: { status: 'used', usedAt: new Date() } })
        if (claimed.count === 0) throw new Error('CARD_USED')
        const created = await tx.user.create({ data: { username: uname, passwordHash, boundFingerprint: fingerprint } })
        await tx.card.update({ where: { id: card.id }, data: { usedByUserId: created.id } })
        return tx.user.update({ where: { id: created.id }, data: cardUpdateData(created, card) })
      })
      const cfg = await loadConfig()
      return reply.send(sessionPayload(user, signToken({ userId: user.id }), cfg))
    } catch (err) {
      if (err instanceof Error && ['CARD_INVALID', 'CARD_DISABLED', 'CARD_USED'].includes(err.message)) {
        return reply.send({ ok: false, code: err.message })
      }
      throw err
    }
  })

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const body = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string }
    const uname = body.username?.trim()
    const password = body.password
    const fingerprint = body.fingerprint
    if (!uname || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const user = await prisma.user.findUnique({ where: { username: uname } })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return reply.send({ ok: false, code: 'BAD_LOGIN' })
    }
    if (user.disabledAt) return reply.send({ ok: false, code: 'USER_DISABLED' })
    if (!user.boundFingerprint) {
      await prisma.user.update({ where: { id: user.id }, data: { boundFingerprint: fingerprint } })
    } else if (user.boundFingerprint !== fingerprint) {
      return reply.send({ ok: false, code: 'MACHINE_BOUND_OTHER' })
    }
    const cfg = await loadConfig()
    return reply.send(sessionPayload(user, signToken({ userId: user.id }), cfg))
  })

  app.post('/auth/heartbeat', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })
    const cfg = await loadConfig()
    return reply.send({
      ok: true,
      remainingPoints: user.remainingPoints,
      expireAt: user.expireAt ? user.expireAt.toISOString() : null,
      subscriptionUntil: user.subscriptionUntil ? user.subscriptionUntil.toISOString() : null,
      plan: user.plan,
      config: clientConfig(cfg)
    })
  })
}
