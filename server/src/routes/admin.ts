import type { FastifyInstance } from 'fastify'
import { signAdminToken } from '../jwt.js'

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post('/admin/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { password } = (req.body ?? {}) as { password?: string }
    if (!password || password !== (process.env.ADMIN_PASSWORD ?? 'admin888')) {
      return reply.send({ ok: false, code: 'BAD_PASSWORD' })
    }
    return reply.send({ ok: true, token: signAdminToken() })
  })
}
