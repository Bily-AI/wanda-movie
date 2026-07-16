import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { signToken, verifyToken } from '../jwt.js'

export function clientConfig(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    deductPerPayment: cfg.deductPerPayment,
    heartbeatSec: cfg.heartbeatSec,
    blockWhenExpired: cfg.blockWhenExpired,
    blockWhenNoPoints: cfg.blockWhenNoPoints
  }
}

function sessionPayload(user: { id: number; remainingPoints: number; expireAt: Date | null }, token: string, cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    ok: true, token,
    remainingPoints: user.remainingPoints,
    expireAt: user.expireAt ? user.expireAt.toISOString() : null,
    config: clientConfig(cfg)
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { username, password, fingerprint } = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string }
    if (!username || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const exists = await prisma.user.findUnique({ where: { username } })
    if (exists) return reply.send({ ok: false, code: 'USERNAME_TAKEN' })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({ data: { username, passwordHash, boundFingerprint: fingerprint } })
    const cfg = await loadConfig()
    return reply.send(sessionPayload(user, signToken({ userId: user.id }), cfg))
  })

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { username, password, fingerprint } = (req.body ?? {}) as { username?: string; password?: string; fingerprint?: string }
    if (!username || !password || !fingerprint) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const user = await prisma.user.findUnique({ where: { username } })
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
      config: clientConfig(cfg)
    })
  })
}
