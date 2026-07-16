import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'change-me-in-production'
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET 环境变量在生产环境必须设置')
}

export function signToken(payload: { userId: number }): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    const d = jwt.verify(token, SECRET) as { userId: number }
    return { userId: d.userId }
  } catch {
    return null
  }
}
