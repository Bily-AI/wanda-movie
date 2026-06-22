<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Medal, Refresh, Trophy } from '@element-plus/icons-vue'

import {
  fetchMemberGradeEquityList,
  fetchMemberSignInCalendar,
  fetchWPlusDetail,
  gainMemberEquity,
  type MemberEquityRow,
  type MemberSignInCalendar
} from '@renderer/services/featureApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const activeTab = ref('rtime')
const gradeRows = ref<MemberEquityRow[]>([])
const wplusRows = ref<MemberEquityRow[]>([])
const signInCalendar = ref<MemberSignInCalendar | null>(null)
const loading = ref(false)
const memberMessage = ref('')
const signInMessage = ref('')

const currentAccountText = computed(() => accountsStore.currentAccount?.phone || '未选择账号')
const currentGrade = computed(() => gradeRows.value[0]?.gradeName || '-')
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
    gradeRows.value = []
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
      gradeRows.value = gradeResult.value
    } else {
      gradeRows.value = []
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

    memberMessage.value =
      gradeRows.value.length || wplusRows.value.length
        ? ''
        : '暂无会员权益数据'
    logsStore.addLog('会员', account.phone, `会员数据加载完成：Rtime ${gradeRows.value.length} 条，W+ ${wplusRows.value.length} 条`)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '会员数据加载失败'
    gradeRows.value = []
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
  const row = gradeRows.value.find((item) => item.gradeId && item.equityId)

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

      <section class="level-panel">
        <header>
          <span>
            <el-icon><Trophy /></el-icon>
            {{ activeTab === 'rtime' ? `全部等级 (${gradeRows.length})` : `W+权益 (${wplusRows.length})` }}
          </span>
          <el-button size="small" :icon="Refresh" :loading="loading" @click="loadMemberData">刷新等级权益</el-button>
        </header>

        <el-table
          v-if="activeTab === 'rtime'"
          v-loading="loading"
          :data="gradeRows"
          height="100%"
          :empty-text="memberMessage || '暂无会员权益数据'"
        >
          <el-table-column prop="gradeName" label="等级" min-width="120" />
          <el-table-column prop="name" label="权益名称" min-width="220" />
          <el-table-column prop="amount" label="面额" width="100" />
          <el-table-column prop="count" label="数量" width="100" />
          <el-table-column prop="category" label="分类" width="120" />
          <el-table-column prop="status" label="状态" width="120" />
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleGainEquity(row)">去使用</el-button>
            </template>
          </el-table-column>
        </el-table>

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
  display: grid;
  grid-template-rows: 40px minmax(0, 1fr);
  gap: 16px;
}
</style>
