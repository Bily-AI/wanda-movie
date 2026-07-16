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

    // 先校验设备合法性
    const device0 = await prisma.device.findUnique({ where: { id: claim.deviceId } })
    if (!device0 || device0.disabledAt) return reply.code(401).send({ ok: false, code: 'DEVICE_DISABLED' })

    // 幂等:同 orderId 已扣过 → 返回当前余额,不重复扣
    const existing = await prisma.pointLedger.findUnique({ where: { orderId } })
    if (existing) return reply.send({ ok: true, remainingPoints: device0.remainingPoints })

    const cfg = await loadConfig()
    if (cfg.blockWhenExpired && device0.expireAt.getTime() <= Date.now()) {
      return reply.send({ ok: false, code: 'EXPIRED' })
    }
    if (cfg.blockWhenNoPoints && device0.remainingPoints < cfg.deductPerPayment) {
      return reply.send({ ok: false, code: 'NO_POINTS' })
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const d = await tx.device.update({
          where: { id: device0.id },
          data: { remainingPoints: { decrement: cfg.deductPerPayment } }
        })
        await tx.pointLedger.create({
          data: { deviceId: d.id, delta: -cfg.deductPerPayment, reason: 'ticket', orderId, balance: d.remainingPoints }
        })
        return d
      })
      return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
    } catch (err) {
      // 仅 orderId 唯一约束冲突(并发下另一个请求已扣)视为幂等命中,返回当前余额;
      // 其它错误抛出 → 500,避免漏扣被当成功。
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const d = await prisma.device.findUnique({ where: { id: device0.id } })
        return reply.send({ ok: true, remainingPoints: d?.remainingPoints ?? device0.remainingPoints })
      }
      throw err
    }
  })
}
