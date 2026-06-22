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
const design = read('docs/superpowers/specs/2026-06-22-member-signin-flow-design.md')
const featureApi = read('src/renderer/services/featureApi.ts')
const memberView = read('src/renderer/views/MemberView.vue')

if (packageJson.scripts?.['check:member-signin'] !== 'node tools/check-member-signin-contract.mjs') {
  throw new Error('package.json 缺少正确的 check:member-signin 脚本')
}

for (const label of [
  '会员签到真实接口链路设计',
  '/sign_in/calendar.api',
  '{"ruleScene":1}',
  'Content-Type：`application/json`',
  'consecutiveDays',
  'signInStreak',
  'dataList',
  'YYDDJDKYHA'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-22-member-signin-flow-design.md', design, label)
}

for (const label of [
  'MemberSignInDay',
  'MemberSignInCalendar',
  'fetchMemberSignInCalendar',
  'normalizeSignInDay',
  'WANDA_API_PATHS.SIGN_IN_CALENDAR',
  'JSON.stringify({ ruleScene: 1 })',
  "contentType: 'application/json'",
  "encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g",
  'consecutiveDays',
  'signInStreak',
  'dataList',
  'todayFlag',
  'state'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /fetchMemberSignInCalendar\([\s\S]*?JSON\.stringify\(\{ ruleScene: 1 \}\)[\s\S]*?wandaPostForm[\s\S]*?SIGN_IN_CALENDAR[\s\S]*?contentType: 'application\/json'/,
  '会员签到必须使用旧包 JSON POST 调用'
)

for (const label of [
  'fetchMemberSignInCalendar',
  'type MemberSignInCalendar',
  'signInCalendar',
  'signInDays',
  'signInMessage',
  'loadSignInCalendar',
  'DEFAULT_WANDA_USER_IDENTIFIER',
  'account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER',
  'state === 1',
  'todayFlag',
  'sign-day--done',
  'sign-day--today',
  '暂无签到数据'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

for (const label of [
  '<span>今日</span>',
  '<span>明日</span>',
  '<span>3日</span>',
  '会员数据来自万达接口'
]) {
  assertNotIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

console.log('会员签到真实接口契约检查通过')
