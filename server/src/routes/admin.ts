import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db.js'
import { signAdminToken } from '../jwt.js'
import { requireAdmin } from '../admin/guard.js'
import { generateCards } from '../../scripts/gen-cards.js'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { password } = (req.body ?? {}) as { password?: string }
    if (!password || password !== (process.env.ADMIN_PASSWORD ?? 'admin888')) {
      return reply.send({ ok: false, code: 'BAD_PASSWORD' })
    }
    return reply.send({ ok: true, token: signAdminToken() })
  })

  app.get('/admin/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const rows = await prisma.user.findMany({ orderBy: { id: 'desc' } })
    return reply.send({ ok: true, items: rows.map((u) => ({
      id: u.id, username: u.username, remainingPoints: u.remainingPoints,
      expireAt: u.expireAt ? u.expireAt.toISOString() : null,
      boundFingerprint: u.boundFingerprint, disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
      createdAt: u.createdAt.toISOString()
    })) })
  })

  app.post('/admin/users/:id/disable', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { disabledAt: new Date() } })
    return reply.send({ ok: true })
  })

  app.post('/admin/users/:id/enable', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { disabledAt: null } })
    return reply.send({ ok: true })
  })

  app.post('/admin/users/:id/adjust', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    const { delta } = (req.body ?? {}) as { delta?: number }
    if (typeof delta !== 'number') return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { remainingPoints: { increment: delta } } })
      await tx.pointLedger.create({ data: { userId: id, delta, reason: 'admin', orderId: `admin-${randomUUID()}`, balance: u.remainingPoints } })
      return u
    })
    return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
  })

  app.post('/admin/users/:id/unbind', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { boundFingerprint: null } })
    return reply.send({ ok: true })
  })

  app.get('/admin/cards', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const rows = await prisma.card.findMany({ orderBy: { id: 'desc' } })
    return reply.send({ ok: true, items: rows.map((c) => ({
      id: c.id, code: c.code, points: c.points, validDays: c.validDays, status: c.status,
      usedByUserId: c.usedByUserId, usedAt: c.usedAt ? c.usedAt.toISOString() : null, createdAt: c.createdAt.toISOString()
    })) })
  })

  app.post('/admin/cards/generate', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { count, points, validDays } = (req.body ?? {}) as { count?: number; points?: number; validDays?: number }
    if (!count || !points || !validDays) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const codes = await generateCards(count, points, validDays)
    return reply.send({ ok: true, codes })
  })

  app.post('/admin/cards/:id/disable', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    await prisma.card.updateMany({ where: { id, status: 'unused' }, data: { status: 'disabled' } })
    return reply.send({ ok: true })
  })

  app.get('/admin/ledger', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const rows = await prisma.pointLedger.findMany({ orderBy: { id: 'desc' }, take: 200 })
    return reply.send({ ok: true, items: rows.map((l) => ({
      id: l.id, userId: l.userId, delta: l.delta, reason: l.reason, orderId: l.orderId, balance: l.balance, createdAt: l.createdAt.toISOString()
    })) })
  })

  app.get('/admin/config', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const rows = await prisma.appConfig.findMany()
    return reply.send({ ok: true, items: rows.map((r) => ({ key: r.key, value: r.value })) })
  })

  app.post('/admin/config', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const { key, value } = (req.body ?? {}) as { key?: string; value?: string }
    if (!key || value === undefined) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    await prisma.appConfig.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })
    return reply.send({ ok: true })
  })

  app.get('/admin/feedback', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const rows = await prisma.feedback.findMany({ include: { user: true }, orderBy: { id: 'desc' } })
    return reply.send({ ok: true, items: rows.map((f) => ({
      id: f.id, username: f.user.username, type: f.type, category: f.category, content: f.content,
      contact: f.contact, images: JSON.parse(f.images) as string[], status: f.status, reply: f.reply,
      createdAt: f.createdAt.toISOString(), repliedAt: f.repliedAt ? f.repliedAt.toISOString() : null
    })) })
  })

  app.post('/admin/feedback/:id/reply', async (req, reply) => {
    if (!requireAdmin(req, reply)) return
    const id = Number((req.params as { id: string }).id)
    const { reply: replyText, status } = (req.body ?? {}) as { reply?: string; status?: string }
    if (!replyText || !status || !['replied', 'fixed'].includes(status)) {
      return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    }
    await prisma.feedback.update({ where: { id }, data: { reply: replyText, status, repliedAt: new Date() } })
    return reply.send({ ok: true })
  })
}
