import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { authRoutes } from './routes/auth.js'
import { pointsRoutes } from './routes/points.js'
import { cardRoutes } from './routes/cards.js'
import { adminRoutes } from './routes/admin.js'
import { feedbackRoutes } from './routes/feedback.js'

export async function buildApp(): Promise<FastifyInstance> {
  // bodyLimit 调大到 10MB:反馈可带 base64 图片,默认 1MB 会 413
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 })
  await app.register(rateLimit, { global: false })
  app.get('/health', async () => ({ ok: true }))
  await app.register(authRoutes)
  await app.register(cardRoutes)
  await app.register(pointsRoutes)
  await app.register(adminRoutes)
  await app.register(feedbackRoutes)
  const currentDir = dirname(fileURLToPath(import.meta.url))
  await app.register(fastifyStatic, { root: join(currentDir, '../public'), prefix: '/' })
  app.get('/admin', async (_req, reply) => reply.sendFile('admin.html'))
  return app
}
