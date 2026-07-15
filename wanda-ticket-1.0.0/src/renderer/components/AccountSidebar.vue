<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, DocumentCopy, Edit, FolderAdd, Lock, Refresh, Search, Sort, Upload, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  fetchMemberCoupons,
  fetchMemberGradeEquityList,
  fetchStoredCardsWithBalance,
  fetchWPlusProfile,
  type MemberGradeGroup
} from '@renderer/services/featureApi'
import { queryOrderList } from '@renderer/services/seatApi'
import { checkLoginStatus } from '@renderer/services/wandaAuthApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'
import type { WandaAccount } from '@shared/localData'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()

const hasNoAccounts = computed(() => accountsStore.accounts.length === 0)
const loginCardExpanded = ref(false)
const refreshingAccountSummaries = ref(false)
const refreshingSelectedSummaries = ref(false)
const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuAccount = ref<WandaAccount | null>(null)
const moveGroupDialogVisible = ref(false)
const targetGroupId = ref('')
const importAccountsDialogVisible = ref(false)
const importAccountsText = ref('')
const importAccountsPlaceholder = '格式：手机号----ck，每行一个\n13800138000----xxxxxxxx'

const exportDialogVisible = ref(false)
const exportText = ref('')

function handleExportAccounts(): void {
  if (accountsStore.accounts.length === 0) {
    ElMessage.warning('暂无账号可导出')
    return
  }

  exportText.value = accountsStore.exportAccountsToText()
  exportDialogVisible.value = true
}

async function handleCopyExportText(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportText.value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

function handleBatchExportAccounts(): void {
  if (accountsStore.selectedCount === 0) {
    return
  }

  exportText.value = accountsStore.exportAccountsToText(accountsStore.selectedAccountIds)
  exportDialogVisible.value = true
}

async function handleBatchDeleteAccounts(): Promise<void> {
  if (accountsStore.selectedCount === 0) {
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除选中的 ${accountsStore.selectedCount} 个账号吗？`, '批量删除账号', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
  } catch {
    return
  }

  const count = await accountsStore.deleteAccounts(accountsStore.selectedAccountIds)
  ElMessage.success(`已删除 ${count} 个账号`)
}

function handleRowClick(row: WandaAccount): void {
  accountsStore.setCurrentAccount(row.id)
  ElMessage.success('切换账号成功')
}

function handleCancelSelection(): void {
  accountsStore.cancelSelection()
}

function formatLoginDate(row: WandaAccount): string {
  return row.loginDate || row.loginTime || '-'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatAccountAgeDays(row: WandaAccount): string {
  return `${Number(row.accountAgeDays || 0)}天`
}

function formatAccountNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : String(value)
}

function formatTodayTicketCount(row: WandaAccount): number {
  const today = new Date().toLocaleDateString('en-CA')
  return row.todayTicketDate === today ? row.todayTicketCount ?? 0 : 0
}

function extractDateOnly(value: string): string {
  const text = value.trim()

  if (!text) {
    return ''
  }

  const compactMatch = text.match(/\b(\d{4})(\d{2})(\d{2})\b/)
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`
  }

  const dateMatch = text.match(/(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/)
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return ''
}

function formatWPlusExpire(row: WandaAccount): string {
  const text = String(row.wplusExpireAt || '').trim()
  const dateMatch = text.match(/(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/)

  if (dateMatch) {
    const [, year, month, day] = dateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return extractDateOnly(text) || '-'
}

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
}

function isCurrentAccount(account: WandaAccount): boolean {
  return account.id === accountsStore.currentAccountId
}

function isSelectedAccount(account: WandaAccount): boolean {
  return accountsStore.selectedAccountIds.includes(account.id)
}

function handleAccountCheckedChange(account: WandaAccount, checked: string | number | boolean): void {
  const ids = new Set(accountsStore.selectedAccountIds)

  if (checked) {
    ids.add(account.id)
  } else {
    ids.delete(account.id)
  }

  accountsStore.setSelectedAccountIds([...ids])
}

const allAccountsChecked = computed(
  () => accountsStore.accounts.length > 0 && accountsStore.selectedCount === accountsStore.accounts.length
)
const someAccountsChecked = computed(
  () => accountsStore.selectedCount > 0 && accountsStore.selectedCount < accountsStore.accounts.length
)

const currentGroupLabel = computed(() => {
  const id = accountsStore.selectedGroupId
  if (!id) {
    return '全部分组'
  }
  return accountsStore.groups.find((group) => group.id === id)?.name || '全部分组'
})

function handleToggleSelectAll(): void {
  if (allAccountsChecked.value) {
    accountsStore.setSelectedAccountIds([])
  } else {
    accountsStore.setSelectedAccountIds(accountsStore.accounts.map((account) => account.id))
  }
}

function accountGroupName(account: WandaAccount): string {
  return accountsStore.groups.find((group) => group.id === account.groupId)?.name || ''
}

function accountStatusInfo(account: WandaAccount): { text: string; warn: boolean } {
  if (!account.ck) {
    return { text: '待登录', warn: false }
  }

  if (account.loginInvalid) {
    return { text: '异常', warn: true }
  }

  const base = Date.parse(account.lastLoginAt || account.createdAt || '')

  if (!Number.isFinite(base)) {
    return { text: '正常', warn: false }
  }

  const dayMs = 24 * 60 * 60 * 1000
  const daysLeft = Math.ceil((base + 30 * dayMs - Date.now()) / dayMs)

  if (daysLeft <= 0) {
    return { text: '已过期', warn: true }
  }

  if (daysLeft <= 3) {
    return { text: `${daysLeft}天后到期`, warn: true }
  }

  return { text: '正常', warn: false }
}


function getCurrentGradeSummary(groups: MemberGradeGroup[]): { memberGradeName: string; growthValue: number | null } {
  if (groups.length === 0) {
    return { memberGradeName: '', growthValue: null }
  }

  const explicitCurrent = groups.find((group) => group.isCurrent)
  const memberGrowthGroup = groups.find((group) => group.memberGrowthVal)
  const growthValue = explicitCurrent?.memberGrowthVal || memberGrowthGroup?.memberGrowthVal || groups[0]?.growthValue || 0
  const sortedGroups = [...groups].sort((left, right) => left.growthMinVal - right.growthMinVal)
  const currentGrade =
    explicitCurrent ||
    [...sortedGroups]
      .reverse()
      .find((group) => growthValue >= group.growthMinVal && (group.growthMaxVal === null || growthValue <= group.growthMaxVal)) ||
    [...sortedGroups].reverse().find((group) => growthValue >= group.growthMinVal) ||
    sortedGroups[0]

  return {
    memberGradeName: currentGrade?.gradeName || '',
    growthValue
  }
}

function isTodayDate(value: unknown): boolean {
  if (!value) {
    return false
  }

  const raw = String(value).trim()
  const numMatch = raw.match(/^\d+$/)
  const date = numMatch ? new Date(Number(numMatch[0])) : new Date(raw)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

async function refreshAccountSummary(account: WandaAccount): Promise<void> {
  const userIdentifier = account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  const [loginStatusResult, storedCardResult, couponResult, gradeResult, wplusResult, orderResult] =
    await Promise.allSettled([
      checkLoginStatus(account.ck, userIdentifier),
      fetchStoredCardsWithBalance(account.ck, userIdentifier),
      fetchMemberCoupons(account.ck, userIdentifier),
      fetchMemberGradeEquityList(account.ck, userIdentifier),
      fetchWPlusProfile(account.ck, userIdentifier),
      queryOrderList(1, 50, account.phone, account.ck, userIdentifier)
    ])
  const summary: Partial<
    Pick<
      WandaAccount,
      | 'pointsBalance'
      | 'storedCardCount'
      | 'couponCount'
      | 'memberGradeName'
      | 'growthValue'
      | 'isPayMember'
      | 'wplusExpireAt'
      | 'todayTicketCount'
      | 'todayTicketDate'
    >
  > = {}

  if (loginStatusResult.status === 'fulfilled') {
    const userInfo = loginStatusResult.value.userInfo
    const pointsBalance = Number(
      userInfo?.pointsBalance ?? userInfo?.point ?? userInfo?.points ?? userInfo?.integral ?? userInfo?.score
    )

    if (Number.isFinite(pointsBalance)) {
      summary.pointsBalance = pointsBalance
    }

    if (userInfo?.payMemberStr) {
      summary.wplusExpireAt = userInfo.payMemberStr
    }
  }

  if (storedCardResult.status === 'fulfilled') {
    summary.storedCardCount = storedCardResult.value.cards.length
  }

  if (couponResult.status === 'fulfilled') {
    summary.couponCount = couponResult.value.length
  }

  if (gradeResult.status === 'fulfilled') {
    Object.assign(summary, getCurrentGradeSummary(gradeResult.value))
  }

  if (wplusResult.status === 'fulfilled') {
    summary.isPayMember = wplusResult.value.isPayMember
    summary.wplusExpireAt = wplusResult.value.expireAt
  }

  if (orderResult.status === 'fulfilled') {
    // 今日出票 = 出票记录接口里「当日 + 出票成功(completed)」的订单数
    summary.todayTicketCount = orderResult.value.records.filter(
      (order) => order.status === 'completed' && isTodayDate(order.createdAt)
    ).length
    summary.todayTicketDate = new Date().toLocaleDateString('en-CA')
  }

  if (Object.keys(summary).length > 0) {
    await accountsStore.updateAccountProfileSummary(account.id, summary)
  }

  await accountsStore.setAccountLoginState(account.id, loginStatusResult.status === 'fulfilled')
}

async function handleRefreshAccountSummaries(): Promise<void> {
  if (refreshingAccountSummaries.value) {
    return
  }

  await accountsStore.loadAccounts()
  const accounts = accountsStore.filteredAccounts.filter((account) => account.ck)

  if (accounts.length === 0) {
    ElMessage.warning('没有可刷新的已登录账号')
    return
  }

  refreshingAccountSummaries.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const account of accounts) {
      try {
        await refreshAccountSummary(account)
        successCount += 1
      } catch (error) {
        failCount += 1
        logsStore.addLog('账号摘要', account.phone, `刷新失败：${getErrorMessage(error, '刷新失败')}`)
      }
    }
  } finally {
    refreshingAccountSummaries.value = false
  }

  ElMessage.success(`账号摘要刷新完成：成功 ${successCount} 个，失败 ${failCount} 个`)
}

async function handleRefreshSelectedSummaries(): Promise<void> {
  if (refreshingSelectedSummaries.value) {
    return
  }

  const selected = new Set(accountsStore.selectedAccountIds)
  const accounts = accountsStore.accounts.filter((account) => selected.has(account.id) && account.ck)

  if (accounts.length === 0) {
    ElMessage.warning('选中账号里没有已登录的可刷新')
    return
  }

  refreshingSelectedSummaries.value = true
  let successCount = 0
  let failCount = 0

  try {
    for (const account of accounts) {
      try {
        await refreshAccountSummary(account)
        successCount += 1
      } catch (error) {
        failCount += 1
        logsStore.addLog('账号摘要', account.phone, `刷新失败：${getErrorMessage(error, '刷新失败')}`)
      }
    }
  } finally {
    refreshingSelectedSummaries.value = false
  }

  ElMessage.success(`批量刷新完成：成功 ${successCount} 个，失败 ${failCount} 个`)
}

function handleRowContextMenu(row: WandaAccount, _column: unknown, event: MouseEvent): void {
  event.preventDefault()
  contextMenuAccount.value = row
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true

  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }
  document.addEventListener('click', closeMenu)
}

async function handleEditRemark(): Promise<void> {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入新的备注', '修改备注', {
      inputValue: account.remark,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await accountsStore.updateAccountRemark(account.id, value)
  } catch {}
}

async function handleDeleteAccount(): Promise<void> {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    await ElMessageBox.confirm(`确定要删除账号 ${account.phone} 吗？`, '删除账号', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await accountsStore.deleteAccount(account.id)
  } catch {}
}

async function handleCopyPhone(): Promise<void> {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    await navigator.clipboard.writeText(account.phone)
    ElMessage.success('手机号已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleCopyPhoneAndToken(): Promise<void> {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    const text = `${account.phone}---${account.ck || ''}`
    await navigator.clipboard.writeText(text)
    ElMessage.success('账号及Token已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleCreateGroup(): Promise<void> {
  contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '创建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消'
    })
    if (value.trim()) {
      await accountsStore.createGroup(value.trim())
    }
  } catch {}
}

async function handleMoveToGroup(groupId: string): Promise<void> {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  await accountsStore.moveAccountToGroup(account.id, groupId)
}

function handleMoveSelectedToGroup(): void {
  targetGroupId.value = accountsStore.groups[0]?.id || ''
  moveGroupDialogVisible.value = true
}

async function confirmMoveSelectedToGroup(): Promise<void> {
  if (!targetGroupId.value) return

  const movedCount = await accountsStore.moveSelectedToGroup(targetGroupId.value)
  if (movedCount > 0) {
    ElMessage.success(accountsStore.loginForm.message)
    handleCancelSelection()
  } else {
    ElMessage.warning(accountsStore.loginForm.message)
  }
  moveGroupDialogVisible.value = false
}

async function handleImportAccounts(): Promise<void> {
  contextMenuVisible.value = false
  importAccountsText.value = ''
  importAccountsDialogVisible.value = true
}

async function confirmImportAccounts(): Promise<void> {
  try {
    const count = await accountsStore.importAccountsFromText(importAccountsText.value)

    if (count > 0) {
      ElMessage.success(accountsStore.loginForm.message)
      importAccountsDialogVisible.value = false
    } else {
      ElMessage.warning(accountsStore.loginForm.message)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '导入失败')
  }
}
</script>

<template>
  <aside class="account-sidebar">
    <section class="panel account-pool-card account-current-card account-list-card">
      <header class="account-section-header">
        <span>
          <el-icon><UserFilled /></el-icon>
          账号池
        </span>
        <div class="account-header-actions">
          <el-button size="small" text @click="handleImportAccounts">导入账号</el-button>
          <el-button
            size="small"
            text
            :disabled="accountsStore.accounts.length === 0"
            @click="handleExportAccounts"
          >
            导出账号
          </el-button>
          <span class="account-section-count">{{ accountsStore.filteredAccounts.length }} 个账号</span>
        </div>
      </header>

      <div class="account-toolbar">
        <el-select v-model="accountsStore.selectedGroupId" size="small" placeholder="分组">
          <el-option label="全部分组" value="" />
          <el-option
            v-for="group in accountsStore.groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
        <el-input
          v-model="accountsStore.searchKeyword"
          size="small"
          placeholder="搜索账号/手机号"
          :prefix-icon="Search"
        />
        <el-button
          size="small"
          :icon="Refresh"
          :loading="refreshingAccountSummaries"
          aria-label="刷新账号摘要"
          @click="handleRefreshAccountSummaries"
        />
      </div>

      <div id="account-list-panel" class="account-tab-panel account-list-panel" role="tabpanel">
        <div class="account-list-toolbar">
          <el-checkbox
            :model-value="allAccountsChecked"
            :indeterminate="someAccountsChecked"
            @change="handleToggleSelectAll"
          >
            全选
          </el-checkbox>
          <span class="account-list-group-label">{{ currentGroupLabel }}</span>
        </div>
        <div class="account-row-list">
          <button
            v-for="(account, index) in accountsStore.filteredAccounts"
            :key="account.id"
            type="button"
            class="account-row"
            :class="{ 'account-row--active': isCurrentAccount(account) }"
            @click="handleRowClick(account)"
            @contextmenu.prevent="handleRowContextMenu(account, null, $event)"
          >
            <el-checkbox
              :model-value="isSelectedAccount(account)"
              :aria-label="`选择账号 ${account.phone}`"
              @click.stop
              @change="handleAccountCheckedChange(account, $event)"
            />
            <span class="row-avatar row-avatar--index">{{ index + 1 }}</span>
            <span class="row-main">
              <strong>{{ maskPhone(account.phone) }}</strong>
              <em>{{ formatLoginDate(account) }}</em>
            </span>
            <span class="row-meta">
              <strong>{{ account.remark || '-' }}</strong>
              <em>
                <template v-if="accountGroupName(account)">{{ accountGroupName(account) }} · </template>
                <span :class="{ 'account-state--warn': accountStatusInfo(account).warn }">{{ accountStatusInfo(account).text }}</span>
              </em>
            </span>
          </button>

          <div v-if="accountsStore.filteredAccounts.length === 0" class="account-empty">暂无账号</div>
        </div>

        <div class="account-management-actions">
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleMoveSelectedToGroup">
            移动分组
          </el-button>
          <el-button
            size="small"
            :loading="refreshingSelectedSummaries"
            :disabled="accountsStore.selectedCount === 0"
            @click="handleRefreshSelectedSummaries"
          >
            批量刷新
          </el-button>
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleBatchExportAccounts">
            批量导出
          </el-button>
          <el-button
            size="small"
            type="danger"
            :disabled="accountsStore.selectedCount === 0"
            @click="handleBatchDeleteAccounts"
          >
            批量删除
          </el-button>
        </div>
      </div>

    </section>

    <section class="panel account-login-card">
      <header class="account-section-header">
        <span>
          <el-icon><Lock /></el-icon>
          万达账号登录
        </span>
        <div class="login-card-actions">
          <el-button
            v-if="loginCardExpanded || hasNoAccounts"
            class="login-clear-button"
            size="small"
            @click="accountsStore.resetLoginForm"
          >
            清空
          </el-button>
          <el-button
            v-if="!hasNoAccounts"
            class="login-toggle-button"
            size="small"
            type="primary"
            @click="loginCardExpanded = !loginCardExpanded"
          >
            {{ loginCardExpanded ? '收起' : '登录' }}
          </el-button>
        </div>
      </header>

      <div v-if="loginCardExpanded || hasNoAccounts" class="login-panel-body">
        <div class="login-form">
          <el-input v-model="accountsStore.loginForm.phone" placeholder="请输入手机号">
            <template #prepend>+86</template>
          </el-input>
          <div class="login-code-row">
            <el-input v-model="accountsStore.loginForm.code" placeholder="验证码" />
            <el-button
              type="primary"
              :loading="accountsStore.loginForm.sending"
              :disabled="
                accountsStore.loginForm.sending ||
                accountsStore.loginForm.loggingIn ||
                accountsStore.loginForm.countdown > 0 ||
                !accountsStore.loginForm.phone
              "
              @click="accountsStore.sendLoginCode"
            >
              {{ accountsStore.loginForm.countdown > 0 ? `${accountsStore.loginForm.countdown}秒` : '获取验证码' }}
            </el-button>
          </div>
          <el-button
            class="full-button"
            type="primary"
            :loading="accountsStore.loginForm.loggingIn"
            :disabled="
              accountsStore.loginForm.sending ||
              accountsStore.loginForm.loggingIn ||
              !accountsStore.loginForm.phone ||
              !accountsStore.loginForm.code
            "
            @click="accountsStore.loginWandaAccount"
          >
            登录
          </el-button>
        </div>

        <div class="login-status">
          <span class="status-dot" />
          {{ accountsStore.loginStatusText }}
        </div>
      </div>

      <div v-else class="login-compact-row">
        <span class="status-dot" />
        <span>{{ accountsStore.loginStatusText }}</span>
      </div>

      <div v-if="accountsStore.currentAccount" class="account-metric-text">
        <span>积分：{{ formatAccountNumber(accountsStore.currentAccount.pointsBalance) }}</span>
        <span>可用券：{{ formatAccountNumber(accountsStore.currentAccount.couponCount) }} 张</span>
        <span>储值卡：{{ formatAccountNumber(accountsStore.currentAccount.storedCardCount) }} 张</span>
        <span>成长值：{{ formatAccountNumber(accountsStore.currentAccount.growthValue) }}</span>
        <span>等级：{{ accountsStore.currentAccount.memberGradeName || '-' }}</span>
        <span>W+到期：{{ formatWPlusExpire(accountsStore.currentAccount) }}</span>
        <span>入库：{{ formatAccountAgeDays(accountsStore.currentAccount) }}</span>
        <span>今日出票：{{ formatTodayTicketCount(accountsStore.currentAccount) }} 张</span>
      </div>
    </section>

    <teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="custom-context-menu el-popper is-light"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <el-menu size="small" class="context-menu-list">
          <el-menu-item @click="handleEditRemark">
            <el-icon><Edit /></el-icon>
            <span>修改备注</span>
          </el-menu-item>
          <el-menu-item class="danger-item" @click="handleDeleteAccount">
            <el-icon><Delete /></el-icon>
            <span>删除账号</span>
          </el-menu-item>
          <el-menu-item @click="handleCopyPhone">
            <el-icon><DocumentCopy /></el-icon>
            <span>复制手机号</span>
          </el-menu-item>
          <el-menu-item @click="handleCopyPhoneAndToken">
            <el-icon><DocumentCopy /></el-icon>
            <span>复制账号---token</span>
          </el-menu-item>
          <div class="el-menu-item-divider" />
          <el-menu-item @click="handleImportAccounts">
            <el-icon><Upload /></el-icon>
            <span>导入账号</span>
          </el-menu-item>
          <el-menu-item @click="handleCreateGroup">
            <el-icon><FolderAdd /></el-icon>
            <span>创建分组</span>
          </el-menu-item>
          <el-sub-menu index="move">
            <template #title>
              <el-icon><Sort /></el-icon>
              <span>移动分组</span>
            </template>
            <el-menu-item
              v-for="group in accountsStore.groups"
              :key="group.id"
              @click="handleMoveToGroup(group.id)"
            >
              {{ group.name }}
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>
    </teleport>

    <el-dialog v-model="moveGroupDialogVisible" title="移动到分组" width="400px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="目标分组">
          <el-select v-model="targetGroupId" class="dialog-full-select" placeholder="请选择目标分组">
            <el-option
              v-for="group in accountsStore.groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="moveGroupDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMoveSelectedToGroup">移动</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importAccountsDialogVisible"
      title="导入旧版账号"
      width="680px"
      append-to-body
      class="legacy-account-import-dialog"
    >
      <el-input
        v-model="importAccountsText"
        type="textarea"
        :rows="18"
        resize="none"
        :placeholder="importAccountsPlaceholder"
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="importAccountsDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmImportAccounts">导入</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      v-model="exportDialogVisible"
      title="导出账号"
      width="680px"
      append-to-body
      class="legacy-account-import-dialog"
    >
      <el-input v-model="exportText" type="textarea" :rows="18" resize="none" readonly />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="exportDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="handleCopyExportText">复制</el-button>
        </span>
      </template>
    </el-dialog>
  </aside>
</template>

<style scoped>
.account-sidebar {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(480px, 1fr) auto;
  gap: 12px;
}

.panel {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.account-section-header {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.account-section-header span:first-child {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.account-section-header :deep(.el-icon) {
  color: var(--app-accent);
}

.account-section-count {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.account-toolbar {
  display: grid;
  grid-template-columns: 94px minmax(0, 1fr) 36px;
  gap: 8px;
  padding: 10px 14px 2px;
}

.account-pool-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.account-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 0 14px 12px;
  border-bottom: 1px solid var(--app-border);
}

.account-tab-button {
  min-width: 0;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--panel-soft-bg);
  color: var(--app-muted);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.account-tab-button:hover {
  border-color: #b9d6ff;
  color: var(--app-text);
}

.account-tab-button--active {
  border-color: #91bfff;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.account-tab-count {
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.account-tab-panel {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.account-current-panel {
  overflow: auto;
  padding: 12px 14px 14px;
}

.current-account-card {
  margin: 0;
  padding: 12px;
  border: 1px solid #bdd7ff;
  border-radius: 8px;
  background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
}

.current-account-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-avatar,
.row-avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--app-accent-soft);
  color: var(--app-accent);
}

.current-avatar {
  width: 34px;
  height: 34px;
  font-size: 19px;
}

.current-account-main,
.row-main,
.row-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.current-account-main {
  flex: 1;
  gap: 2px;
}

.current-account-main strong,
.row-main strong {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 700;
}

.current-account-main span,
.row-main em,
.row-meta em {
  color: var(--app-muted);
  font-size: 12px;
  font-style: normal;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #eef2f7;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-badge--active {
  background: #e9f8ef;
  color: #168a3d;
}

.account-metric-text {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  padding: 6px 14px 10px;
  color: var(--app-subtle);
  font-size: 12px;
  line-height: 1.7;
}

.account-list-card {
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.account-list-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  /* 左内边距 = 列表 padding(10) + 账号行 padding(8)，使“全选”框与账号行复选框左对齐 */
  padding: 2px 10px 6px 18px;
}

.account-list-toolbar :deep(.el-checkbox) {
  margin: 0;
}

.account-list-group-label {
  color: var(--app-muted);
  font-size: 12px;
}

.account-list-toolbar :deep(.el-button) {
  margin: 0;
}

.account-row-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 10px 10px 6px;
  scrollbar-width: thin;
}

.account-row {
  width: 100%;
  min-height: 54px;
  display: grid;
  grid-template-columns: 16px 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.account-row:hover {
  border-color: var(--summary-blue-border);
  background: var(--panel-soft-bg);
}

/* Element Plus 复选框默认 margin-right:30px + 空 label 会在勾选框与序号间留大片空隙 */
.account-row :deep(.el-checkbox) {
  height: auto;
  margin: 0;
}

.account-row :deep(.el-checkbox__label) {
  display: none;
}

.account-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.account-header-actions .el-button {
  padding: 0 4px;
}

.account-row--active {
  border-color: #9fc7ff;
  background: var(--app-accent-soft);
}

.row-avatar {
  width: 34px;
  height: 34px;
  font-size: 19px;
}

.row-avatar--index {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.account-state--warn {
  color: var(--el-color-danger, #f56c6c);
  font-weight: 600;
}

.row-main strong {
  font-size: 14px;
}

.row-meta {
  align-items: flex-end;
  gap: 2px;
  color: var(--app-muted);
  font-size: 12px;
  white-space: nowrap;
}

.row-meta strong {
  color: var(--app-subtle);
  font-size: 12px;
}

.account-management-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--app-border);
}

.account-management-actions :deep(.el-button) {
  margin: 0;
  width: 100%;
  padding: 0 4px;
  font-size: 12px;
}

.account-login-card {
  overflow: hidden;
}

.login-card-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.login-toggle-button {
  min-width: 62px;
  font-weight: 700;
  box-shadow: 0 4px 10px rgb(32 126 255 / 18%);
}

.login-panel-body {
  padding-bottom: 12px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
}

.login-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  gap: 8px;
}

.full-button {
  width: 100%;
}

.login-status,
.account-empty {
  color: var(--app-muted);
  font-size: 12px;
}

.login-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
}

.login-compact-row {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px 12px;
  color: var(--app-muted);
  font-size: 12px;
}

.account-empty {
  min-height: 84px;
  display: grid;
  place-items: center;
  padding: 14px;
  text-align: center;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c7d0dd;
}

.custom-context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  padding: 4px 0;
  border-radius: 6px;
  background: var(--app-surface);
  box-shadow: 0 8px 22px rgb(31 42 68 / 18%);
}

.context-menu-list {
  border-right: none;
}

.context-menu-list .el-menu-item,
.context-menu-list :deep(.el-sub-menu__title) {
  height: 36px;
  line-height: 36px;
}

.danger-item {
  color: #f56c6c !important;
}

.danger-item .el-icon {
  color: #f56c6c !important;
}

.el-menu-item-divider {
  height: 1px;
  margin: 4px 0;
  background-color: var(--app-border);
}

:global(.legacy-account-import-dialog .el-dialog__body) {
  padding: 16px 18px;
}

:global(.legacy-account-import-dialog .el-textarea__inner) {
  min-height: 275px !important;
  color: var(--app-text);
  font-size: 14px;
  line-height: 1.6;
}

.dialog-full-select {
  width: 100%;
}
</style>
