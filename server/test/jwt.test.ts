import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from '../src/jwt.js'

describe('jwt', () => {
  it('签发并校验', () => {
    const t = signToken({ deviceId: 7, cardId: 3 })
    expect(verifyToken(t)).toMatchObject({ deviceId: 7, cardId: 3 })
  })
  it('无效 token 返回 null', () => {
    expect(verifyToken('garbage')).toBeNull()
  })
})
