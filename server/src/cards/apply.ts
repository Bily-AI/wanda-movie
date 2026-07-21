import type { Prisma } from '@prisma/client'
import { prisma } from '../db.js'

// 点卡用户账号有效期:注册起固定 1 年
export const POINT_ACCOUNT_DAYS = 365
const DAY = 86_400_000

export function planLabel(days: number): string {
  if (days === 30) return '包月'
  if (days === 90) return '包季'
  if (days === 365) return '包年'
  return `时长${days}天`
}

type UserLike = { expireAt: Date | null; subscriptionUntil: Date | null }
type CardLike = { kind: string; points: number; durationDays: number | null }

// 计算兑换一张卡后 user 要更新的字段。
// - 时长卡:延长 subscriptionUntil(未过期则叠加),expireAt 取 max,写套餐名。
// - 点卡:加点数;仅当账号尚无有效期(注册首充)时设 now+365,已有则不变(账号固定注册起 1 年)。
export function cardUpdateData(user: UserLike, card: CardLike, now = Date.now()): Prisma.UserUpdateInput {
  if (card.kind === 'duration') {
    const days = card.durationDays ?? 0
    const subBase = user.subscriptionUntil && user.subscriptionUntil.getTime() > now ? user.subscriptionUntil.getTime() : now
    const newSub = new Date(subBase + days * DAY)
    const curExpire = user.expireAt ? user.expireAt.getTime() : 0
    return {
      subscriptionUntil: newSub,
      expireAt: new Date(Math.max(curExpire, newSub.getTime())),
      plan: planLabel(days)
    }
  }
  const data: Prisma.UserUpdateInput = { remainingPoints: { increment: card.points } }
  if (!user.expireAt) data.expireAt = new Date(now + POINT_ACCOUNT_DAYS * DAY)
  return data
}

// 校验并原子兑换卡密到已存在用户。失败抛 Error(code:CARD_INVALID/CARD_DISABLED/CARD_USED/USER_NOT_FOUND)。
export async function redeemCardToUser(userId: number, cardCode: string) {
  const card = await prisma.card.findUnique({ where: { code: cardCode } })
  if (!card) throw new Error('CARD_INVALID')
  if (card.status === 'disabled') throw new Error('CARD_DISABLED')
  if (card.status === 'used') throw new Error('CARD_USED')
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('USER_NOT_FOUND')
  const data = cardUpdateData(user, card)
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.card.updateMany({
      where: { id: card.id, status: 'unused' },
      data: { status: 'used', usedByUserId: userId, usedAt: new Date() }
    })
    if (claimed.count === 0) throw new Error('CARD_USED')
    return tx.user.update({ where: { id: userId }, data })
  })
}
