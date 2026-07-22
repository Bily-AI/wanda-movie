import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// 用于加密存储第三方密钥(百度OCR/DeepSeek)。密钥由 CONFIG_ENC_KEY(或回退 JWT_SECRET)派生。
// 注意:这只防「数据库明文泄露」;密钥最终仍会下发到客户端使用(用户选择的「较弱」方案)。
function encKey(): Buffer {
  const secret = process.env.CONFIG_ENC_KEY || process.env.JWT_SECRET || 'wanda-default-config-key'
  return createHash('sha256').update(secret).digest() // 32 bytes
}

const PREFIX = 'enc:v1:'

// 加密 → 'enc:v1:<base64(iv|tag|ciphertext)>'
export function encryptSecret(plain: string): string {
  if (!plain) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

// 解密;非加密串(旧明文)原样返回,容错
export function decryptSecret(value: string): string {
  if (!value) return ''
  if (!value.startsWith(PREFIX)) return value
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64')
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', encKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}
