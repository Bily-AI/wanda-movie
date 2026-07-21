import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'
import { redeemCardToUser } from '../cards/apply.js'

const CARD_CODES = ['CARD_INVALID', 'CARD_DISABLED', 'CARD_USED', 'USER_NOT_FOUND']

export async function cardRoutes(app: FastifyInstance): Promise<void> {
  app.post('/cards/redeem', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { cardCode } = (req.body ?? {}) as { cardCode?: string }
    if (!cardCode) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    try {
      const updated = await redeemCardToUser(user.id, cardCode)
      return reply.send({
        ok: true,
        remainingPoints: updated.remainingPoints,
        expireAt: updated.expireAt ? updated.expireAt.toISOString() : null,
        subscriptionUntil: updated.subscriptionUntil ? updated.subscriptionUntil.toISOString() : null,
        plan: updated.plan
      })
    } catch (err) {
      if (err instanceof Error && CARD_CODES.includes(err.message)) {
        return reply.send({ ok: false, code: err.message === 'USER_NOT_FOUND' ? 'USER_DISABLED' : err.message })
      }
      throw err
    }
  })
}
