import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAdminToken } from '../jwt.js'

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): string | null {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const username = token ? verifyAdminToken(token) : null
  if (!username) {
    reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    return null
  }
  return username
}
