import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('config', () => {
  it('缺省时返回默认配置', async () => {
    const cfg = await loadConfig()
    expect(cfg.deductPerPayment).toBe(1)
    expect(cfg.maxDevicesPerCard).toBe(1)
    expect(cfg.heartbeatSec).toBe(60)
    expect(cfg.blockWhenExpired).toBe(true)
    expect(cfg.blockWhenNoPoints).toBe(true)
  })
})
