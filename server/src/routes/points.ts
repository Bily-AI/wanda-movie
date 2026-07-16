import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { verifyToken } from '../jwt.js'

export async function pointsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/points/deduct', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })

    const { orderId } = (req.body ?? {}) as { orderId?: string }
    if (!orderId) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    const existing = await prisma.pointLedger.findUnique({ where: { orderId } })
    if (existing) return reply.send({ ok: true, remainingPoints: user.remainingPoints })

    const cfg = await loadConfig()
    if (cfg.blockWhenExpired && (!user.expireAt || user.expireAt.getTime() <= Date.now())) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }
    if (cfg.blockWhenNoPoints && user.remainingPoints < cfg.deductPerPayment) {
      return reply.send({ ok: false, code: 'NO_POINTS' })
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: user.id },
          data: { remainingPoints: { decrement: cfg.deductPerPayment } }
        })
        await tx.pointLedger.create({
          data: { userId: u.id, delta: -cfg.deductPerPayment, reason: 'ticket', orderId, balance: u.remainingPoints }
        })
        return u
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const u = await prisma.user.findUnique({ where: { id: user.id } })
        return reply.send({ ok: true, remainingPoints: u?.remainingPoints ?? user.remainingPoints })
      }
      throw err
    }
  })
}
