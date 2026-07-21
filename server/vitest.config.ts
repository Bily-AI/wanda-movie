import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    // 测试只跑在独立的 test.db 上,避免清空 dev 数据(test.db 由 pretest 脚本重建)
    env: { DATABASE_URL: 'file:./test.db' }
  }
})
