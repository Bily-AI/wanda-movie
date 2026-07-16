import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { loadConfig } from '../config.js'
import { signToken, verifyToken } from '../jwt.js'

function clientConfig(cfg: Awaited<ReturnType<typeof loadConfig>>) {
  return {
    deductPerPayment: cfg.deductPerPayment,
    heartbeatSec: cfg.heartbeatSec,
    blockWhenExpired: cfg.blockWhenExpired,
    blockWhenNoPoints: cfg.blockWhenNoPoints
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/activate', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { cardCode, fingerprint } = (req.body ?? {}) as { cardCode?: string; fingerprint?: string }
    if (!cardCode || !fingerprint) return reply.send({ ok: false, code: 'BAD_REQUEST' })

    const cfg = await loadConfig()
    const card = await prisma.card.findUnique({ where: { code: cardCode }, include: { devices: true } })
    if (!card) return reply.send({ ok: false, code: 'CARD_INVALID' })
    if (card.status === 'disabled') return reply.send({ ok: false, code: 'CARD_DISABLED' })

    let device = card.devices.find((d) => d.fingerprint === fingerprint)
    if (!device) {
      if (card.status === 'active' && card.devices.length >= cfg.maxDevicesPerCard) {
        return reply.send({ ok: false, code: 'CARD_BOUND_OTHER' })
      }
      const expireAt = new Date(Date.now() + card.validDays * 86400_000)
      device = await prisma.device.create({
        data: { fingerprint, cardId: card.id, remainingPoints: card.points, expireAt }
      })
      await prisma.card.update({
        where: { id: card.id },
        data: { status: 'active', boundDeviceId: device.id, activatedAt: card.activatedAt ?? new Date() }
      })
    } else if (device.disabledAt) {
      return reply.send({ ok: false, code: 'DEVICE_DISABLED' })
    }

    const token = signToken({ deviceId: device.id, cardId: card.id })
    return reply.send({
      ok: true, token,
      remainingPoints: device.remainingPoints,
      expireAt: device.expireAt.toISOString(),
      config: clientConfig(cfg)
    })
  })

  app.post('/auth/heartbeat', async (req, reply) => {
    const auth = req.headers.authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const claim = token ? verifyToken(token) : null
    if (!claim) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })

    const device = await prisma.device.findUnique({ where: { id: claim.deviceId }, include: { card: true } })
    if (!device || device.disabledAt) return reply.code(401).send({ ok: false, code: 'DEVICE_DISABLED' })
    if (device.card.status === 'disabled') return reply.code(401).send({ ok: false, code: 'CARD_DISABLED' })

    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    const cfg = await loadConfig()
    return reply.send({
      ok: true,
      remainingPoints: device.remainingPoints,
      expireAt: device.expireAt.toISOString(),
      config: clientConfig(cfg)
    })
  })
}
