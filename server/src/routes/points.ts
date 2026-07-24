import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { verifyToken } from '../jwt.js'

// 消耗型动作的服务端定价(客户端只传 action,金额由服务端定,防篡改)
const CONSUME_COSTS: Record<string, number> = {
  export: 0.1 // 批量导出账号扣 0.1 积分
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export async function pointsRoutes(app: FastifyInstance): Promise<void> {
  // 消耗积分(导出等非出票动作)。时长卡有效期内免扣;点卡按定价扣。
  app.post('/points/consume', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })

    const { action } = (req.body ?? {}) as { action?: string }
    const cost = CONSUME_COSTS[String(action ?? '')]
    if (!cost || cost <= 0) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })

    const user = await prisma.user.findUnique({ where: { id: claim.userId } })
    if (!user || user.disabledAt) return reply.code(401).send({ ok: false, code: 'USER_DISABLED' })

    const cfg = await loadConfig()
    const now = Date.now()
    if (cfg.blockWhenExpired && (!user.expireAt || user.expireAt.getTime() <= now)) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }

    // 时长订阅有效期内:免扣(记一条 delta=0 流水)
    if (user.subscriptionUntil && user.subscriptionUntil.getTime() > now) {
      await prisma.pointLedger.create({
        data: { userId: user.id, delta: 0, reason: `${action}-sub`, orderId: `consume-${randomUUID()}`, balance: user.remainingPoints }
      })
      return reply.send({ ok: true, remainingPoints: user.remainingPoints, free: true })
    }

    // 点卡用户:余额不足拒绝
    if (user.remainingPoints < cost) {
      return reply.send({ ok: false, code: 'NO_POINTS' })
    }

    const newPoints = round1(user.remainingPoints - cost)
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { remainingPoints: newPoints } })
      await tx.pointLedger.create({
        data: { userId: u.id, delta: -cost, reason: String(action), orderId: `consume-${randomUUID()}`, balance: u.remainingPoints }
      })
      return u
    })
    return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
  })


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
    const now = Date.now()
    if (cfg.blockWhenExpired && (!user.expireAt || user.expireAt.getTime() <= now)) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }
    // 时长订阅有效期内:出票免点、不限次(仍按 orderId 记一条 delta=0 流水以幂等)
    if (user.subscriptionUntil && user.subscriptionUntil.getTime() > now) {
      try {
        await prisma.pointLedger.create({ data: { userId: user.id, delta: 0, reason: 'ticket-sub', orderId, balance: user.remainingPoints } })
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err
      }
      return reply.send({ ok: true, remainingPoints: user.remainingPoints, free: true })
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
