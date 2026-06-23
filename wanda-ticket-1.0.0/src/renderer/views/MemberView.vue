<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Medal, Refresh, Trophy } from '@element-plus/icons-vue'

import {
  fetchMemberGradeEquityList,
  fetchMemberSignInCalendar,
  fetchWPlusDetail,
  gainMemberEquity,
  type MemberGradeGroup,
  type MemberEquityRow,
  type MemberSignInCalendar
} from '@renderer/services/featureApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const activeTab = ref('rtime')
const gradeGroups = ref<MemberGradeGroup[]>([])
const wplusRows = ref<MemberEquityRow[]>([])
const signInCalendar = ref<MemberSignInCalendar | null>(null)
const loading = ref(false)
const memberMessage = ref('')
const signInMessage = ref('')

const currentAccountText = computed(() => accountsStore.currentAccount?.phone || '未选择账号')

const currentGradeRecord = computed(() => {
  return gradeGroups.value.find((g) => g.isCurrent) || gradeGroups.value[0] || null
})

const currentGrade = computed(() => currentGradeRecord.value?.gradeName || '-')
const currentGrowthValue = computed(() => currentGradeRecord.value?.growthValue || 0)

const nextGradeRecord = computed(() => {
  const index = gradeGroups.value.findIndex((g) => g.isCurrent)
  if (index >= 0 && index < gradeGroups.value.length - 1) {
    return gradeGroups.value[index + 1]
  }
  return null
})

const progressPercentage = computed(() => {
  if (!nextGradeRecord.value) return 100
  const need = currentGradeRecord.value?.needGrowthValue || 0
  if (need === 0) return 100
  const current = currentGrowthValue.value
  const total = current + need
  return Math.min(100, (current / total) * 100)
})

const signInDays = computed(() => signInCalendar.value?.dataList ?? [])
const signInTitle = computed(() => {
  if (!signInCalendar.value) {
    return signInMessage.value || '暂无签到数据'
  }

  const streakText =
    signInCalendar.value.signInStreak > 0 ? `（累计 ${signInCalendar.value.signInStreak} 天）` : ''

  return `连续签到 ${signInCalendar.value.consecutiveDays} 天${streakText}`
})

function getCurrentAccount() {
  const account = accountsStore.currentAccount

  if (!account?.ck) {
    gradeGroups.value = []
    wplusRows.value = []
    signInCalendar.value = null
    signInMessage.value = ''
    memberMessage.value = '请选择已登录的万达账号'
    return null
  }

  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
}

async function loadMemberData() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  loading.value = true
  memberMessage.value = ''

  try {
    const [gradeResult, wplusResult, signInResult] = await Promise.allSettled([
      fetchMemberGradeEquityList(account.ck, account.userIdentifier),
      fetchWPlusDetail(account.ck, account.userIdentifier),
      fetchMemberSignInCalendar(account.ck, account.userIdentifier)
    ])

    if (gradeResult.status === 'fulfilled') {
      gradeGroups.value = gradeResult.value
    } else {
      gradeGroups.value = []
      memberMessage.value = String(gradeResult.reason)
      logsStore.addLog('会员', account.phone, `Rtime会员加载失败：${gradeResult.reason}`)
    }

    if (wplusResult.status === 'fulfilled') {
      wplusRows.value = wplusResult.value
    } else {
      wplusRows.value = []
      logsStore.addLog('会员', account.phone, `W+会员加载失败：${wplusResult.reason}`)
    }

    if (signInResult.status === 'fulfilled') {
      signInCalendar.value = signInResult.value
      signInMessage.value = signInResult.value.dataList.length > 0 ? '' : '暂无签到数据'
    } else {
      signInCalendar.value = null
      signInMessage.value = signInResult.reason instanceof Error ? signInResult.reason.message : '会员签到加载失败'
      logsStore.addLog('会员', account.phone, `会员签到加载失败：${signInMessage.value}`)
    }

    if (!memberMessage.value) {
      memberMessage.value =
        gradeGroups.value.length || wplusRows.value.length
          ? ''
          : '暂无会员权益数据'
    }
    logsStore.addLog('会员', account.phone, `会员数据加载完成：Rtime ${gradeGroups.value.length} 个等级，W+ ${wplusRows.value.length} 条权益`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '会员数据加载失败'
    gradeGroups.value = []
    wplusRows.value = []
    memberMessage.value = message
    logsStore.addLog('会员', account.phone, `会员数据加载失败：${message}`)
  } finally {
    loading.value = false
  }
}

async function loadSignInCalendar() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  loading.value = true
  signInMessage.value = ''

  try {
    signInCalendar.value = await fetchMemberSignInCalendar(account.ck, account.userIdentifier)
    signInMessage.value = signInCalendar.value.dataList.length > 0 ? '' : '暂无签到数据'
    logsStore.addLog('会员', account.phone, `会员签到加载成功：${signInCalendar.value.dataList.length} 天`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '会员签到加载失败'
    signInCalendar.value = null
    signInMessage.value = message
    logsStore.addLog('会员', account.phone, `会员签到加载失败：${message}`)
  } finally {
    loading.value = false
  }
}

async function handleGainEquity(row: MemberEquityRow) {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  if (!row.gradeId || !row.equityId) {
    ElMessage.warning('当前权益缺少领取参数')
    return
  }

  const confirmed = await ElMessageBox.confirm(`确认领取 ${row.name}？`, '领取会员权益', {
    type: 'warning',
    confirmButtonText: '领取',
    cancelButtonText: '取消'
  }).catch(() => false)

  if (!confirmed) {
    return
  }

  loading.value = true

  try {
    await gainMemberEquity(row.gradeId, row.equityId, account.ck, account.userIdentifier)
    ElMessage.success('领取成功')
    logsStore.addLog('会员', account.phone, `领取权益成功：${row.name}`)
    await loadMemberData()
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '领取权益失败'
    ElMessage.error(message)
    logsStore.addLog('会员', account.phone, `领取权益失败：${message}`)
  } finally {
    loading.value = false
  }
}

function handleGainFirstEquity() {
  const row = gradeGroups.value.flatMap((g) => g.equities).find((item) => item.gradeId && item.equityId)

  if (!row) {
    ElMessage.warning('暂无可领取的 Rtime 权益')
    return
  }

  void handleGainEquity(row)
}

onMounted(() => {
  void loadMemberData()
})

watch(
  () => accountsStore.currentAccountId,
  () => {
    void loadMemberData()
  }
)
</script>

<template>
  <section class="member-page">
    <el-tabs v-model="activeTab" class="member-tabs">
      <el-tab-pane label="Rtime会员" name="rtime" />
      <el-tab-pane label="W+会员" name="wplus" />
    </el-tabs>

    <section class="member-panel">
      <header class="section-header">
        <span>
          <el-icon><Medal /></el-icon>
          {{ activeTab === 'rtime' ? 'Rtime 会员信息' : 'W+ 会员信息' }}
        </span>
        <el-button type="warning" :icon="Refresh" :loading="loading" @click="handleGainFirstEquity">一键领取</el-button>
      </header>

      <el-descriptions class="member-desc" border :column="2">
        <el-descriptions-item label="用户名">{{ currentAccountText }}</el-descriptions-item>
        <el-descriptions-item label="当前等级">{{ currentGrade }}</el-descriptions-item>
      </el-descriptions>

      <section class="sign-panel">
        <div class="sign-title">
          <span>每日签到</span>
          <strong>{{ signInTitle }}</strong>
          <el-button size="small" link :icon="Refresh" :loading="loading" @click="loadSignInCalendar">刷新签到</el-button>
        </div>
        <div v-if="signInDays.length" class="sign-track">
          <el-tooltip
            v-for="day in signInDays"
            :key="day.sortOrder || day.date || day.day"
            :content="day.content || day.date || day.day"
            placement="top"
          >
            <div
              :class="[
                'sign-day',
                {
                  'sign-day--done': day.state === 1,
                  'sign-day--today': day.todayFlag
                }
              ]"
            >
              <img v-if="day.iconUrl" :src="day.iconUrl" alt="" class="sign-icon">
              <span>{{ day.day || day.date || '-' }}</span>
              <el-icon v-if="day.state === 1" class="sign-check"><Check /></el-icon>
            </div>
          </el-tooltip>
        </div>
        <el-empty v-else description="暂无签到数据" :image-size="72" />
      </section>

      <section v-if="activeTab === 'rtime' && gradeGroups.length" class="progress-panel">
        <div class="progress-info">
          <span>当前成长值：<strong>{{ currentGrowthValue }}</strong></span>
          <span v-if="nextGradeRecord">还差 <strong>{{ currentGradeRecord?.needGrowthValue || 0 }}</strong> 成长值升级到 {{ nextGradeRecord.gradeName }}</span>
          <span v-else>已达到最高等级</span>
        </div>
        <el-progress :percentage="progressPercentage" :show-text="false" status="warning" :stroke-width="10" />
        <div class="progress-marks">
          <span v-for="grade in gradeGroups" :key="grade.gradeId" :class="{ 'mark-active': grade.isCurrent }">{{ grade.gradeName }}</span>
        </div>
      </section>

      <section class="level-panel">
        <header>
          <span>
            <el-icon><Trophy /></el-icon>
            {{ activeTab === 'rtime' ? `全部等级 (${gradeGroups.length})` : `W+权益 (${wplusRows.length})` }}
          </span>
          <el-button size="small" :icon="Refresh" :loading="loading" @click="loadMemberData">刷新等级权益</el-button>
        </header>

        <div v-if="activeTab === 'rtime'" v-loading="loading" class="grade-cards">
          <el-empty v-if="!gradeGroups.length" :description="memberMessage || '暂无会员权益数据'" />
          <el-card v-for="grade in gradeGroups" :key="grade.gradeId" class="grade-card" shadow="never">
            <template #header>
              <div class="grade-header">
                <span class="grade-name">{{ grade.gradeName }} <el-tag v-if="grade.isCurrent" size="small" type="danger" effect="dark">当前等级</el-tag></span>
                <span class="grade-desc">{{ grade.gradeDesc }}</span>
              </div>
            </template>
            <el-table :data="grade.equities" :show-header="true">
              <el-table-column prop="name" label="权益名称" min-width="180" />
              <el-table-column prop="amount" label="面额" width="90" />
              <el-table-column prop="count" label="数量" width="90" />
              <el-table-column prop="category" label="分类" width="100" />
              <el-table-column prop="status" label="状态" width="100" />
              <el-table-column label="操作" width="90">
                <template #default="{ row }">
                  <el-button link type="primary" @click="handleGainEquity(row)">去使用</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>

        <el-table
          v-else
          v-loading="loading"
          :data="wplusRows"
          height="100%"
          :empty-text="memberMessage || '暂无 W+ 权益数据'"
        >
          <el-table-column prop="name" label="权益名称" min-width="220" />
          <el-table-column prop="amount" label="面额" width="100" />
          <el-table-column prop="count" label="数量" width="100" />
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="status" label="状态" width="120" />
        </el-table>
      </section>
    </section>
  </section>
</template>

<style scoped>
.member-page {
  min-width: 980px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.member-tabs {
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
}

.member-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 28px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
}

.section-header,
.level-panel header,
.sign-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text);
  font-weight: 700;
}

.section-header span,
.level-panel header span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section-header :deep(.el-icon),
.level-panel :deep(.el-icon) {
  color: var(--app-accent);
}

.member-desc {
  width: 100%;
}

.sign-panel {
  padding: 18px 22px;
  border: 1px solid #f0d8a3;
  border-radius: 8px;
  background: #fff8ec;
}

.sign-title strong {
  color: #f56c6c;
  margin-left: auto;
}

.sign-track {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-top: 20px;
  color: var(--app-muted);
  text-align: center;
}

.sign-day {
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 18px;
  background: #fff;
  color: #e6a23c;
  font-weight: 600;
  border: 1px solid transparent;
}

.sign-day--done {
  color: #67c23a;
  border-color: #c8ebb4;
  background: #f0f9eb;
}

.sign-day--today {
  border-color: #e6a23c;
  box-shadow: inset 0 0 0 2px rgb(230 162 60 / 18%);
}

.sign-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.sign-check {
  font-size: 16px;
}

.level-panel {
  flex: 1;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.progress-panel {
  padding: 16px 20px;
  border-radius: 8px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.progress-info strong {
  color: #e6a23c;
}

.progress-marks {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13px;
  color: var(--app-muted);
}

.mark-active {
  color: #e6a23c;
  font-weight: 600;
}

.grade-cards {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 6px;
}

.grade-card {
  border-radius: 8px;
}

.grade-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.grade-name {
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.grade-desc {
  font-size: 13px;
  color: var(--app-muted);
}
</style>
