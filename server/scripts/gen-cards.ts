import { randomBytes } from 'node:crypto'
import { prisma } from '../src/db.js'

function newCode(): string {
  return randomBytes(9).toString('base64url').toUpperCase().slice(0, 12)
}

export interface CardSpec {
  kind: 'point' | 'duration'
  points?: number       // 点卡点数
  durationDays?: number // 时长卡天数
}

export async function generateCards(count: number, spec: CardSpec): Promise<string[]> {
  const codes: string[] = []
  const data =
    spec.kind === 'duration'
      ? { kind: 'duration', points: 0, durationDays: spec.durationDays ?? 30 }
      : { kind: 'point', points: spec.points ?? 100, durationDays: null }
  for (let i = 0; i < count; i++) {
    const code = newCode()
    await prisma.card.create({ data: { code, ...data } })
    codes.push(code)
  }
  return codes
}

// CLI:
//   点卡:  tsx scripts/gen-cards.ts <count> point <points>
//   时长卡:tsx scripts/gen-cards.ts <count> duration <days>
if (process.argv[1]?.endsWith('gen-cards.ts')) {
  const count = Number(process.argv[2]) || 1
  const kind = (process.argv[3] === 'duration' ? 'duration' : 'point') as 'point' | 'duration'
  const n = Number(process.argv[4]) || (kind === 'duration' ? 30 : 100)
  const codes = await generateCards(count, kind === 'duration' ? { kind, durationDays: n } : { kind, points: n })
  console.log(codes.join('\n'))
  await prisma.$disconnect()
}
