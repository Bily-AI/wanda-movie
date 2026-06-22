import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function assertIncludes(file, content, label) {
  if (!content.includes(label)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

function assertNotIncludes(file, content, label) {
  if (content.includes(label)) {
    throw new Error(`${file} 不应包含 ${label}`)
  }
}

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} 缺少 ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const design = read('docs/superpowers/specs/2026-06-22-coupon-category-design.md')
const localData = read('src/shared/localData.ts')
const exchangeView = read('src/renderer/views/ExchangeCouponView.vue')

if (packageJson.scripts?.['check:coupon-category'] !== 'node tools/check-coupon-category-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:coupon-category 脚本')
}

for (const label of [
  '兑换券分类与统计视图设计',
  'categories.json',
  '{ id, name, couponNames }',
  '按分类筛选',
  '统计视图',
  '不补 mock 券数据'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-22-coupon-category-design.md', design, label)
}

for (const label of [
  "CATEGORIES: 'categories'",
  'CouponCategory',
  'CouponCategoriesLocalData',
  'categories: CouponCategoriesLocalData',
  'categories: []'
]) {
  assertIncludes('src/shared/localData.ts', localData, label)
}

for (const label of [
  'CouponCategory',
  'couponCategories',
  'categoryFilter',
  'categoryDialogVisible',
  'newCategoryName',
  'statsMode',
  'couponNameStats',
  'loadCouponCategories',
  "readLocalData('categories')",
  'saveCouponCategories',
  "writeLocalData('categories'",
  'createCategoryId',
  'addCouponCategory',
  'removeCouponCategory',
  'openCategoryDialog',
  'handleCategoryCouponNamesChange',
  'category.couponNames',
  'statsMode.value = !statsMode.value',
  '分类管理',
  '暂无分类，请添加',
  '选择券名称',
  '明细'
]) {
  assertIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, label)
}

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /if \(categoryFilter\.value\)[\s\S]*?new Set\(category\.couponNames\)[\s\S]*?coupon\.name/,
  '分类筛选必须按本地分类关联券名称过滤真实券列表'
)

assertMatches(
  'src/renderer/views/ExchangeCouponView.vue',
  exchangeView,
  /couponNameStats[\s\S]*?new Map[\s\S]*?coupon\.name[\s\S]*?count/,
  '统计视图必须按真实券名称聚合数量'
)

for (const label of [
  "ElMessage.info('分类筛选已使用当前真实兑换券数据')",
  '当前已加载 ${coupons.value.length} 张兑换券，可见 ${couponRows.value.length} 张'
]) {
  assertNotIncludes('src/renderer/views/ExchangeCouponView.vue', exchangeView, label)
}

console.log('兑换券分类与统计契约检查通过')
