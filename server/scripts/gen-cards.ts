import { randomBytes } from 'node:crypto'
import { prisma } from '../src/db.js'

function newCode(): string {
  return randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

export async function generateCards(count: number, points: number, validDays: number): Promise<string[]> {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    const code = newCode()
    await prisma.card.create({ data: { code, points, validDays } })
    codes.push(code)
  }
  return codes
}

// CLI: tsx scripts/gen-cards.ts <count> <points> <validDays>
if (process.argv[1]?.endsWith('gen-cards.ts')) {
  const [count, points, days] = process.argv.slice(2).map(Number)
  const codes = await generateCards(count || 1, points || 100, days || 30)
  console.log(codes.join('\n'))
  await prisma.$disconnect()
}
