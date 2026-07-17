import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { verifyToken } from '../jwt.js'

function userId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  return token ? (verifyToken(token)?.userId ?? null) : null
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
    const rows = await prisma.feedback.findMany({ where: { userId: uid }, orderBy: { id: 'desc' } })
    return reply.send({
      ok: true,
      items: rows.map((r) => ({
        id: r.id, type: r.type, category: r.category, content: r.content,
        status: r.status, reply: r.reply, createdAt: r.createdAt.toISOString(),
        repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null
      }))
    })
  })
}
