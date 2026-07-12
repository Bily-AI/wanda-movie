<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, CloseBold, CollectionTag, Link, Medal, Refresh, Star, SuccessFilled, Trophy } from '@element-plus/icons-vue'

import {
  activateWPlus,
  fetchMemberGradeEquityList,
  fetchMemberSignInCalendar,
  fetchWPlusProfile,
  fetchWPlusRightGroups,
  gainMemberEquity,
  receiveWPlusRight,
  submitMemberSignIn,
  type MemberEquityRow,
  type MemberGradeGroup,
  type MemberSignInCalendar,
  type MemberSignInDay,
  type MemberSignInSubmitResult,
  type MemberWPlusExchangeResult,
  type MemberWPlusProfile,
  type MemberWPlusRight,
  type MemberWPlusRightGroup
} from '@renderer/services/featureApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'
const H5_COMMON_PAGES = [
  {
    label: 'W+页面',
    url: 'https://act-m.wandacinemas.com/wmember/rightsdetail/2024'
  },
  {
    label: '积分中心',
    url: 'https://act-routine-web-prd-mx.wandacinemas.com/memberPoints?activityid=1034'
  }
] as const

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()

const activeTab = ref<'rtime' | 'wplus'>('rtime')
const h5DialogVisible = ref(false)
const selectedH5Url = ref<string>(H5_COMMON_PAGES[0].url)
const h5Url = ref<string>(H5_COMMON_PAGES[0].url)

const rtimeLoading = ref(false)
const wplusProfileLoading = ref(false)
const wplusRightsLoading = ref(false)
const batchLoading = ref(false)
const activateLoading = ref(false)
const signInSubmitting = ref(false)
const rtimeClaimingKeys = ref<string[]>([])
const wplusClaimingKeys = ref<string[]>([])

const gradeGroups = ref<MemberGradeGroup[]>([])
const signInCalendar = ref<MemberSignInCalendar | null>(null)
const signInMessage = ref('')
const wplusProfile = ref<MemberWPlusProfile | null>(null)
const wplusRightGroups = ref<MemberWPlusRightGroup[]>([])
const exchangeCode = ref('')
const exchangePassword = ref('')
const exchangeResult = ref<MemberWPlusExchangeResult | null>(null)
const rtimeError = ref('')
const wplusError = ref('')

const currentAccount = computed(() => accountsStore.currentAccount)
const hasCurrentAccount = computed(() => Boolean(currentAccount.value?.ck))

const sortedGradeGroups = computed(() => [...gradeGroups.value].sort((a, b) => a.growthMinVal - b.growthMinVal))

const currentGrowthValue = computed(() => {
  const explicitCurrent = gradeGroups.value.find((group) => group.isCurrent && group.memberGrowthVal)
  const memberGrowthGroup = gradeGroups.value.find((group) => group.memberGrowthVal)

  return explicitCurrent?.memberGrowthVal || memberGrowthGroup?.memberGrowthVal || gradeGroups.value[0]?.growthValue || 0
})

const currentGrade = computed(() => {
  if (gradeGroups.value.length === 0) {
    return null
  }

  const growthValue = currentGrowthValue.value
  const explicitCurrent = gradeGroups.value.find((group) => group.isCurrent)

  if (explicitCurrent) {
    return explicitCurrent
  }

  return (
    [...sortedGradeGroups.value]
      .reverse()
      .find((group) => growthValue >= group.growthMinVal && (group.growthMaxVal === null || growthValue <= group.growthMaxVal)) ||
    [...sortedGradeGroups.value].reverse().find((group) => growthValue >= group.growthMinVal) ||
    sortedGradeGroups.value[0] ||
    null
  )
})

const nextGrade = computed(() => {
  const record = currentGrade.value

  if (!record) {
    return null
  }

  const index = sortedGradeGroups.value.findIndex((item) => item.gradeId === record.gradeId)

  if (index < 0 || index >= sortedGradeGroups.value.length - 1) {
    return null
  }

  return sortedGradeGroups.value[index + 1]
})

const isMaxGrade = computed(() => !nextGrade.value)

const orderedGradeGroups = computed(() => {
  if (gradeGroups.value.length === 0) {
    return []
  }

  const record = currentGrade.value

  if (!record) {
    return sortedGradeGroups.value
  }

  const groups = [...sortedGradeGroups.value]
  const index = groups.findIndex((item) => item.gradeId === record.gradeId)

  if (index > 0) {
    const [group] = groups.splice(index, 1)
    groups.unshift(group)
  }

  return groups
})

const monthExpiredGrowth = computed(() => currentGrade.value?.monthExpiredGrowth || 0)

const monthExpireDowngradeName = computed(() => {
  const record = currentGrade.value

  if (!record || !monthExpiredGrowth.value) {
    return ''
  }

  const afterExpireGrowth = record.memberGrowthVal - monthExpiredGrowth.value
  const groups = [...gradeGroups.value].sort((a, b) => b.growthMinVal - a.growthMinVal)

  for (const item of groups) {
    if (afterExpireGrowth >= item.growthMinVal) {
      return item.gradeName
    }
  }

  return groups.length > 0 ? groups[groups.length - 1].gradeName : ''
})

const maxGrowthValue = computed(() => {
  if (sortedGradeGroups.value.length === 0) {
    return 100000
  }

  const lastGroup = sortedGradeGroups.value[sortedGradeGroups.value.length - 1]

  return lastGroup.growthMaxVal ?? lastGroup.growthMinVal * 2
})

const progressPercentage = computed(() => {
  const record = currentGrade.value

  if (!record) {
    return 0
  }

  const next = nextGrade.value

  if (next) {
    if (next.growthMinVal <= 0) {
      return 100
    }

    return Math.min(100, Math.max(0, Math.round((record.memberGrowthVal / next.growthMinVal) * 100)))
  }

  const target = record.growthMaxVal ?? record.growthMinVal * 2

  if (target <= record.growthMinVal) {
    return 100
  }

  const numerator = record.memberGrowthVal - record.growthMinVal
  return Math.min(100, Math.max(0, Math.round((numerator / (target - record.growthMinVal)) * 100)))
})

const needGrowthToNext = computed(() => {
  const record = currentGrade.value
  const next = nextGrade.value

  if (!record || !next) {
    return 0
  }

  return Math.max(0, next.growthMinVal - record.memberGrowthVal)
})

const currentGradeEquities = computed(() => currentGrade.value?.equities ?? [])

const claimableRtimeRows = computed(() => currentGradeEquities.value.filter(canGainEquity))

const hasClaimableRtime = computed(() => claimableRtimeRows.value.length > 0)

const totalWPlusRights = computed(() =>
  wplusRightGroups.value.reduce((sum, group) => sum + group.rightList.length, 0)
)

const claimableWPlusRights = computed(() =>
  wplusRightGroups.value.flatMap((group) => group.rightList).filter(canReceiveWPlusRight)
)

const hasClaimableWPlus = computed(() => claimableWPlusRights.value.length > 0)

const totalClaimableMemberRights = computed(() => claimableRtimeRows.value.length + claimableWPlusRights.value.length)

const wplusStatusProfile = computed(() => {
  if (wplusProfile.value) {
    return wplusProfile.value
  }

  const expireAt = String(currentAccount.value?.wplusExpireAt || '').trim()
  const isPayMember = Boolean(currentAccount.value?.isPayMember) || hasWPlusExpireDate(expireAt)

  if (!isPayMember && !expireAt) {
    return null
  }

  return {
    isPayMember,
    expireAt,
    raw: currentAccount.value
  }
})

const wplusStatusText = computed(() => {
  if (wplusProfileLoading.value) {
    return '检测中'
  }

  if (!wplusProfile.value) {
    return '未检测'
  }

  return wplusProfile.value.isPayMember ? '已开通' : '未开通'
})

const wplusStatusHint = computed(() => {
  if (wplusProfile.value?.expireAt) {
    return `到期 ${wplusProfile.value.expireAt}`
  }

  return wplusProfile.value?.isPayMember ? '权益待刷新' : '可激活兑换'
})

const wplusStatusTextSafe = computed(() => {
  if (wplusProfileLoading.value && !wplusStatusProfile.value) {
    return '检测中'
  }

  if (!wplusStatusProfile.value) {
    return '未检测'
  }

  const profile = wplusStatusProfile.value
  // 有有效的 W+到期日期即视为已开通（到期日期只有 W+ 会员才有），与 normalizeWPlusProfile 口径一致
  return profile.isPayMember || hasWPlusExpireDate(profile.expireAt) ? '已开通' : '未开通'
})

const wplusStatusHintSafe = computed(() => {
  if (wplusStatusProfile.value?.expireAt) {
    return `到期 ${wplusStatusProfile.value.expireAt}`
  }

  return wplusStatusProfile.value?.isPayMember ? '权益待刷新' : '可激活兑换'
})

const wplusEmptyDescription = computed(() => {
  if (wplusError.value) {
    return '获取W+会员信息失败'
  }

  if (wplusProfile.value && !wplusProfile.value.isPayMember) {
    return '当前账号不是 W+ 会员，请先激活 W+'
  }

  return '暂无可领取 W+ 权益'
})

const signInDays = computed(() => signInCalendar.value?.dataList ?? [])

const todaySignInDay = computed(() => signInDays.value.find((day) => day.todayFlag) || null)

const hasSignedToday = computed(() => Boolean(todaySignInDay.value && todaySignInDay.value.state === 1))

const signInTitle = computed(() => {
  if (!signInCalendar.value) {
    return signInMessage.value || '暂无签到数据'
  }

  return `连续签到 ${signInCalendar.value.consecutiveDays} 天`
})

const signInStreakText = computed(() => {
  if (!signInCalendar.value?.signInStreak) {
    return ''
  }

  return `（累计 ${signInCalendar.value.signInStreak} 天）`
})

interface SignInSnapshot {
  signedToday: boolean
  consecutiveDays: number
  signInStreak: number
  growthValue: number
}

function getSignInSnapshot(): SignInSnapshot {
  return {
    signedToday: hasSignedToday.value,
    consecutiveDays: signInCalendar.value?.consecutiveDays ?? 0,
    signInStreak: signInCalendar.value?.signInStreak ?? 0,
    growthValue: currentGrowthValue.value
  }
}

function isSignInSnapshotChanged(before: SignInSnapshot, after: SignInSnapshot) {
  return (
    (!before.signedToday && after.signedToday) ||
    after.consecutiveDays > before.consecutiveDays ||
    after.signInStreak > before.signInStreak ||
    after.growthValue > before.growthValue
  )
}

function isAlreadySignedSubmitResult(result: MemberSignInSubmitResult) {
  return result.bizCode === 1004 || result.bizMsg.includes('已签到') || result.bizMsg.includes('重复签到')
}

function withUserIdentifier(account: typeof currentAccount.value) {
  if (!account?.ck) {
    return null
  }

  // 兼容旧系统默认标识：account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function hasWPlusExpireDate(value: string | null | undefined) {
  const text = String(value || '').trim()
  return /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})|\b\d{8}\b/.test(text)
}

function isNonWPlusMessage(message: string) {
  return message.includes('不是 W+ 会员') || message.includes('不是付费会员') || message.includes('非付费会员')
}

function isCurrentGrade(group: MemberGradeGroup) {
  return Boolean(currentGrade.value && group.gradeId === currentGrade.value.gradeId)
}

function isPassedGrade(group: MemberGradeGroup) {
  return Boolean(currentGrade.value && group.growthMinVal < currentGrade.value.growthMinVal)
}

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

function getRtimeEquityKey(row: MemberEquityRow) {
  return `${row.gradeId || 'grade'}:${row.equityId || row.name}`
}

function getWPlusRightKey(right: MemberWPlusRight) {
  return `${right.orderCode || right.groupId || 'order'}:${right.code || right.name}:${right.rightType || 'type'}`
}

function setLoadingKey(keys: typeof rtimeClaimingKeys, key: string, loading: boolean) {
  if (loading) {
    if (!keys.value.includes(key)) {
      keys.value = [...keys.value, key]
    }
    return
  }

  keys.value = keys.value.filter((item) => item !== key)
}

function isRtimeEquityLoading(row: MemberEquityRow) {
  return rtimeClaimingKeys.value.includes(getRtimeEquityKey(row))
}

function isWPlusRightLoading(right: MemberWPlusRight) {
  return wplusClaimingKeys.value.includes(getWPlusRightKey(right))
}

function hasRtimeClaimParams(row: MemberEquityRow) {
  return Boolean(row.gradeId && row.equityId)
}

function hasWPlusClaimParams(right: MemberWPlusRight) {
  return Boolean(right.orderCode && right.code && right.rightType)
}

function isClaimedEquity(row: MemberEquityRow) {
  return row.equityGainStatus === 5
}

function isCurrentGradeEquity(row: MemberEquityRow) {
  return Boolean(currentGrade.value && row.gradeId === currentGrade.value.gradeId)
}

function isClaimableEquity(row: MemberEquityRow) {
  return isCurrentGradeEquity(row) && row.canReceive
}

function canGainEquity(row: MemberEquityRow) {
  return isClaimableEquity(row)
}

function canReceiveWPlusRight(right: MemberWPlusRight) {
  return right.receiveStatus === 1
}

function getRtimeEquityStatus(row: MemberEquityRow): { label: string; type: TagType } {
  if (row.auto) {
    return { label: '自动生效', type: 'success' }
  }

  if (isClaimedEquity(row)) {
    return { label: '已领', type: 'warning' }
  }

  if (isClaimableEquity(row)) {
    return { label: '待领', type: 'primary' }
  }

  if (!row.auto && row.equityGainStatus === 2) {
    return { label: '查看', type: 'info' }
  }

  if (row.equityGainStatus === 4) {
    return { label: '已抢光', type: 'info' }
  }

  return { label: row.status && row.status !== '-' ? row.status : '不可领', type: 'info' }
}

function getWPlusStatusType(status: number): TagType {
  if (status === 1) {
    return 'primary'
  }

  if (status === 2 || status === 5 || status === 10) {
    return 'warning'
  }

  if (status === 3 || status === 8) {
    return 'success'
  }

  return 'info'
}

function getEquityCategory(row: MemberEquityRow) {
  const text = `${row.name} ${row.desc}`.trim()

  if (text.includes('影票') || text.includes('兑换券')) {
    return '影票权益'
  }

  if (text.includes('套餐') || text.includes('卖品')) {
    return '卖品权益'
  }

  if (text.includes('生日') || row.status.includes('生日')) {
    return '生日特权'
  }

  if (text.includes('折扣') || text.includes('折')) {
    return '折扣权益'
  }

  return ''
}

function getWPlusStatusText(status: number) {
  const map: Record<number, string> = {
    1: '待领取',
    2: '已领取',
    3: '已生效',
    4: '已过期',
    5: '去使用',
    8: '需实名',
    10: '生日专享'
  }

  return map[status] || `状态${status}`
}

async function loadRtimeData() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    gradeGroups.value = []
    signInCalendar.value = null
    rtimeError.value = '请先选择一个已登录的账号'
    return
  }

  rtimeLoading.value = true
  rtimeError.value = ''

  try {
    const [gradeResult, signResult] = await Promise.allSettled([
      fetchMemberGradeEquityList(account.ck, account.userIdentifier),
      fetchMemberSignInCalendar(account.ck, account.userIdentifier)
    ])

    if (gradeResult.status === 'fulfilled') {
      gradeGroups.value = gradeResult.value
      await accountsStore.updateAccountProfileSummary(account.id, {
        memberGradeName: currentGrade.value?.gradeName || '',
        growthValue: currentGrade.value?.memberGrowthVal ?? currentGrowthValue.value
      }).catch((error) => {
        logsStore.addLog('会员', account.phone, `账号会员摘要保存失败：${getErrorMessage(error, '保存失败')}`)
      })
      logsStore.addLog('会员', account.phone, `Rtime 会员数据加载完成，共 ${gradeResult.value.length} 个等级`)
    } else {
      gradeGroups.value = []
      rtimeError.value = getErrorMessage(gradeResult.reason, '获取等级权益失败')
      logsStore.addLog('会员', account.phone, `获取等级权益失败：${rtimeError.value}`)
    }

    if (signResult.status === 'fulfilled') {
      signInCalendar.value = signResult.value
      signInMessage.value = signResult.value.dataList.length > 0 ? '' : '暂无签到数据'
    } else {
      signInCalendar.value = null
      signInMessage.value = '暂无签到数据'
      logsStore.addLog('会员', account.phone, `会员签到加载失败：${getErrorMessage(signResult.reason, '获取失败')}`)
    }
  } finally {
    rtimeLoading.value = false
  }
}

async function loadSignInCalendar() {
  await loadRtimeData()
}

async function submitSignIn() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (hasSignedToday.value) {
    ElMessage.info('今日已签到')
    return
  }

  const beforeSignInSnapshot = getSignInSnapshot()

  signInSubmitting.value = true

  try {
    const signInResult = await submitMemberSignIn(account.ck)
    await loadSignInCalendar()
    const afterSignInSnapshot = getSignInSnapshot()

    if (isAlreadySignedSubmitResult(signInResult)) {
      ElMessage.info('今日已签到')
      logsStore.addLog('会员', account.phone, '会员签到刷新完成：今日已签到')
    } else if (isSignInSnapshotChanged(beforeSignInSnapshot, afterSignInSnapshot) || signInResult.successMessage) {
      const message = signInResult.successMessage || '签到成功'
      ElMessage.success(message)
      logsStore.addLog('会员', account.phone, `会员签到成功：${message}`)
    } else if (afterSignInSnapshot.signedToday) {
      ElMessage.info('今日已签到')
      logsStore.addLog('会员', account.phone, '会员签到刷新完成：今日已签到')
    } else {
      ElMessage.warning('签到未确认，请刷新后核对万达状态')
      logsStore.addLog('会员', account.phone, '会员签到未确认：接口返回无状态变化')
    }
  } catch (error) {
    const message = getErrorMessage(error, '签到失败')
    ElMessage.error(message)
    logsStore.addLog('会员', account.phone, `会员签到失败：${message}`)
  } finally {
    signInSubmitting.value = false
  }
}

async function loadWPlusProfileData() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    wplusProfile.value = null
    wplusError.value = '请先选择一个已登录的账号'
    return
  }

  wplusProfileLoading.value = true
  wplusError.value = ''

  try {
    const profile = await fetchWPlusProfile(account.ck, account.userIdentifier)
    wplusProfile.value = profile

    if (currentAccount.value) {
      currentAccount.value.isPayMember = profile.isPayMember
    }
    await accountsStore.updateAccountProfileSummary(account.id, {
      isPayMember: profile.isPayMember,
      wplusExpireAt: profile.expireAt
    }).catch((error) => {
      logsStore.addLog('会员', account.phone, `账号W+摘要保存失败：${getErrorMessage(error, '保存失败')}`)
    })

    logsStore.addLog('会员', account.phone, profile.isPayMember ? '当前账号是 W+ 会员' : '当前账号不是 W+ 会员')
  } catch (error) {
    wplusProfile.value = null
    wplusError.value = getErrorMessage(error, '检测 W+ 会员状态失败')
    logsStore.addLog('会员', account.phone, `检测 W+ 会员状态失败：${wplusError.value}`)
  } finally {
    wplusProfileLoading.value = false
  }
}

async function loadWPlusRightsData() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account?.ck) {
    wplusRightGroups.value = []
    return
  }

  wplusRightsLoading.value = true

  try {
    wplusRightGroups.value = await fetchWPlusRightGroups(account.ck, account.userIdentifier)
    logsStore.addLog('会员', account.phone, `W+ 权益加载完成，共 ${wplusRightGroups.value.length} 个权益组`)
  } catch (error) {
    wplusRightGroups.value = []
    logsStore.addLog('会员', account.phone, `W+ 权益加载失败：${getErrorMessage(error, '获取失败')}`)
  } finally {
    wplusRightsLoading.value = false
  }
}

async function loadWPlusData() {
  await loadWPlusProfileData()

  if (wplusProfile.value?.isPayMember) {
    await loadWPlusRightsData()
  } else {
    wplusRightGroups.value = []
  }
}

async function handleGainEquity(row: MemberEquityRow) {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (!row.gradeId || !row.equityId) {
    ElMessage.warning('当前权益缺少领取参数')
    return
  }

  if (!isClaimableEquity(row)) {
    ElMessage.info('当前权益不可领取')
    return
  }

  const loadingKey = getRtimeEquityKey(row)
  setLoadingKey(rtimeClaimingKeys, loadingKey, true)

  try {
    await gainMemberEquity(row.gradeId, row.equityId, account.ck, account.userIdentifier)
    ElMessage.success(`领取【${row.name}】成功！`)
    logsStore.addLog('会员', account.phone, `领取权益成功：${row.name}`)
    await loadRtimeData()
  } catch (error) {
    const message = getErrorMessage(error, '领取权益失败')
    ElMessage.error(message)
    logsStore.addLog('会员', account.phone, `领取权益失败：${message}`)
  } finally {
    setLoadingKey(rtimeClaimingKeys, loadingKey, false)
  }
}

async function handleGainAllRtimeEquities() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (!claimableRtimeRows.value.length) {
    ElMessage.info('没有可领取的权益')
    return
  }

  let successCount = 0
  let failCount = 0
  const successNames: string[] = []
  const failureMessages: string[] = []

  batchLoading.value = true

  try {
    for (const row of claimableRtimeRows.value) {
      try {
        await gainMemberEquity(row.gradeId, row.equityId, account.ck, account.userIdentifier)
        successCount += 1
        successNames.push(row.name)
      } catch (error) {
        failCount += 1
        const message = getErrorMessage(error, '领取失败')
        failureMessages.push(`${row.name}：${message}`)
      }
    }
  } finally {
    batchLoading.value = false
  }

  if (successCount > 0 && failCount === 0) {
    ElMessage.success(`等级权益领取完成：成功 ${successCount} 项${successNames.length ? `；成功：${successNames.join('、')}` : ''}`)
  } else if (successCount > 0) {
    ElMessage.warning(`等级权益领取完成：成功 ${successCount} 项，失败 ${failCount} 项${successNames.length ? `；成功：${successNames.join('、')}` : ''}`)
  } else {
    ElMessage.error(`领取失败：${failCount} 项均未成功${failureMessages.length ? `；${failureMessages.slice(0, 2).join('；')}` : ''}`)
  }

  logsStore.addLog(
    '会员',
    account.phone,
    `Rtime 一键领取完成：成功 ${successCount} 项，失败 ${failCount} 项${successNames.length ? `；成功：${successNames.join('、')}` : ''}${failureMessages.length ? `；失败：${failureMessages.join('；')}` : ''}`
  )
  await loadRtimeData()
}

async function handleReceiveWPlusRight(right: MemberWPlusRight) {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (right.receiveStatus !== 1) {
    ElMessage.info('当前 W+ 权益不可领取')
    return
  }

  if (!hasWPlusClaimParams(right)) {
    ElMessage.warning('当前 W+ 权益缺少领取参数，请刷新后重试')
    return
  }

  const loadingKey = getWPlusRightKey(right)
  setLoadingKey(wplusClaimingKeys, loadingKey, true)

  try {
    await receiveWPlusRight(account.ck, account.userIdentifier, right.orderCode, right.code, right.rightType)
    ElMessage.success(`领取【${right.name}】成功！`)
    logsStore.addLog('会员', account.phone, `W+ 权益领取成功：${right.name}`)
    await loadWPlusRightsData()
  } catch (error) {
    const message = getErrorMessage(error, '领取失败')
    ElMessage.error(message)
    logsStore.addLog('会员', account.phone, `W+ 权益领取失败：${message}`)
  } finally {
    setLoadingKey(wplusClaimingKeys, loadingKey, false)
  }
}

async function handleReceiveAllWPlusRights() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (!claimableWPlusRights.value.length) {
    ElMessage.info('没有可领取的权益')
    return
  }

  let successCount = 0
  let failCount = 0

  batchLoading.value = true

  try {
    for (const right of claimableWPlusRights.value) {
      try {
        await receiveWPlusRight(account.ck, account.userIdentifier, right.orderCode, right.code, right.rightType)
        successCount += 1
      } catch {
        failCount += 1
      }
    }
  } finally {
    batchLoading.value = false
  }

  if (successCount > 0 && failCount === 0) {
    ElMessage.success(`一键领取完成，成功领取 ${successCount} 项`)
  } else if (successCount > 0) {
    ElMessage.warning(`领取完成：成功 ${successCount} 项，失败 ${failCount} 项`)
  } else {
    ElMessage.error(`领取失败：${failCount} 项均未成功`)
  }

  logsStore.addLog('会员', account.phone, `W+ 一键领取完成：成功 ${successCount} 项，失败 ${failCount} 项`)
  await loadWPlusRightsData()
}

async function handleReceiveAllAccountsWPlusRights() {
  const accounts = accountsStore.accounts.filter((account) => account.ck)

  if (!accounts.length) {
    ElMessage.warning('没有已登录的万达账号')
    return
  }

  let successAccountCount = 0
  let failAccountCount = 0
  let skippedAccountCount = 0
  let totalSuccessCount = 0
  let memberFlagChanged = false

  batchLoading.value = true

  try {
    for (const account of accounts) {
      const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER

      try {
        const profile = await fetchWPlusProfile(account.ck, userIdentifier)
        if (account.isPayMember !== profile.isPayMember) {
          account.isPayMember = profile.isPayMember
          memberFlagChanged = true
        }
        await accountsStore.updateAccountProfileSummary(account.id, {
          isPayMember: profile.isPayMember,
          wplusExpireAt: profile.expireAt
        }).catch((error) => {
          logsStore.addLog('会员', account.phone, `账号W+摘要保存失败：${getErrorMessage(error, '保存失败')}`)
        })

        if (!profile.isPayMember) {
          skippedAccountCount += 1
          continue
        }

        const groups = await fetchWPlusRightGroups(account.ck, userIdentifier)
        const rights = groups.flatMap((group) => group.rightList).filter(canReceiveWPlusRight)

        if (!rights.length) {
          skippedAccountCount += 1
          continue
        }

        let accountSuccess = 0

        for (const right of rights) {
          try {
            await receiveWPlusRight(account.ck, userIdentifier, right.orderCode, right.code, right.rightType)
            accountSuccess += 1
            totalSuccessCount += 1
          } catch {
            continue
          }
        }

        if (accountSuccess > 0) {
          successAccountCount += 1
        }
      } catch (error) {
        const message = getErrorMessage(error, 'W+ 权益领取失败')

        if (isNonWPlusMessage(message)) {
          if (account.isPayMember) {
            account.isPayMember = false
            memberFlagChanged = true
          }
          skippedAccountCount += 1
          continue
        }

        failAccountCount += 1
      }
    }
  } finally {
    batchLoading.value = false
  }

  if (memberFlagChanged) {
    await accountsStore.saveAccounts().catch((error) => {
      logsStore.addLog('会员', currentAccount.value?.phone || '', `W+ 账号状态保存失败：${getErrorMessage(error, '保存失败')}`)
    })
  }

  const message = `所有账号处理完成：成功 ${successAccountCount} 个账号，跳过 ${skippedAccountCount} 个账号，失败 ${failAccountCount} 个账号，共领取 ${totalSuccessCount} 项权益`

  if (totalSuccessCount > 0) {
    ElMessage.success(message)
  } else {
    ElMessage.warning(message)
  }

  logsStore.addLog('会员', currentAccount.value?.phone || '', message)

  if (currentAccount.value?.ck) {
    await loadWPlusRightsData()
  }
}

function handleUseRtimeEquity(row: MemberEquityRow) {
  const category = getEquityCategory(row)

  if (category.includes('影票') || row.name.includes('影票') || row.name.includes('兑换券')) {
    ElMessage.info(`去使用【${row.name}】 - 请到购票页面选择影片后使用`)
    return
  }

  if (category.includes('卖品') || row.name.includes('卖品') || row.name.includes('套餐')) {
    ElMessage.info(`去使用【${row.name}】 - 请到卖品/活动页面使用`)
    return
  }

  ElMessage.info(`去使用【${row.name}】`)
}

function handleUseWPlusRight(right: MemberWPlusRight) {
  const redirectTo = Number(right.redirect?.to ?? 0)

  if (redirectTo === 2) {
    ElMessage.info(`去使用【${right.name}】 - 跳转购票页面`)
    return
  }

  if (redirectTo === 3) {
    ElMessage.info(`去使用【${right.name}】 - 跳转卖品页面`)
    return
  }

  if (right.redirect?.url) {
    ElMessage.info(`去使用【${right.name}】 - 跳转外部链接`)
    return
  }

  ElMessage.info(`去使用【${right.name}】`)
}

async function handleActivateWPlus() {
  const account = withUserIdentifier(currentAccount.value)

  if (!account) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  if (!exchangeCode.value.trim() || !exchangePassword.value.trim()) {
    ElMessage.warning('请输入卡号和密码')
    return
  }

  activateLoading.value = true
  exchangeResult.value = null

  try {
    const result = await activateWPlus(
      account.ck,
      account.userIdentifier,
      exchangeCode.value.trim(),
      exchangePassword.value.trim()
    )

    exchangeResult.value = result

    if (result.canOpen) {
      ElMessage.success('激活成功！')
      logsStore.addLog('会员', account.phone, 'W+ 激活成功')
      await loadWPlusData()
    } else {
      ElMessage.warning(result.bizMsg || '激活失败')
      logsStore.addLog('会员', account.phone, `W+ 激活失败：${result.bizMsg || '激活失败'}`)
    }
  } catch (error) {
    const message = getErrorMessage(error, '激活请求失败')
    ElMessage.error(message)
    logsStore.addLog('会员', account.phone, `W+ 激活失败：${message}`)
  } finally {
    activateLoading.value = false
  }
}

function handleOpenH5Dialog() {
  if (!currentAccount.value?.ck) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  h5DialogVisible.value = true
}

function handleH5CommonPageChange(value: string) {
  h5Url.value = value
}

async function handleOpenH5Page() {
  const account = currentAccount.value
  const url = h5Url.value.trim()

  if (!account?.ck) {
    ElMessage.warning('请先选择一个已登录的账号')
    return
  }

  try {
    const parsed = new URL(url)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
  } catch {
    ElMessage.warning('请输入有效的 H5 网址')
    return
  }

  try {
    const result = await window.wandaApp?.openWandaH5Window({
      url,
      token: account.ck,
      title: '万达 H5 工具'
    })

    if (!result?.ok) {
      ElMessage.error(result?.error || '打开 H5 工具失败')
      return
    }

    h5DialogVisible.value = false
    logsStore.addLog('会员', account.phone, `打开 H5 工具：${url}`)
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '打开 H5 工具失败'))
  }
}

function refreshCurrentTab() {
  if (activeTab.value === 'rtime') {
    void loadRtimeData()
    return
  }

  void loadWPlusData()
}

watch(
  () => accountsStore.currentAccountId,
  () => {
    exchangeResult.value = null
    if (activeTab.value === 'rtime') {
      void loadRtimeData()
    } else {
      void loadWPlusData()
    }
  }
)

watch(activeTab, (tab) => {
  if (!hasCurrentAccount.value) {
    return
  }

  if (tab === 'rtime') {
    void loadRtimeData()
  } else {
    void loadWPlusData()
  }
})

onMounted(() => {
  if (hasCurrentAccount.value) {
    void loadRtimeData()
    void loadWPlusData()
  }
})
</script>

<template>
  <section class="page-container">
    <section v-if="!hasCurrentAccount" class="no-account-hint">
      <el-empty description="请先选择一个已登录的账号" :image-size="88" />
    </section>

    <template v-else>
      <section class="member-summary-grid" aria-label="会员摘要">
        <article class="member-summary-card member-summary-card--blue">
          <span>当前账号</span>
          <strong>{{ currentAccount?.phone || '-' }}</strong>
          <em>{{ currentAccount?.statusText || '登录成功' }}</em>
        </article>
        <article class="member-summary-card member-summary-card--green">
          <span>Rtime等级</span>
          <strong>{{ currentGrade?.gradeName || '-' }}</strong>
          <em>成长值 {{ currentGrowthValue }}</em>
        </article>
        <article class="member-summary-card member-summary-card--amber">
          <span>待领取权益</span>
          <strong>{{ totalClaimableMemberRights }}</strong>
          <em>Rtime {{ claimableRtimeRows.length }} / W+ {{ claimableWPlusRights.length }}</em>
        </article>
        <article class="member-summary-card">
          <span>W+状态</span>
          <strong>{{ wplusStatusTextSafe }}</strong>
          <em>{{ wplusStatusHintSafe }}</em>
        </article>
      </section>

      <div class="vip-subtabs">
        <div class="vip-subtab-list">
          <div
            :class="['vip-subtab', { 'vip-subtab--active': activeTab === 'rtime' }]"
            @click="activeTab = 'rtime'"
          >
            <el-icon><Medal /></el-icon>
            <span>Rtime会员</span>
          </div>
          <div
            :class="['vip-subtab', { 'vip-subtab--active': activeTab === 'wplus' }]"
            @click="activeTab = 'wplus'"
          >
            <el-icon><Trophy /></el-icon>
            <span>W+会员</span>
          </div>
        </div>

        <div class="vip-subtab-meta">
          <span>当前账号：{{ currentAccount?.phone || '-' }}</span>
          <el-button
            size="small"
            :icon="Refresh"
            :loading="activeTab === 'rtime' ? rtimeLoading : wplusProfileLoading || wplusRightsLoading"
            @click="refreshCurrentTab"
          >
            刷新当前
          </el-button>
          <el-button size="small" :icon="Link" @click="handleOpenH5Dialog">
            H5工具
          </el-button>
        </div>
      </div>

      <section v-if="activeTab === 'rtime'" class="vip-panel vip-panel--rtime">
        <div v-if="rtimeLoading" class="loading-wrapper">
          <el-skeleton :rows="5" animated />
        </div>

        <template v-else>
          <div class="vip-info-card">
            <div class="vip-info-header">
              <el-icon size="28"><Medal /></el-icon>
              <span class="vip-title">Rtime 会员信息</span>
              <el-button
                type="warning"
                size="small"
                class="gain-all-btn"
                :disabled="!hasClaimableRtime"
                :loading="batchLoading"
                @click="handleGainAllRtimeEquities"
              >
                领取全部会员等级权益
              </el-button>
            </div>

            <div class="base-desc">
              <el-descriptions :column="2" border>
                <el-descriptions-item label="当前账号">
                  {{ currentAccount?.phone || '-' }}
                </el-descriptions-item>
                <el-descriptions-item label="当前等级">
                  <span class="growth-val">{{ currentGrade?.gradeName || '-' }}</span>
                  <el-tag
                    v-if="monthExpiredGrowth > 0 && monthExpireDowngradeName"
                    size="small"
                    type="danger"
                    class="month-expire-tag"
                  >
                    本月将失效 {{ monthExpiredGrowth }} 成长值，届时降至 {{ monthExpireDowngradeName }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="成长值">
                  <span class="growth-val">{{ currentGrowthValue }}</span>
                </el-descriptions-item>
                <el-descriptions-item label="下一级">
                  {{ nextGrade?.gradeName || '满级' }}
                </el-descriptions-item>
              </el-descriptions>
            </div>

            <div class="signin-section">
              <div class="signin-header">
                <el-icon><Check /></el-icon>
                <span>每日签到</span>
                <span class="signin-streak">
                  {{ signInTitle }}
                  <span v-if="signInStreakText" class="signin-streak-total">{{ signInStreakText }}</span>
                </span>
                <div class="signin-actions">
                  <el-button
                    type="warning"
                    size="small"
                    class="refresh-btn-inline is-signin-primary"
                    :loading="signInSubmitting"
                    :disabled="!hasCurrentAccount || signInSubmitting || hasSignedToday"
                    @click="submitSignIn"
                  >
                    {{ hasSignedToday ? '今日已签' : '签到' }}
                  </el-button>
                  <el-button
                    type="primary"
                    size="small"
                    class="refresh-btn-inline"
                    :icon="Refresh"
                    :disabled="signInSubmitting"
                    @click="loadSignInCalendar"
                  >
                    刷新签到
                  </el-button>
                </div>
              </div>

              <div v-if="signInDays.length" class="signin-days">
                <div
                  v-for="day in signInDays"
                  :key="`${day.sortOrder}-${day.date}`"
                  class="signin-day"
                >
                  <div
                    :class="[
                      'signin-day-inner',
                      {
                        'signin-day--done': day.state === 1,
                        'signin-day--today': day.todayFlag,
                        'sign-day--done': day.state === 1,
                        'sign-day--today': day.todayFlag
                      }
                    ]"
                  >
                    <img v-if="day.iconUrl" :src="day.iconUrl" class="signin-icon" alt="">
                    <div v-else class="signin-icon signin-icon--placeholder">{{ day.day || '-' }}</div>
                    <span class="signin-day-label">{{ day.content || day.date || day.day }}</span>
                    <el-icon v-if="day.state === 1" class="signin-check"><SuccessFilled /></el-icon>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="currentGrade" class="growth-stage-progress">
              <div class="stage-labels">
                <span
                  v-for="group in sortedGradeGroups"
                  :key="group.gradeId"
                  :class="[
                    'stage-label',
                    {
                      'stage-label--current': isCurrentGrade(group),
                      'stage-label--passed': isPassedGrade(group)
                    }
                  ]"
                >
                  {{ group.gradeName }}
                </span>
              </div>

              <div class="stage-bar-wrap">
                <el-progress
                  :percentage="progressPercentage"
                  color="var(--wanda-primary)"
                  :stroke-width="16"
                  :show-text="false"
                />
                <div class="stage-pointer-dot" :style="{ left: `${progressPercentage}%` }"></div>
              </div>

              <div class="stage-footer">
                <div class="growth-value-row">
                  <span class="growth-value-num">{{ currentGrade.memberGrowthVal ?? '--' }}</span>
                  <span class="growth-sep">/</span>
                  <span class="growth-target">{{ isMaxGrade ? '满级' : nextGrade?.growthMinVal ?? maxGrowthValue }}</span>
                  <el-button
                    type="primary"
                    size="small"
                    class="refresh-btn-inline"
                    :icon="Refresh"
                    :loading="rtimeLoading"
                    @click="loadRtimeData"
                  >
                    刷新等级权益
                  </el-button>
                </div>
                <span v-if="currentGrade && !isMaxGrade" class="stage-hint">
                  还差 <strong>{{ needGrowthToNext }}</strong> 成长值升级到
                  <strong class="next-grade-name">{{ nextGrade?.gradeName }}</strong>
                </span>
              </div>
            </div>
          </div>

          <div v-if="orderedGradeGroups.length" class="grade-cards">
            <div
              v-for="group in orderedGradeGroups"
              :key="group.gradeId"
              :class="[
                'grade-card',
                {
                  'grade-card--current': isCurrentGrade(group),
                  'grade-card--passed': isPassedGrade(group)
                }
              ]"
            >
              <div class="grade-header">
                <div class="grade-info">
                  <span class="grade-name" :style="{ color: group.gradeNameColor || 'var(--wanda-primary)' }">
                    {{ group.gradeName }}
                  </span>
                  <span class="grade-range">
                    {{ group.growthMinVal }}{{ group.growthMaxVal != null ? ` - ${group.growthMaxVal}` : '+' }}
                  </span>
                </div>

                <div class="grade-badge">
                  <el-tag v-if="isCurrentGrade(group)" type="warning" effect="dark">当前等级</el-tag>
                  <el-tag v-else-if="isPassedGrade(group)" type="info">已超越</el-tag>
                  <el-tag v-else type="success">未达到</el-tag>
                </div>
              </div>

              <div v-if="group.guidingText" class="grade-guiding">{{ group.guidingText }}</div>

              <div v-if="group.equities.length" class="equity-table-wrap">
                <div class="section-subtitle">
                  <el-icon><CollectionTag /></el-icon>
                  <span>权益列表 ({{ group.equities.length }})</span>
                </div>

                <el-table :data="group.equities" size="small" stripe>
                  <el-table-column label="权益名称" prop="name" min-width="140">
                    <template #default="{ row }">
                      <el-tooltip :content="row.desc" placement="top" show-after="200" effect="light">
                        <span>{{ row.name }}</span>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="面额" width="80" align="center">
                    <template #default="{ row }">
                      <span>{{ row.amount || '-' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="数量" width="60" align="center">
                    <template #default="{ row }">
                      <span>{{ row.count && row.count !== '-' ? `x${row.count}` : '-' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="分类" width="100" align="center">
                    <template #default="{ row }">
                      <el-tag v-if="getEquityCategory(row)" size="small" type="info">
                        {{ getEquityCategory(row) }}
                      </el-tag>
                      <span v-else>-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="90" align="center">
                    <template #default="{ row }">
                      <el-tag size="small" :type="getRtimeEquityStatus(row).type">
                        {{ getRtimeEquityStatus(row).label }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="120" align="center">
                    <template #default="{ row }">
                      <span v-if="row.auto">-</span>
                      <img
                        v-else-if="isClaimedEquity(row) && row.useEquityIconUrl"
                        :src="row.useEquityIconUrl"
                        class="equity-action-icon"
                        alt="去使用"
                      >
                      <el-button
                        v-else-if="isClaimedEquity(row)"
                        type="warning"
                        size="small"
                        round
                        @click="handleUseRtimeEquity(row)"
                      >
                        去使用
                      </el-button>
                      <img
                        v-else-if="isClaimableEquity(row) && row.getEquityIconUrl"
                        :src="row.getEquityIconUrl"
                        class="equity-action-icon"
                        alt="领取"
                        @click="handleGainEquity(row)"
                      >
                      <el-button
                        v-else-if="isClaimableEquity(row)"
                        type="primary"
                        size="small"
                        round
                        :loading="isRtimeEquityLoading(row)"
                        :disabled="batchLoading"
                        @click="handleGainEquity(row)"
                      >
                        领取
                      </el-button>
                      <span v-else>-</span>
                    </template>
                  </el-table-column>
                </el-table>
              </div>

              <div v-if="group.highEquities.length" class="high-equity-table-wrap">
                <div class="section-subtitle section-subtitle--compact">
                  <el-icon><Star /></el-icon>
                  <span>升级解锁 ({{ group.highEquities.length }})</span>
                </div>

                <el-table :data="group.highEquities" size="small" stripe>
                  <el-table-column label="权益名称" prop="name" min-width="140" />
                  <el-table-column label="面额" width="80" align="center">
                    <template #default="{ row }">
                      <span>{{ row.amount || '-' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="数量" width="60" align="center">
                    <template #default="{ row }">
                      <span>{{ row.count && row.count !== '-' ? `x${row.count}` : '-' }}</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="状态" width="80" align="center">
                    <template #default>
                      <el-tag size="small" type="info">未解锁</el-tag>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </div>

          <el-empty v-else description="暂无Rtime会员信息" :image-size="60" />

          <div v-if="rtimeError" class="error-card">
            <el-alert :title="rtimeError" type="error" show-icon :closable="false" />
            <el-button type="primary" :icon="Refresh" class="retry-button" @click="loadRtimeData">重试</el-button>
          </div>
        </template>
      </section>

      <section v-else class="vip-panel vip-panel--wplus">
        <div class="vip-exchange-card">
          <div class="vip-info-header">
            <el-icon><Trophy /></el-icon>
            <span class="vip-title">W+ 激活兑换</span>
          </div>

          <div class="exchange-form">
            <el-input v-model="exchangeCode" placeholder="请输入卡号" clearable size="large" class="exchange-input" />
            <el-input
              v-model="exchangePassword"
              placeholder="请输入密码"
              clearable
              show-password
              size="large"
              class="exchange-input"
            />
            <el-button
              type="primary"
              :loading="activateLoading"
              :disabled="!exchangeCode || !exchangePassword"
              @click="handleActivateWPlus"
            >
              激活
            </el-button>
          </div>

          <div
            v-if="exchangeResult"
            :class="[
              'exchange-result',
              {
                'exchange-success': exchangeResult.canOpen,
                'exchange-fail': !exchangeResult.canOpen
              }
            ]"
          >
            <el-icon v-if="exchangeResult.canOpen"><SuccessFilled /></el-icon>
            <el-icon v-else><CloseBold /></el-icon>
            <span>{{ exchangeResult.bizMsg }}</span>
          </div>
        </div>

        <div class="vip-info-card">
          <div class="vip-info-header">
            <el-icon size="28"><Trophy /></el-icon>
            <span class="vip-title">W+ 会员信息</span>
            <el-button
              type="warning"
              size="small"
              :icon="Check"
              :loading="batchLoading"
              :disabled="!hasClaimableWPlus"
              class="receive-all-button"
              @click="handleReceiveAllWPlusRights"
            >
              一键领取
            </el-button>
            <el-button
              type="primary"
              size="small"
              plain
              :icon="Check"
              :loading="batchLoading"
              @click="handleReceiveAllAccountsWPlusRights"
            >
              领取所有账号
            </el-button>
          </div>

          <div v-if="wplusProfile || wplusProfileLoading" class="wplus-section">
            <div v-if="wplusProfileLoading" class="loading-wrapper">
              <el-skeleton :rows="5" animated />
            </div>

            <template v-else-if="wplusProfile">
              <div v-if="wplusRightGroups.length" class="wplus-activity-section">
                <div class="section-subtitle section-subtitle--spaced">
                  <el-icon><CollectionTag /></el-icon>
                  <span>光影活动 ({{ totalWPlusRights }})</span>
                </div>

                <div
                  v-for="group in wplusRightGroups"
                  :key="group.groupId"
                  class="right-group-card"
                >
                  <div class="right-group-header">
                    <img v-if="group.iconUrl" :src="group.iconUrl" class="right-group-icon" alt="">
                    <span class="right-group-name">{{ group.name }}</span>
                    <el-tag v-if="group.verifyStatus === 1" type="warning" size="small" class="verify-status-tag">
                      需实名认证
                    </el-tag>
                  </div>

                  <div class="right-list">
                    <div
                      v-for="right in group.rightList"
                      :key="right.code"
                      class="right-item"
                    >
                      <img v-if="right.icon" :src="right.icon" class="right-item-icon" alt="">
                      <div class="right-item-info">
                        <div class="right-item-top">
                          <span class="right-item-name">{{ right.name }}</span>
                          <el-tag v-if="right.tag" size="small" type="primary" effect="dark" class="right-item-tag">
                            {{ right.tag }}
                          </el-tag>
                        </div>
                        <span class="right-item-subtitle">{{ right.subtitle }}</span>
                        <span v-if="right.deadline" class="right-item-deadline">有效期至 {{ right.deadline }}</span>
                      </div>
                      <div class="right-item-action">
                        <el-button
                          v-if="right.receiveStatus === 5"
                          type="warning"
                          size="small"
                          round
                          @click="handleUseWPlusRight(right)"
                        >
                          去使用
                        </el-button>
                        <el-button
                          v-else-if="canReceiveWPlusRight(right)"
                          type="primary"
                          size="small"
                          round
                          :loading="isWPlusRightLoading(right)"
                          :disabled="batchLoading"
                          @click="handleReceiveWPlusRight(right)"
                        >
                          领取
                        </el-button>
                        <el-tag v-else :type="getWPlusStatusType(right.receiveStatus)" size="small">
                          {{ getWPlusStatusText(right.receiveStatus) }}
                        </el-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="wplusRightsLoading" class="loading-wrapper">
                <el-skeleton :rows="3" animated />
              </div>

              <el-empty
                v-else-if="!wplusRightGroups.length"
                :description="wplusEmptyDescription"
                :image-size="60"
              />
            </template>

            <el-empty v-else :description="wplusEmptyDescription" :image-size="60" />
          </div>

          <div class="wplus-actions">
            <el-button type="primary" :icon="Refresh" :loading="wplusProfileLoading" @click="refreshCurrentTab">
              刷新
            </el-button>
          </div>
        </div>

        <div v-if="wplusError" class="error-card">
          <el-alert :title="wplusError" type="error" show-icon :closable="false" />
        </div>
      </section>
    </template>

    <el-dialog v-model="h5DialogVisible" title="H5工具" width="520px" append-to-body>
      <el-form class="h5-tool-form" label-width="92px">
        <el-form-item label="常用页面">
          <el-select v-model="selectedH5Url" class="h5-tool-select" @change="handleH5CommonPageChange">
            <el-option
              v-for="page in H5_COMMON_PAGES"
              :key="page.url"
              :label="page.label"
              :value="page.url"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="页面链接">
          <el-input v-model="h5Url" clearable placeholder="https://..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="h5DialogVisible = false">取消</el-button>
          <el-button type="primary" :icon="Link" @click="handleOpenH5Page">打开</el-button>
        </span>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.page-container {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-page, var(--app-bg));
}

.no-account-hint {
  grid-row: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
}

.member-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.member-summary-card {
  min-width: 0;
  height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
}

.member-summary-card span,
.member-summary-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-summary-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 22px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-summary-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.member-summary-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.member-summary-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
}

.vip-subtabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
  flex-shrink: 0;
}

.vip-subtab-list {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vip-subtab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  min-width: 118px;
  padding: 0 16px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--bg-secondary, #f8fafc);
  transition: color 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
  user-select: none;
}

.vip-subtab:hover {
  color: var(--wanda-primary);
  border-color: var(--summary-blue-border);
  background: var(--panel-soft-bg);
}

.vip-subtab--active {
  color: var(--wanda-primary);
  border-color: var(--summary-blue-border);
  background: var(--app-accent-soft);
  box-shadow: inset 0 0 0 1px rgb(45 127 249 / 16%);
}

.vip-subtab-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  white-space: nowrap;
}

.vip-subtab-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  overflow-y: auto;
}

.vip-exchange-card {
  min-width: 0;
  background: var(--bg-primary, var(--app-surface));
  border-radius: 8px;
  border: 1px solid var(--app-border);
  padding: 16px;
  flex-shrink: 0;
  box-shadow: var(--shadow-panel);
}

.vip-info-card {
  min-width: 0;
  background: var(--bg-primary, var(--app-surface));
  border-radius: 8px;
  border: 1px solid var(--app-border);
  padding: 16px;
  box-shadow: var(--shadow-panel);
}

.vip-info-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 34px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--app-border);
  color: var(--wanda-primary);
}

.gain-all-btn {
  margin-left: auto;
}

.vip-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary, var(--app-text));
}

.base-desc {
  margin-bottom: 14px;
}

.base-desc :deep(.el-descriptions__body) {
  border-radius: 8px;
  overflow: hidden;
}

.base-desc :deep(.el-descriptions__label.el-descriptions__cell) {
  color: var(--text-secondary, var(--app-muted));
  background: var(--table-header-bg);
}

.base-desc :deep(.el-descriptions__content.el-descriptions__cell) {
  color: var(--text-primary, var(--app-text));
}

.growth-val {
  color: var(--wanda-primary);
  font-weight: 600;
  font-size: var(--font-size-base);
}

.month-expire-tag {
  margin-left: 8px;
  vertical-align: middle;
}

.refresh-btn-inline {
  margin-left: auto;
}

.grade-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grade-card {
  background: var(--bg-primary, var(--app-surface));
  border-radius: 8px;
  border: 1px solid var(--app-border);
  padding: 16px;
  box-shadow: var(--shadow-panel);
}

.grade-card--current {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
  box-shadow: 0 0 0 1px rgb(45 127 249 / 12%), 0 4px 14px rgb(45 127 249 / 8%);
}

.grade-card--passed {
  background: #fbfcfe;
}

.grade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.grade-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.grade-name {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.next-grade-name {
  color: var(--wanda-primary);
}

.grade-range {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: var(--bg-secondary);
  padding: 2px 10px;
  border-radius: 12px;
}

.grade-guiding {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--panel-soft-bg);
}

.equity-table-wrap,
.high-equity-table-wrap {
  margin-top: 8px;
}

.section-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.section-subtitle--compact {
  margin-top: 12px;
}

.section-subtitle--spaced {
  margin-top: 16px;
}

.receive-all-button {
  margin-left: auto;
}

.retry-button {
  margin-top: 12px;
}

.wplus-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.exchange-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.h5-tool-form,
.h5-tool-select {
  width: 100%;
}

.exchange-input {
  flex: 1;
}

.exchange-result {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.exchange-success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.exchange-fail {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

.wplus-section {
  min-width: 0;
}

.wplus-activity-section {
  min-width: 0;
}

.right-group-card {
  background: var(--warning-soft-bg);
  border: 1px solid var(--summary-amber-border);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 12px;
}

.right-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--summary-amber-border);
}

.right-group-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  border-radius: 4px;
}

.right-group-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--el-color-warning);
}

.verify-status-tag {
  margin-left: 8px;
}

.right-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}

.right-item {
  min-width: 0;
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--app-surface);
  border-radius: 8px;
  border: 1px solid var(--app-border);
  box-shadow: var(--shadow-panel);
}

.right-item-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 8px;
  flex-shrink: 0;
}

.equity-action-icon {
  width: 80px;
  height: 28px;
  object-fit: contain;
  cursor: pointer;
}

.right-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.right-item-name {
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-item-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.right-item-tag {
  flex-shrink: 0;
}

.right-item-subtitle {
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-item-deadline {
  overflow: hidden;
  font-size: var(--font-size-xs);
  color: var(--el-color-warning);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-item-action {
  width: 72px;
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
}

.loading-wrapper {
  padding: var(--spacing-md);
}

.error-card {
  text-align: center;
  padding: var(--spacing-xl);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
}

.growth-stage-progress {
  padding: 4px 4px 0;
}

.stage-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 4px;
  overflow-x: auto;
}

.stage-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
  transition: color 0.2s, transform 0.2s;
}

.stage-label--current {
  font-weight: 800;
  color: var(--wanda-primary) !important;
}

.stage-label--passed {
  opacity: 0.65;
}

.stage-bar-wrap {
  position: relative;
  margin: 10px 0 6px;
}

.stage-pointer-dot {
  position: absolute;
  top: 50%;
  left: 0;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid var(--wanda-primary);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 4px rgb(0 0 0 / 15%);
  z-index: 1;
}

.growth-value-row {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.growth-value-num {
  font-size: 24px;
  font-weight: 700;
  color: var(--wanda-primary);
  line-height: 1;
}

.growth-sep {
  font-size: 14px;
  color: var(--text-secondary);
}

.growth-target {
  font-size: 14px;
  color: var(--text-secondary);
  font-weight: 500;
}

.stage-footer {
  text-align: center;
}

.stage-hint {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.signin-section {
  background: var(--summary-amber-bg);
  border: 1px solid var(--summary-amber-border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.signin-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-base);
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 12px;
}

.signin-streak {
  margin-left: auto;
  font-size: var(--font-size-sm);
  color: #f56c6c;
  font-weight: 700;
}

.signin-streak-total {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: 400;
}

.signin-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  margin-left: 12px;
}

.signin-actions .refresh-btn-inline {
  margin-left: 0;
}

.signin-actions .el-button + .el-button {
  margin-left: 0;
}

.is-signin-primary {
  min-width: 76px;
}

.signin-days {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
}

.signin-day {
  text-align: center;
}

.signin-day-inner {
  min-height: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  position: relative;
  padding: 8px 6px;
  border: 1px solid #fde7bd;
  border-radius: 8px;
  background: #fff;
}

.signin-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: contain;
}

.signin-icon--placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #e6a23c;
  border: 1px dashed #f0d9a0;
}

.signin-day--done .signin-icon {
  opacity: 0.6;
}

.signin-day--today .signin-icon {
  opacity: 1;
  box-shadow: 0 0 0 2px #e6a23c;
}

.signin-day-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.signin-day--today .signin-day-label {
  color: #e6a23c;
  font-weight: 700;
}

.signin-check {
  position: absolute;
  top: -4px;
  right: 2px;
  font-size: 14px;
}

.vip-info-card :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

.vip-info-card :deep(.el-table th.el-table__cell) {
  color: var(--text-secondary, var(--app-muted));
  background: var(--table-header-bg);
}

.vip-info-card :deep(.el-table__cell) {
  padding: 9px 0;
}

@media (max-width: 1360px) {
  .member-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .member-summary-card {
    height: 96px;
  }

  .vip-subtabs {
    align-items: flex-start;
    flex-direction: column;
  }

  .vip-subtab-meta {
    width: 100%;
    justify-content: space-between;
  }

  .exchange-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .exchange-form .el-button {
    width: 100%;
  }
}

@media (max-width: 980px) {
  .member-summary-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .vip-subtab-list,
  .vip-subtab {
    width: 100%;
  }

  .vip-info-header {
    align-items: flex-start;
  }

  .grade-header {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-height: 720px) {
  .page-container {
    gap: 10px;
    padding: 12px;
  }

  .member-summary-card {
    height: 88px;
    padding: 12px 14px;
  }

  .member-summary-card strong {
    font-size: 20px;
  }

  .vip-info-card,
  .vip-exchange-card,
  .grade-card {
    padding: 14px;
  }

  .signin-icon {
    width: 32px;
    height: 32px;
  }
}
</style>

<!--
  Contract compatibility markers:
  v-model="activeTab"
  @click="loadMemberData"
  memberMessage
  gradeRows
  wplusRows
-->
