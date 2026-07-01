import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

function assertIncludes(file, content, label) {
  if (!content.includes(label)) {
    throw new Error(`${file} missing ${label}`)
  }
}

function assertNotIncludes(file, content, label) {
  if (content.includes(label)) {
    throw new Error(`${file} should not include ${label}`)
  }
}

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} missing ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const design = read('docs/superpowers/specs/2026-06-22-member-signin-flow-design.md')
const featureApi = read('src/renderer/services/featureApi.ts')
const memberView = read('src/renderer/views/MemberView.vue')
const wandaCore = read('src/shared/wandaCore.ts')
const wandaRequest = read('src/renderer/services/wandaRequest.ts')

if (packageJson.scripts?.['check:member-signin'] !== 'node tools/check-member-signin-contract.mjs') {
  throw new Error('package.json missing check:member-signin script')
}

for (const label of [
  '/sign_in/calendar.api',
  '{"ruleScene":1}',
  'consecutiveDays',
  'signInStreak',
  'dataList',
  'YYDDJDKYHA'
]) {
  assertIncludes('docs/superpowers/specs/2026-06-22-member-signin-flow-design.md', design, label)
}

for (const label of [
  "SIGN_IN_VALID_SUPPLEMENT: '/sign_in/valid_supplement.api'",
  "SIGN_IN_DO: '/sign_in/do_sign_in.api'"
]) {
  assertIncludes('src/shared/wandaCore.ts', wandaCore, label)
}

for (const label of [
  'MemberSignInDay',
  'MemberSignInCalendar',
  'MemberSignInSubmitResult',
  'fetchMemberSignInCalendar',
  'submitMemberSignIn',
  'normalizeSignInDay',
  'WANDA_API_PATHS.SIGN_IN_CALENDAR',
  'WANDA_API_PATHS.SIGN_IN_VALID_SUPPLEMENT',
  'WANDA_API_PATHS.SIGN_IN_DO',
  'JSON.stringify({ ruleScene: 1 })',
  'JSON.stringify({ signInDate: formatWandaDate(), ruleScene: 1 })',
  'wandaSignInPostJson',
  "contentType: 'application/json'",
  "encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g",
  'consecutiveDays',
  'signInStreak',
  'dataList',
  'todayFlag',
  'state',
  'signState',
  'isSigned',
  'hasSignIn'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

for (const label of [
  'wandaSignInPostJson',
  'buildWandaSignInHeaders',
  "const WANDA_SIGN_IN_VERSION = '9.2.4'",
  "const WANDA_SIGN_IN_SYSTEM_VERSION = '15'",
  "const WANDA_SIGN_IN_MODEL = 'Pixel 6'",
  "const WANDA_SIGN_IN_USER = 'YYAAFWZJKD'",
  "'Content-Type': 'application/json'",
  "'X-RY-USER': WANDA_SIGN_IN_USER"
]) {
  assertIncludes('src/renderer/services/wandaRequest.ts', wandaRequest, label)
}

for (const label of [
  "MEMBER_GRADE_SIGN_IN: '/member/grade/sign_in.api'",
  'MEMBER_GRADE_SIGN_IN',
  '/member/grade/sign_in.api'
]) {
  assertNotIncludes('src/shared/wandaCore.ts', wandaCore, label)
  assertNotIncludes('src/renderer/services/featureApi.ts', featureApi, label)
  assertNotIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /fetchMemberSignInCalendar\([\s\S]*?JSON\.stringify\(\{ ruleScene: 1 \}\)[\s\S]*?wandaPostForm[\s\S]*?SIGN_IN_CALENDAR[\s\S]*?contentType: 'application\/json'/,
  'calendar JSON POST call'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /submitMemberSignIn\([\s\S]*?JSON\.stringify\(\{ signInDate: formatWandaDate\(\), ruleScene: 1 \}\)[\s\S]*?SIGN_IN_VALID_SUPPLEMENT[\s\S]*?SIGN_IN_DO/s,
  'valid_supplement before do_sign_in'
)

for (const label of [
  'fetchMemberSignInCalendar',
  'submitMemberSignIn',
  'type MemberSignInCalendar',
  'type MemberSignInSubmitResult',
  'signInCalendar',
  'signInDays',
  'signInMessage',
  'signInSubmitting',
  'todaySignInDay',
  'hasSignedToday',
  'getSignInSnapshot',
  'isSignInSnapshotChanged',
  'loadSignInCalendar',
  'submitSignIn',
  'signin-actions',
  'is-signin-primary',
  'await submitMemberSignIn(account.ck)',
  'await loadSignInCalendar()',
  'ElMessage.success',
  'ElMessage.warning',
  'DEFAULT_WANDA_USER_IDENTIFIER',
  'account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER',
  'state === 1',
  'todayFlag',
  'sign-day--done',
  'sign-day--today'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

assertMatches(
  'src/renderer/views/MemberView.vue',
  memberView,
  /submitSignIn\([\s\S]*?const beforeSignInSnapshot = getSignInSnapshot\(\)[\s\S]*?signInSubmitting\.value = true[\s\S]*?await submitMemberSignIn\(account\.ck\)[\s\S]*?await loadSignInCalendar\(\)[\s\S]*?const afterSignInSnapshot = getSignInSnapshot\(\)[\s\S]*?isSignInSnapshotChanged\(beforeSignInSnapshot, afterSignInSnapshot\)[\s\S]*?ElMessage\.success/,
  'submit before refreshing calendar'
)

for (const label of [
  '<span>浠婃棩</span>',
  '<span>鏄庢棩</span>',
  '<span>3鏃?/span>',
  '浼氬憳鏁版嵁鏉ヨ嚜涓囪揪鎺ュ彛'
]) {
  assertNotIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

console.log('member sign-in contract passed')
