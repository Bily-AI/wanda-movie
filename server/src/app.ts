import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(rateLimit, { global: false })
  app.get('/health', async () => ({ ok: true }))
  return app
}
