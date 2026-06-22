<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Present, Refresh, Search } from '@element-plus/icons-vue'

import {
  bindMemberCoupon,
  checkCouponPresentable,
  checkCouponPresentIdentity,
  fetchMemberCoupons,
  presentMemberCoupons,
  sendCouponPresentSecurityCode,
  validateCouponPresentSecurityCode,
  type MemberCouponRow
} from '@renderer/services/featureApi'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const coupons = ref<MemberCouponRow[]>([])
const selectedCoupons = ref<MemberCouponRow[]>([])
const keyword = ref('')
const nameFilter = ref('')
const typeFilter = ref('')
const loading = ref(false)
const couponMessage = ref('')
const presentDialogVisible = ref(false)
const couponDetailDialogVisible = ref(false)
const currentCouponDetail = ref<MemberCouponRow | null>(null)
const pendingPresentCoupons = ref<MemberCouponRow[]>([])
const presentTargetMobile = ref('')
const presentMemberPhone = ref('')
const presentRequestId = ref('')
const presentSecurityCode = ref('')
const presentVerifiedSecurityCode = ref('')
const presentAccountId = ref('')
const presentOperationSerial = ref(0)
const presentNeedCheck = ref(false)
const presentCodeVerified = ref(false)
const presentPreparing = ref(false)
const sendingPresentCode = ref(false)
const validatingPresentCode = ref(false)
const submittingPresent = ref(false)
const presentCountdown = ref(0)
let presentCountdownTimer: number | null = null

const couponRows = computed(() => {
  const searchText = keyword.value.trim().toLowerCase()

  return coupons.value.filter((coupon) => {
    if (nameFilter.value && coupon.name !== nameFilter.value) {
      return false
    }

    if (typeFilter.value && coupon.type !== typeFilter.value) {
      return false
    }

    if (!searchText) {
      return true
    }

    return [coupon.voucherNo, coupon.couponNo, coupon.name, coupon.type]
      .join(' ')
      .toLowerCase()
      .includes(searchText)
  })
})

const nameOptions = computed(() => [...new Set(coupons.value.map((coupon) => coupon.name).filter(Boolean))])
const typeOptions = computed(() => [...new Set(coupons.value.map((coupon) => coupon.type).filter(Boolean))])
const currentCouponJson = computed(() => JSON.stringify(currentCouponDetail.value?.raw ?? currentCouponDetail.value, null, 2))
let couponLoadSerial = 0

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function bumpPresentOperation(): number {
  presentOperationSerial.value += 1
  return presentOperationSerial.value
}

function isPresentOperationCurrent(operationSerial: number, accountId: string): boolean {
  return (
    operationSerial === presentOperationSerial.value &&
    presentAccountId.value === accountId &&
    accountsStore.currentAccountId === accountId
  )
}

function isCouponLoadCurrent(loadSerial: number, accountId: string): boolean {
  return loadSerial === couponLoadSerial && accountsStore.currentAccountId === accountId
}

function getCurrentAccount() {
  const account = accountsStore.currentAccount

  if (!account?.ck || !account.userIdentifier) {
    coupons.value = []
    couponMessage.value = '请选择已登录的万达账号'
    return null
  }

  return account
}

function getPresentCouponNos(rows: MemberCouponRow[]): string[] {
  const couponNos = rows.map((coupon) => coupon.couponNo.trim()).filter(Boolean)

  if (rows.length === 0) {
    throw new Error('请先选择要赠送的兑换券')
  }

  if (couponNos.length !== rows.length) {
    throw new Error('选中的兑换券缺少 couponNo，无法调用旧版赠送接口')
  }

  return couponNos
}

function clearPresentTimer() {
  if (presentCountdownTimer !== null) {
    window.clearInterval(presentCountdownTimer)
    presentCountdownTimer = null
  }
}

function startPresentCountdown() {
  clearPresentTimer()
  presentCountdown.value = 60
  presentCountdownTimer = window.setInterval(() => {
    presentCountdown.value -= 1

    if (presentCountdown.value <= 0) {
      presentCountdown.value = 0
      clearPresentTimer()
    }
  }, 1000)
}

function resetPresentForm() {
  bumpPresentOperation()
  clearPresentTimer()
  pendingPresentCoupons.value = []
  presentTargetMobile.value = ''
  presentMemberPhone.value = ''
  presentRequestId.value = ''
  presentSecurityCode.value = ''
  presentVerifiedSecurityCode.value = ''
  presentAccountId.value = ''
  presentNeedCheck.value = false
  presentCodeVerified.value = false
  presentPreparing.value = false
  sendingPresentCode.value = false
  validatingPresentCode.value = false
  submittingPresent.value = false
  presentCountdown.value = 0
}

async function loadCoupons() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  loading.value = true
  couponMessage.value = ''
  const loadSerial = ++couponLoadSerial
  const accountId = account.id

  try {
    const rows = await fetchMemberCoupons(account.ck, account.userIdentifier)

    if (!isCouponLoadCurrent(loadSerial, accountId)) {
      return
    }

    coupons.value = rows
    couponMessage.value = coupons.value.length > 0 ? '' : '暂无可用兑换券'
    logsStore.addLog('兑换券', account.phone, `兑换券加载成功：${coupons.value.length} 张`)
  } catch (error) {
    if (!isCouponLoadCurrent(loadSerial, accountId)) {
      return
    }

    const message = getErrorMessage(error, '兑换券加载失败')
    coupons.value = []
    couponMessage.value = message
    logsStore.addLog('兑换券', account.phone, `兑换券加载失败：${message}`)
  } finally {
    if (isCouponLoadCurrent(loadSerial, accountId)) {
      loading.value = false
    }
  }
}

async function handleBindCoupon() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const voucherResult = await ElMessageBox.prompt('请输入卡券号', '绑定卡券', {
    inputPlaceholder: '卡券号',
    confirmButtonText: '绑定',
    cancelButtonText: '取消'
  }).catch(() => null)
  const voucherNumber = voucherResult?.value.trim()

  if (!voucherNumber) {
    return
  }

  const passwordResult = await ElMessageBox.prompt('如卡券有密码请输入，没有可留空', '卡券密码', {
    inputPlaceholder: '卡券密码',
    confirmButtonText: '继续',
    cancelButtonText: '取消'
  }).catch(() => null)
  const password = passwordResult?.value.trim() ?? ''

  loading.value = true

  try {
    await bindMemberCoupon(voucherNumber, password, account.ck, account.userIdentifier)
    ElMessage.success('卡券绑定成功')
    logsStore.addLog('兑换券', account.phone, `绑定卡券成功：${voucherNumber}`)
    await loadCoupons()
  } catch (error) {
    const message = getErrorMessage(error, '绑定卡券失败')
    ElMessage.error(message)
    logsStore.addLog('兑换券', account.phone, `绑定卡券失败：${message}`)
  } finally {
    loading.value = false
  }
}

async function openPresentDialog(row?: MemberCouponRow) {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const rows = row ? [row] : selectedCoupons.value
  let couponNos: string[]

  try {
    couponNos = getPresentCouponNos(rows)
  } catch (error) {
    ElMessage.warning(getErrorMessage(error, '请先选择要赠送的兑换券'))
    return
  }

  const operationSerial = bumpPresentOperation()
  presentAccountId.value = account.id
  presentPreparing.value = true

  try {
    await checkCouponPresentable(couponNos, account.ck, account.userIdentifier)
    const identityResult = await checkCouponPresentIdentity(couponNos, account.ck, account.userIdentifier)

    if (!isPresentOperationCurrent(operationSerial, account.id)) {
      return
    }

    pendingPresentCoupons.value = rows
    presentMemberPhone.value = account.phone
    presentNeedCheck.value = identityResult.needCheck
    presentCodeVerified.value = !identityResult.needCheck
    presentDialogVisible.value = true
    logsStore.addLog('兑换券', account.phone, `兑换券赠送校验通过：${couponNos.length} 张`)
  } catch (error) {
    if (!isPresentOperationCurrent(operationSerial, account.id)) {
      return
    }

    const message = getErrorMessage(error, '兑换券赠送校验失败')
    ElMessage.error(message)
    logsStore.addLog('兑换券', account.phone, `兑换券赠送校验失败：${message}`)
  } finally {
    if (isPresentOperationCurrent(operationSerial, account.id)) {
      presentPreparing.value = false
    }
  }
}

function handleBatchPresent() {
  void openPresentDialog()
}

async function handleSendPresentCode() {
  const account = getCurrentAccount()

  if (!account || presentCountdown.value > 0) {
    return
  }

  const operationSerial = presentOperationSerial.value
  sendingPresentCode.value = true
  presentCodeVerified.value = false
  presentVerifiedSecurityCode.value = ''

  try {
    const localIp = await window.wandaApp?.getLocalIp()

    if (!localIp) {
      throw new Error('Electron 桥接未就绪，无法获取本机 IP')
    }

    const requestId = await sendCouponPresentSecurityCode(
      presentMemberPhone.value,
      localIp,
      account.ck,
      account.userIdentifier
    )

    if (!isPresentOperationCurrent(operationSerial, account.id) || !presentDialogVisible.value) {
      return
    }

    presentRequestId.value = requestId
    presentSecurityCode.value = ''
    startPresentCountdown()
    ElMessage.success('验证码已发送')
    logsStore.addLog('兑换券', account.phone, '兑换券赠送验证码发送成功')
  } catch (error) {
    if (!isPresentOperationCurrent(operationSerial, account.id) || !presentDialogVisible.value) {
      return
    }

    const message = getErrorMessage(error, '验证码发送失败')
    ElMessage.error(message)
    logsStore.addLog('兑换券', account.phone, `兑换券赠送验证码发送失败：${message}`)
  } finally {
    if (isPresentOperationCurrent(operationSerial, account.id)) {
      sendingPresentCode.value = false
    }
  }
}

async function handleValidatePresentCode() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const operationSerial = presentOperationSerial.value
  const securityCode = presentSecurityCode.value.trim()
  validatingPresentCode.value = true

  try {
    await validateCouponPresentSecurityCode(
      presentMemberPhone.value,
      presentRequestId.value,
      securityCode,
      account.ck,
      account.userIdentifier
    )

    if (
      !isPresentOperationCurrent(operationSerial, account.id) ||
      !presentDialogVisible.value ||
      presentSecurityCode.value.trim() !== securityCode
    ) {
      return
    }

    presentVerifiedSecurityCode.value = securityCode
    presentCodeVerified.value = true
    ElMessage.success('短信验证通过')
    logsStore.addLog('兑换券', account.phone, '兑换券赠送短信验证通过')
  } catch (error) {
    if (!isPresentOperationCurrent(operationSerial, account.id) || !presentDialogVisible.value) {
      return
    }

    presentCodeVerified.value = false
    presentVerifiedSecurityCode.value = ''
    const message = getErrorMessage(error, '短信验证失败')
    ElMessage.error(message)
    logsStore.addLog('兑换券', account.phone, `兑换券赠送短信验证失败：${message}`)
  } finally {
    if (isPresentOperationCurrent(operationSerial, account.id)) {
      validatingPresentCode.value = false
    }
  }
}

function handlePresentSecurityCodeInput() {
  presentCodeVerified.value = false
  presentVerifiedSecurityCode.value = ''
}

async function handleConfirmPresent() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const operationSerial = presentOperationSerial.value

  if (!/^1[3-9]\d{9}$/.test(presentTargetMobile.value.trim())) {
    ElMessage.warning('请输入正确的接收手机号')
    return
  }

  if (presentNeedCheck.value && !presentSecurityCode.value.trim()) {
    ElMessage.warning('请先输入短信验证码')
    return
  }

  if (presentNeedCheck.value && presentVerifiedSecurityCode.value !== presentSecurityCode.value.trim()) {
    presentCodeVerified.value = false
  }

  if (presentNeedCheck.value && !presentCodeVerified.value) {
    await handleValidatePresentCode()

    if (!presentCodeVerified.value) {
      return
    }
  }

  if (!isPresentOperationCurrent(operationSerial, account.id)) {
    return
  }

  submittingPresent.value = true

  try {
    const couponNos = getPresentCouponNos(pendingPresentCoupons.value)

    await presentMemberCoupons(
      couponNos,
      presentTargetMobile.value.trim(),
      presentMemberPhone.value,
      presentRequestId.value,
      presentVerifiedSecurityCode.value,
      account.ck,
      account.userIdentifier
    )

    if (!isPresentOperationCurrent(operationSerial, account.id)) {
      return
    }

    ElMessage.success('兑换券赠送成功')
    logsStore.addLog('兑换券', account.phone, `兑换券赠送成功：${couponNos.length} 张`)
    presentDialogVisible.value = false
    selectedCoupons.value = []
    await loadCoupons()
  } catch (error) {
    if (!isPresentOperationCurrent(operationSerial, account.id)) {
      return
    }

    const message = getErrorMessage(error, '兑换券赠送失败')
    ElMessage.error(message)
    logsStore.addLog('兑换券', account.phone, `兑换券赠送失败：${message}`)
  } finally {
    if (isPresentOperationCurrent(operationSerial, account.id)) {
      submittingPresent.value = false
    }
  }
}

function handleSelectionChange(rows: MemberCouponRow[]) {
  selectedCoupons.value = rows
}

function showCouponDetail(row: MemberCouponRow) {
  currentCouponDetail.value = row
  couponDetailDialogVisible.value = true
}

function showStats() {
  ElMessage.info(`当前已加载 ${coupons.value.length} 张兑换券，可见 ${couponRows.value.length} 张`)
}

onMounted(() => {
  void loadCoupons()
})

onBeforeUnmount(() => {
  clearPresentTimer()
})

watch(
  () => accountsStore.currentAccountId,
  () => {
    selectedCoupons.value = []
    couponLoadSerial += 1
    presentDialogVisible.value = false
    couponDetailDialogVisible.value = false
    resetPresentForm()
    void loadCoupons()
  }
)
</script>

<template>
  <section class="coupon-page table-page">
    <header class="page-toolbar">
      <div class="page-title">
        <el-icon><Present /></el-icon>
        <strong>兑换券</strong>
        <el-tag round>{{ coupons.length }}</el-tag>
      </div>
      <span class="toolbar-spacer" />
      <el-button type="primary" @click="handleBindCoupon">绑定卡券</el-button>
      <el-button type="warning" :loading="presentPreparing" @click="handleBatchPresent">批量赠送</el-button>
      <el-select v-model="nameFilter" placeholder="按名称筛选" clearable>
        <el-option v-for="name in nameOptions" :key="name" :label="name" :value="name" />
      </el-select>
      <el-select v-model="typeFilter" placeholder="按分类筛选" clearable>
        <el-option v-for="type in typeOptions" :key="type" :label="type" :value="type" />
      </el-select>
      <el-button @click="ElMessage.info('分类筛选已使用当前真实兑换券数据')">分类管理</el-button>
      <el-input v-model="keyword" placeholder="搜索关键词" :prefix-icon="Search" />
      <el-button @click="showStats">统计</el-button>
      <el-button :icon="Refresh" :loading="loading" @click="loadCoupons">刷新</el-button>
    </header>

    <section class="table-panel">
      <el-table
        v-loading="loading"
        :data="couponRows"
        height="100%"
        :empty-text="couponMessage || '暂无数据'"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="voucherNo" label="券号" min-width="170" />
        <el-table-column prop="couponNo" label="couponNo" min-width="170" />
        <el-table-column prop="name" label="券名称" min-width="180" />
        <el-table-column prop="type" label="类型" width="130" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="validity" label="有效期" min-width="180" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="showCouponDetail(row)">详情</el-button>
            <el-button link :loading="presentPreparing" @click="openPresentDialog(row)">赠送</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="presentDialogVisible" title="赠送兑换券" width="520px" @closed="resetPresentForm">
      <el-alert
        v-if="presentNeedCheck"
        title="本次赠送需要短信验证"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-form label-width="96px" class="present-form">
        <el-form-item label="赠送券数">
          <el-tag type="primary">{{ pendingPresentCoupons.length }} 张</el-tag>
        </el-form-item>
        <el-form-item label="赠送账号">
          <el-input v-model="presentMemberPhone" disabled />
        </el-form-item>
        <el-form-item v-if="presentNeedCheck" label="短信验证码">
          <div class="sms-row">
            <el-input
              v-model="presentSecurityCode"
              placeholder="输入验证码"
              maxlength="8"
              @input="handlePresentSecurityCodeInput"
            />
            <el-button :loading="sendingPresentCode" :disabled="presentCountdown > 0" @click="handleSendPresentCode">
              {{ presentCountdown > 0 ? `${presentCountdown}s` : '获取验证码' }}
            </el-button>
            <el-button :loading="validatingPresentCode" @click="handleValidatePresentCode">验证</el-button>
          </div>
        </el-form-item>
        <el-form-item label="接收手机号">
          <el-input v-model.trim="presentTargetMobile" placeholder="输入接收人手机号" maxlength="11" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="presentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingPresent" @click="handleConfirmPresent">确认赠送</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="couponDetailDialogVisible" title="兑换券详情" width="640px">
      <el-descriptions v-if="currentCouponDetail" :column="2" border>
        <el-descriptions-item label="券号">{{ currentCouponDetail.voucherNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="couponNo">{{ currentCouponDetail.couponNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="名称">{{ currentCouponDetail.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentCouponDetail.type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ currentCouponDetail.status || '-' }}</el-descriptions-item>
        <el-descriptions-item label="有效期">{{ currentCouponDetail.validity || '-' }}</el-descriptions-item>
      </el-descriptions>
      <pre class="detail-json">{{ currentCouponJson }}</pre>
    </el-dialog>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 1100px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px minmax(0, 1fr);
  gap: 16px;
}

.page-toolbar {
  display: grid;
  grid-template-columns: auto minmax(12px, 1fr) 88px 88px 150px 150px 88px minmax(160px, 220px) 74px 78px;
  gap: 10px;
  align-items: center;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-size: 16px;
}

.page-title :deep(.el-icon) {
  color: var(--app-accent);
}

.toolbar-spacer {
  min-width: 0;
}

.table-panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
}

.present-form {
  margin-top: 14px;
}

.sms-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px 74px;
  gap: 8px;
}

.detail-json {
  max-height: 260px;
  margin: 14px 0 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-muted);
  color: var(--app-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
