import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { authRoutes } from './routes/auth.js'
import { pointsRoutes } from './routes/points.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(rateLimit, { global: false })
  app.get('/health', async () => ({ ok: true }))
  await app.register(authRoutes)
  await app.register(pointsRoutes)
  return app
}
