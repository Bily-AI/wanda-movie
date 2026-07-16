import { prisma } from '../src/db.js'

const defaults: Record<string, string> = {
  deductPerPayment: '1',
  maxDevicesPerCard: '1',
  heartbeatSec: '60',
  blockWhenExpired: 'true',
  blockWhenNoPoints: 'true'
}

for (const [key, value] of Object.entries(defaults)) {
  await prisma.appConfig.upsert({ where: { key }, update: {}, create: { key, value } })
}
console.log('seeded app_config')
await prisma.$disconnect()
