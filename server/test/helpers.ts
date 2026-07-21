import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/db.js'

let seq = 0

// 造一张点卡,返回卡密。注册/兑换会消费它。
export async function pointCard(points = 100): Promise<string> {
  const code = `PT_${Date.now()}_${seq++}`
  await prisma.card.create({ data: { code, kind: 'point', points } })
  return code
}

// 造一张时长卡,返回卡密。
export async function durationCard(days = 30): Promise<string> {
  const code = `DUR_${Date.now()}_${seq++}`
  await prisma.card.create({ data: { code, kind: 'duration', points: 0, durationDays: days } })
  return code
}

// 用一张新点卡注册用户,返回 inject 响应。
export async function registerWithPoints(
  app: FastifyInstance,
  username = 'u1',
  points = 100,
  fingerprint = 'fp1'
) {
  const cardCode = await pointCard(points)
  return app.inject({ method: 'POST', url: '/auth/register', payload: { username, password: 'p1', fingerprint, cardCode } })
}

// 常用:注册并取 token。
export async function tokenWithPoints(app: FastifyInstance, username = 'u1', points = 100, fingerprint = 'fp1'): Promise<string> {
  const r = await registerWithPoints(app, username, points, fingerprint)
  return r.json().token as string
}
