import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

export async function cardRoutes(app: FastifyInstance): Promise<void> {
  app.post('/cards/redeem', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { cardCode } = (req.body ?? {}) as { cardCode?: string }
    if (!cardCode) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const card = await prisma.card.findUnique({ where: { code: cardCode } })
    if (!card) return reply.send({ ok: false, code: 'CARD_INVALID' })
    if (card.status === 'disabled') return reply.send({ ok: false, code: 'CARD_DISABLED' })
    if (card.status === 'used') return reply.send({ ok: false, code: 'CARD_USED' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    const base = user.expireAt && user.expireAt.getTime() > Date.now() ? user.expireAt.getTime() : Date.now()
    const newExpire = new Date(base + card.validDays * 86400_000)

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.card.updateMany({
          where: { id: card.id, status: 'unused' },
          data: { status: 'used', usedByUserId: user.id, usedAt: new Date() }
        })
        if (c.count === 0) throw new Error('CARD_ALREADY_USED')
        return tx.user.update({
          where: { id: user.id },
          data: { remainingPoints: { increment: card.points }, expireAt: newExpire }
        })
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints, expireAt: updated.expireAt?.toISOString() ?? null })
    } catch (err) {
      if (err instanceof Error && err.message === 'CARD_ALREADY_USED') {
        return reply.send({ ok: false, code: 'CARD_USED' })
      }
      throw err
    }
  })
}
