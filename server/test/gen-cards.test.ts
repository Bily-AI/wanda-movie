import { describe, it, expect } from 'vitest'
import { generateCards } from '../scripts/gen-cards.js'
import { prisma } from '../src/db.js'

describe('generateCards', () => {
  it('生成 3 张卡且落库', async () => {
    const codes = await generateCards(3, 100, 30)
    expect(codes).toHaveLength(3)
    expect(new Set(codes).size).toBe(3)
    const row = await prisma.card.findUnique({ where: { code: codes[0] } })
    expect(row?.points).toBe(100)
    expect(row?.validDays).toBe(30)
    expect(row?.status).toBe('unused')
    await prisma.card.deleteMany({ where: { code: { in: codes } } })
  })
})
