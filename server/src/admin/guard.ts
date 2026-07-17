import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyAdminToken } from '../jwt.js'

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !verifyAdminToken(token)) {
    reply.code(401).send({ ok: false, code: 'UNAUTHORIZED' })
    return false
  }
  return true
}
