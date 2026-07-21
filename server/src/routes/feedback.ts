import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

function userId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token ? (verifyToken(token)?.userId ?? null) : null
}

interface MessageRow {
  id: number
  sender: string
  adminUsername: string | null
  content: string
  createdAt: Date
}
function mapMessages(rows: MessageRow[]): Array<{ id: number; sender: string; adminUsername: string | null; content: string; createdAt: string }> {
  return rows.map((m) => ({
    id: m.id, sender: m.sender, adminUsername: m.adminUsername, content: m.content, createdAt: m.createdAt.toISOString()
  }))
}

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/feedback', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const { type, category, content, contact, images } = (req.body ?? {}) as {
      type?: string; category?: string; content?: string; contact?: string; images?: string[]
    }
    if (!type || !category || !content) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const fb = await prisma.feedback.create({
      data: { userId: uid, type, category, content, contact: contact ?? null, images: JSON.stringify(images ?? []) }
    })
    return reply.send({ ok: true, id: fb.id })
  })

  app.get('/feedback/mine', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const rows = await prisma.feedback.findMany({
      where: { userId: uid },
      orderBy: { id: 'desc' },
      include: { messages: { orderBy: { id: 'asc' } } }
    })
    return reply.send({
      ok: true,
      items: rows.map((r) => ({
        id: r.id, type: r.type, category: r.category, content: r.content,
        contact: r.contact, images: JSON.parse(r.images) as string[],
        status: r.status, createdAt: r.createdAt.toISOString(),
        messages: mapMessages(r.messages)
      }))
    })
  })

  // 用户对自己的工单追问(追加一条 user 消息),状态回到待处理
  app.post('/feedback/:id/reply', async (req, reply) => {
    const uid = userId(req)
    if (!uid) return reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    const id = Number((req.params as { id: string }).id)
    const { content } = (req.body ?? {}) as { content?: string }
    if (!content || !content.trim()) return reply.code(400).send({ ok: false, code: 'BAD_REQUEST' })
    const fb = await prisma.feedback.findUnique({ where: { id } })
    if (!fb || fb.userId !== uid) return reply.code(403).send({ ok: false, code: 'FORBIDDEN' })
    if (fb.status === 'closed') return reply.code(409).send({ ok: false, code: 'FEEDBACK_CLOSED' })
    await prisma.feedbackMessage.create({ data: { feedbackId: id, sender: 'user', content: content.trim() } })
    await prisma.feedback.update({ where: { id }, data: { status: 'pending' } })
    return reply.send({ ok: true })
  })
}
