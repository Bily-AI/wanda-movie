import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n')
const has = (file, src, text) => assert.ok(src.includes(text), `${file} should include ${text}`)

const router = read('src/renderer/router/index.ts')
has('router', router, "path: '/login'")
has('router', router, 'router.beforeEach')

const authStore = read('src/renderer/stores/auth.ts')
has('auth store', authStore, 'getMachineFingerprint()')
has('auth store', authStore, 'canPay')
has('auth store', authStore, 'startHeartbeat')
has('auth store', authStore, 'register')
has('auth store', authStore, 'login')
has('auth store', authStore, 'redeem')

const authApi = read('src/renderer/services/authApi.ts')
has('authApi', authApi, '/auth/register')
has('authApi', authApi, '/cards/redeem')

const loginView = read('src/renderer/views/LoginView.vue')
has('LoginView', loginView, '注册')

const ticket = read('src/renderer/stores/ticket.ts')
has('ticket store', ticket, 'deductPoint(')

const ticketView = read('src/renderer/views/TicketView.vue')
has('TicketView', ticketView, 'authStore.canPay')

console.log('鉴权闸门契约检查通过')
