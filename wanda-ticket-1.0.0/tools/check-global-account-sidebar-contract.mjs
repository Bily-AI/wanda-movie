import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(file, source, text) {
  assert.ok(source.includes(text), `${file} should include ${text}`)
}

function assertNotIncludes(file, source, text) {
  assert.ok(!source.includes(text), `${file} should not include ${text}`)
}

const app = read('src/renderer/App.vue')
const ticketViewFull = read('src/renderer/views/TicketView.vue')
const ticketView = ticketViewFull.replace(/<!--[\s\S]*?-->/g, '')
const accountSidebar = read('src/renderer/components/AccountSidebar.vue')

assertIncludes('src/renderer/App.vue', app, "import AccountSidebar from './components/AccountSidebar.vue'")
assertIncludes('src/renderer/App.vue', app, '<AccountSidebar />')
assertIncludes('src/renderer/App.vue', app, 'class="workspace-layout"')
assertIncludes('src/renderer/App.vue', app, 'class="workspace-content"')

assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'useAccountsStore')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'handleImportAccounts')
assertIncludes('src/renderer/components/AccountSidebar.vue', accountSidebar, 'accountsStore.loginWandaAccount')

assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, '<aside class="account-column">')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, 'handleAccountSelectionChange')
assertNotIncludes('src/renderer/views/TicketView.vue', ticketView, 'handleImportAccounts')

console.log('全局账号侧栏契约检查通过')
