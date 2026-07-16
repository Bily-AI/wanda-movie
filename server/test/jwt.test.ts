import { describe, it, expect } from 'vitest'
import { signToken, verifyToken } from '../src/jwt.js'

describe('jwt', () => {
  it('签发并校验', () => {
    const t = signToken({ userId: 7 })
    expect(verifyToken(t)).toMatchObject({ userId: 7 })
  })
  it('无效 token 返回 null', () => {
    expect(verifyToken('garbage')).toBeNull()
  })
})
