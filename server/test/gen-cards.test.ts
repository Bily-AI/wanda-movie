import { describe, it, expect } from 'vitest'
import { generateCards } from '../scripts/gen-cards.js'
import { prisma } from '../src/db.js'

describe('generateCards', () => {
  it('生成 3 张点卡且落库', async () => {
    const codes = await generateCards(3, { kind: 'point', points: 100 })
    expect(codes).toHaveLength(3)
    expect(new Set(codes).size).toBe(3)
    const row = await prisma.card.findUnique({ where: { code: codes[0] } })
    expect(row?.kind).toBe('point')
    expect(row?.points).toBe(100)
    expect(row?.durationDays).toBeNull()
    expect(row?.status).toBe('unused')
    await prisma.card.deleteMany({ where: { code: { in: codes } } })
  })
  it('生成时长卡', async () => {
    const codes = await generateCards(2, { kind: 'duration', durationDays: 90 })
    const row = await prisma.card.findUnique({ where: { code: codes[0] } })
    expect(row?.kind).toBe('duration')
    expect(row?.durationDays).toBe(90)
    expect(row?.points).toBe(0)
    await prisma.card.deleteMany({ where: { code: { in: codes } } })
  })
})
