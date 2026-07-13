import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n/g, '\n')
}

function assertIncludes(file, source, text) {
  assert.ok(source.includes(text), `${file} should include ${text}`)
}

function assertNotIncludes(file, source, text) {
  assert.ok(!source.includes(text), `${file} should not include ${text}`)
}

const packageJson = JSON.parse(read('package.json'))
const exchangeView = read('src/renderer/views/ExchangeCouponView.vue')

assert.equal(
  packageJson.scripts['check:coupon-layout'],
  'node tools/check-coupon-layout-contract.mjs',
  'package.json should expose check:coupon-layout'
)

for (const marker of [
  'class="coupon-page"',
  'class="coupon-summary-grid"',
  'coupon-summary-card',
  'class="coupon-filter-panel panel"',
  'class="coupon-table-panel panel"',
  'class="coupon-table-header"',
  'class="coupon-primary-cell"',
  'class="coupon-primary-title"',
  'class="coupon-primary-meta"',
  'class="coupon-action-group"',
  'class="coupon-detail-dialog"',
  'class="coupon-detail-panel"',
  'class="coupon-detail-grid"',
  'class="coupon-json-section"',
  'copyCouponDetailText',
  'presentableCouponCount',
  'formatCouponValidity'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, marker)
}

for (const marker of [
  '.coupon-page {\n  min-width: 0;\n  height: 100%;\n  min-height: 0;\n  display: grid;\n  grid-template-rows: 72px auto minmax(0, 1fr);',
  '.panel {\n  min-width: 0;',
  '.coupon-summary-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));',
  '.coupon-filter-panel {\n  min-width: 0;',
  '.coupon-table-panel {\n  min-height: 0;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;',
  '.coupon-table-wrapper {\n  flex: 1;\n  min-height: 0;',
  '.coupon-primary-title {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;',
  '.coupon-action-group {\n  display: inline-flex;',
  '.coupon-detail-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));',
  '.coupon-detail-field strong {\n  min-width: 0;',
  '.detail-json {\n  max-height: 220px;'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, marker)
}

for (const marker of [
  'title="券信息" width="460px"',
  'background: var(--app-muted);'
]) {
  assertNotIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, marker)
}

console.log('Coupon layout contract passed')
