import Fastify, { type FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import cors from '@fastify/cors'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ensureDefaultAdmin } from './admin/bootstrap.js'
import { authRoutes } from './routes/auth.js'
import { pointsRoutes } from './routes/points.js'
import { cardRoutes } from './routes/cards.js'
import { adminRoutes } from './routes/admin.js'
import { feedbackRoutes } from './routes/feedback.js'

export async function buildApp(): Promise<FastifyInstance> {
  // bodyLimit 调大到 10MB:反馈可带 base64 图片,默认 1MB 会 413
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 })
  // 容忍空 JSON body:后台的 disable/enable/unbind/停卡 等无 body 的 POST,
  // 客户端(fetch)常带 Content-Type: application/json 但不带 body,默认会被 Fastify 拒 400。空 body 视为 {}。
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(String(body)))
    } catch (err) {
      done(err instanceof Error ? err : new Error('invalid json'), undefined)
    }
  })
  // 跨域:Electron 渲染进程(dev 在 localhost:5173,打包版是 file://)访问本后端属于跨域,
  // 浏览器/Chromium 会拦预检。桌面端用 Bearer token 鉴权(不用 cookie),放行所有源即可。
  await app.register(cors, { origin: true })
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
  await ensureDefaultAdmin()
  return app
}
