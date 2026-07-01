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

function assertMatches(file, content, pattern, label) {
  if (!pattern.test(content)) {
    throw new Error(`${file} missing ${label}`)
  }
}

const packageJson = JSON.parse(read('package.json'))
const featureApi = read('src/renderer/services/featureApi.ts')
const memberView = read('src/renderer/views/MemberView.vue')

if (packageJson.scripts?.['check:member-grade-equity'] !== 'node tools/check-member-grade-equity-contract.mjs') {
  throw new Error('package.json missing check:member-grade-equity script')
}

for (const label of [
  'canReceive: boolean',
  'equityType: number',
  'const getEquityIconUrl = firstText(record.getEquityIconUrl, record.receiveIconUrl)',
  'const equityGainStatus = toNumber(record.equityGainStatus)',
  'const equityType = toNumber(record.equityType)',
  "const hasCanGainMonth = record.canGainMonth !== undefined && record.canGainMonth !== null && record.canGainMonth !== ''",
  'canReceive: !auto && equityGainStatus === 2 && equityType !== 6 && explicitCanReceive && (!hasCanGainMonth || canGainMonth)',
  'const path = `${WANDA_API_PATHS.MEMBER_GRADE}gain_equity.api?gradeId=${encodeURIComponent(gradeId)}&equityId=${encodeURIComponent(equityId)}`',
  'path,',
  '{}'
]) {
  assertIncludes('src/renderer/services/featureApi.ts', featureApi, label)
}

for (const label of [
  'const currentGradeEquities = computed(() => currentGrade.value?.equities ?? [])',
  'const claimableRtimeRows = computed(() => currentGradeEquities.value.filter(canGainEquity))',
  'function isCurrentGradeEquity(row: MemberEquityRow)',
  'return isCurrentGradeEquity(row) && row.canReceive',
  "return { label: '查看', type: 'info' }",
  'const successNames: string[] = []',
  'const failureMessages: string[] = []',
  'successNames.push(row.name)',
  'failureMessages.push(`${row.name}：${message}`)',
  '等级权益',
  '成功：${successNames.join'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', memberView, label)
}

assertMatches(
  'src/renderer/views/MemberView.vue',
  memberView,
  /function isClaimableEquity\(row: MemberEquityRow\) \{[\s\S]*?return isCurrentGradeEquity\(row\) && row\.canReceive[\s\S]*?\}/,
  'old-tool current-grade canReceive claim filter'
)

assertMatches(
  'src/renderer/services/featureApi.ts',
  featureApi,
  /gainMemberEquity[\s\S]*?gain_equity\.api\?gradeId=\$\{encodeURIComponent\(gradeId\)\}&equityId=\$\{encodeURIComponent\(equityId\)\}[\s\S]*?wandaGet<unknown>\([\s\S]*?path,[\s\S]*?\{\},/,
  'legacy full path gain_equity call'
)

console.log('member grade equity contract passed')
