import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'
import { signAdminToken } from '../jwt.js'
import { requireAdmin } from '../admin/guard.js'
import { generateCards } from '../../scripts/gen-cards.js'

async function writeLog(adminUsername: string, action: string, detail = ''): Promise<void> {
  await prisma.adminLog.create({ data: { adminUsername, action, detail } })
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    if (!username || !password) return reply.send({ ok: false, code: 'BAD_LOGIN' })
    const admin = await prisma.admin.findUnique({ where: { username } })
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return reply.send({ ok: false, code: 'BAD_LOGIN' })
    }
    return reply.send({ ok: true, token: signAdminToken(username) })
  })

  app.get('/admin/users', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.user.findMany({ orderBy: { id: 'desc' } })
    return reply.send({ ok: true, items: rows.map((u) => ({
      id: u.id, username: u.username, remainingPoints: u.remainingPoints,
      expireAt: u.expireAt ? u.expireAt.toISOString() : null,
      subscriptionUntil: u.subscriptionUntil ? u.subscriptionUntil.toISOString() : null,
      plan: u.plan,
      boundFingerprint: u.boundFingerprint, disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
      createdAt: u.createdAt.toISOString()
    })) })
  })

  app.post('/admin/users/:id/disable', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { disabledAt: new Date() } })
    await writeLog(admin, 'user.disable', 'userId=' + id)
    return reply.send({ ok: true })
  })

  app.post('/admin/users/:id/enable', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { disabledAt: null } })
    await writeLog(admin, 'user.enable', 'userId=' + id)
    return reply.send({ ok: true })
  })

  app.post('/admin/users/:id/adjust', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    const { delta } = (req.body ?? {}) as { delta?: number }
    if (typeof delta !== 'number') return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { remainingPoints: { increment: delta } } })
      await tx.pointLedger.create({ data: { userId: id, delta, reason: 'admin', orderId: `admin-${randomUUID()}`, balance: u.remainingPoints } })
      return u
    })
    await writeLog(admin, 'user.adjust', 'userId=' + id + ' delta=' + delta)
    return reply.send({ ok: true, remainingPoints: updated.remainingPoints })
  })

  app.post('/admin/users/:id/unbind', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    await prisma.user.update({ where: { id }, data: { boundFingerprint: null } })
    await writeLog(admin, 'user.unbind', 'userId=' + id)
    return reply.send({ ok: true })
  })

  app.get('/admin/cards', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.card.findMany({ orderBy: { id: 'desc' } })
    return reply.send({ ok: true, items: rows.map((c) => ({
      id: c.id, code: c.code, kind: c.kind, points: c.points, durationDays: c.durationDays, status: c.status,
      usedByUserId: c.usedByUserId, usedAt: c.usedAt ? c.usedAt.toISOString() : null, createdAt: c.createdAt.toISOString()
    })) })
  })

  app.post('/admin/cards/generate', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const { count, kind, points, durationDays } = (req.body ?? {}) as { count?: number; kind?: string; points?: number; durationDays?: number }
    if (!count) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    if (kind === 'duration') {
      if (!durationDays || durationDays <= 0) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
      const codes = await generateCards(count, { kind: 'duration', durationDays })
      await writeLog(admin, 'card.generate', 'count=' + count + ' duration=' + durationDays + 'd')
      return reply.send({ ok: true, codes })
    }
    // 默认点卡
    if (!points || points <= 0) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const codes = await generateCards(count, { kind: 'point', points })
    await writeLog(admin, 'card.generate', 'count=' + count + ' points=' + points)
    return reply.send({ ok: true, codes })
  })

  app.post('/admin/cards/:id/disable', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    await prisma.card.updateMany({ where: { id, status: 'unused' }, data: { status: 'disabled' } })
    await writeLog(admin, 'card.disable', 'cardId=' + id)
    return reply.send({ ok: true })
  })

  app.get('/admin/ledger', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.pointLedger.findMany({ orderBy: { id: 'desc' }, take: 200 })
    return reply.send({ ok: true, items: rows.map((l) => ({
      id: l.id, userId: l.userId, delta: l.delta, reason: l.reason, orderId: l.orderId, balance: l.balance, createdAt: l.createdAt.toISOString()
    })) })
  })

  app.get('/admin/config', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.appConfig.findMany()
    return reply.send({ ok: true, items: rows.map((r) => ({ key: r.key, value: r.value })) })
  })

  app.post('/admin/config', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const { key, value } = (req.body ?? {}) as { key?: string; value?: string }
    if (!key || value === undefined) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    await prisma.appConfig.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } })
    await writeLog(admin, 'config.set', key + '=' + value)
    return reply.send({ ok: true })
  })

  app.get('/admin/feedback', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.feedback.findMany({
      include: { user: true, messages: { orderBy: { id: 'asc' } } },
      orderBy: { id: 'desc' }
    })
    return reply.send({ ok: true, items: rows.map((f) => ({
      id: f.id, username: f.user.username, type: f.type, category: f.category, content: f.content,
      contact: f.contact, images: JSON.parse(f.images) as string[], status: f.status,
      createdAt: f.createdAt.toISOString(),
      messages: f.messages.map((m) => ({
        id: m.id, sender: m.sender, adminUsername: m.adminUsername, content: m.content, createdAt: m.createdAt.toISOString()
      }))
    })) })
  })

  // 管理员回复:追加一条 admin 消息(不再覆盖旧回复),并置工单状态
  app.post('/admin/feedback/:id/reply', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    const { reply: replyText, status } = (req.body ?? {}) as { reply?: string; status?: string }
    if (!replyText || !status || !['replied', 'fixed', 'closed'].includes(status)) {
      return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    }
    const fb = await prisma.feedback.findUnique({ where: { id } })
    if (!fb) return reply.code(404).send({ ok: false, code: 'NOT_FOUND' })
    await prisma.feedbackMessage.create({ data: { feedbackId: id, sender: 'admin', adminUsername: admin, content: replyText } })
    await prisma.feedback.update({ where: { id }, data: { status, repliedAt: new Date() } })
    await writeLog(admin, 'feedback.reply', 'id=' + id + ' status=' + status)
    return reply.send({ ok: true })
  })

  // 完结工单:置为 closed(终态),完结后用户不能再追问。不需要附带回复内容。
  app.post('/admin/feedback/:id/close', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const id = Number((req.params as { id: string }).id)
    const fb = await prisma.feedback.findUnique({ where: { id } })
    if (!fb) return reply.code(404).send({ ok: false, code: 'NOT_FOUND' })
    await prisma.feedback.update({ where: { id }, data: { status: 'closed' } })
    await writeLog(admin, 'feedback.close', 'id=' + id)
    return reply.send({ ok: true })
  })

  app.post('/admin/admins', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const { username, password } = (req.body ?? {}) as { username?: string; password?: string }
    if (!username || !password) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    if (await prisma.admin.findUnique({ where: { username } })) return reply.send({ ok: false, code: 'USERNAME_TAKEN' })
    const passwordHash = await bcrypt.hash(password, 10)
    await prisma.admin.create({ data: { username, passwordHash } })
    await writeLog(admin, 'admin.create', 'username=' + username)
    return reply.send({ ok: true })
  })

  app.get('/admin/admins', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.admin.findMany({ orderBy: { id: 'asc' } })
    return reply.send({ ok: true, items: rows.map((a) => ({ id: a.id, username: a.username, createdAt: a.createdAt.toISOString() })) })
  })

  app.get('/admin/logs', async (req, reply) => {
    const admin = requireAdmin(req, reply); if (!admin) return
    const rows = await prisma.adminLog.findMany({ orderBy: { id: 'desc' }, take: 200 })
    return reply.send({ ok: true, items: rows.map((l) => ({
      id: l.id, adminUsername: l.adminUsername, action: l.action, detail: l.detail, createdAt: l.createdAt.toISOString()
    })) })
  })
}
