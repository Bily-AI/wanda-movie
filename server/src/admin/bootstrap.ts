import bcrypt from 'bcryptjs'
import { prisma } from '../db.js'

export async function ensureDefaultAdmin(): Promise<void> {
  const username = 'admin'
  const exists = await prisma.admin.findUnique({ where: { username } })
  if (!exists) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? 'admin888', 10)
    await prisma.admin.create({ data: { username, passwordHash } })
  }
}
