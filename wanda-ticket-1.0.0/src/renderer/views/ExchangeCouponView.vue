<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Link, Present, Refresh, Search } from '@element-plus/icons-vue'

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
import type { CouponCategory } from '@shared/localData'

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()

const coupons = ref<MemberCouponRow[]>([])
const selectedCoupons = ref<MemberCouponRow[]>([])
const couponCategories = ref<CouponCategory[]>([])
const keyword = ref('')
const nameFilter = ref('')
const categoryFilter = ref('')
const loading = ref(false)
const couponMessage = ref('')
const categoryDialogVisible = ref(false)
const presentDialogVisible = ref(false)
const couponDetailDialogVisible = ref(false)
const currentCouponDetail = ref<MemberCouponRow | null>(null)
const newCategoryName = ref('')
const statsMode = ref(false)

const bindDialogVisible = ref(false)
const bindInput = ref('')
const bindSubmitting = ref(false)
const bindResult = ref<{ successCount: number; failCount: number; failMsgs: string[] } | null>(null)

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

const pointsInsufficient = ref(false)
const remainingPoints = ref<number | null>(null)
const isDurationUser = ref(true)
let couponLoadSerial = 0

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function maskVoucherNo(value: string): string {
  const rawValue = String(value || '').replace(/\s/g, '')

  if (rawValue.length <= 8) {
    return rawValue || '-'
  }

  return `${rawValue.slice(0, 4)}****${rawValue.slice(-4)}`
}

function copyCouponName(value: string) {
  void navigator.clipboard.writeText(value || '-')
}

function createCategoryId(): string {
  return `cat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
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

function toPlainCategories(): CouponCategory[] {
  return couponCategories.value.map((category) => ({
    id: category.id,
    name: category.name,
    couponNames: [...category.couponNames]
  }))
}

async function loadCouponCategories() {
  const result = await window.wandaApp?.readLocalData('categories')

  if (!result?.ok) {
    couponCategories.value = []
    return
  }

  couponCategories.value = result.data.categories
}

async function saveCouponCategories() {
  const result = await window.wandaApp?.writeLocalData('categories', {
    categories: toPlainCategories()
  })

  if (!result?.ok) {
    throw new Error(result?.error || '分类保存失败')
  }
}

async function addCouponCategory() {
  const name = newCategoryName.value.trim()

  if (!name) {
    return
  }

  if (couponCategories.value.some((category) => category.name === name)) {
    ElMessage.warning('分类名称已存在')
    return
  }

  couponCategories.value.push({
    id: createCategoryId(),
    name,
    couponNames: []
  })
  newCategoryName.value = ''

  try {
    await saveCouponCategories()
    ElMessage.success('分类已保存')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '分类保存失败'))
  }
}

async function removeCouponCategory(categoryId: string) {
  const confirmed = await ElMessageBox.confirm('确认删除该分类？', '分类管理', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  }).catch(() => false)

  if (!confirmed) {
    return
  }

  couponCategories.value = couponCategories.value.filter((category) => category.id !== categoryId)

  if (categoryFilter.value === categoryId) {
    categoryFilter.value = ''
  }

  try {
    await saveCouponCategories()
    ElMessage.success('分类已删除')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '分类删除失败'))
  }
}

function openCategoryDialog() {
  categoryDialogVisible.value = true
  void loadCouponCategories()
}

async function handleCategoryCouponNamesChange() {
  try {
    await saveCouponCategories()
    ElMessage.success('分类已保存')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '分类保存失败'))
  }
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

const couponRows = computed(() => {
  const searchText = keyword.value.trim().toLowerCase()
  let rows = [...coupons.value]

  if (nameFilter.value) {
    rows = rows.filter((coupon) => coupon.name === nameFilter.value)
  }

  if (categoryFilter.value) {
    const category = couponCategories.value.find((item) => item.id === categoryFilter.value)

    if (category) {
      const categoryCouponNames = new Set(category.couponNames)
      rows = rows.filter((coupon) => categoryCouponNames.has(coupon.name))
    }
  }

  if (searchText) {
    rows = rows.filter((coupon) =>
      [coupon.voucherNo, coupon.couponNo, coupon.name, coupon.couponTypeName, coupon.couponId]
        .join(' ')
        .toLowerCase()
        .includes(searchText)
    )
  }

  return rows
})

const nameOptions = computed(() => [...new Set(coupons.value.map((coupon) => coupon.name).filter(Boolean))])

const couponNameStats = computed(() => {
  const stats = new Map<string, number>()

  coupons.value.forEach((coupon) => {
    const name = coupon.name || '未知'
    stats.set(name, (stats.get(name) || 0) + 1)
  })

  return Array.from(stats.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})

const bindPreviewItems = computed(() => {
  const lines = bindInput.value
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line) => {
    const parts = line.split('----')
    if (parts.length > 1) {
      return {
        cardNo: parts[0].trim(),
        password: parts.slice(1).join('----').trim()
      }
    }

    return {
      cardNo: line,
      password: ''
    }
  })
})

const currentCouponJson = computed(() => JSON.stringify(currentCouponDetail.value?.raw ?? currentCouponDetail.value, null, 2))

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
    couponMessage.value = coupons.value.length > 0 ? '' : '暂无兑换券'
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

function handleSelectionChange(rows: MemberCouponRow[]) {
  selectedCoupons.value = rows
}

function showCouponDetail(row: MemberCouponRow) {
  currentCouponDetail.value = row
  couponDetailDialogVisible.value = true
}

function showStats() {
  statsMode.value = !statsMode.value
}

function openBindDialog() {
  bindInput.value = ''
  bindResult.value = null
  bindDialogVisible.value = true
}

async function handleBatchBind() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  if (bindPreviewItems.value.length === 0) {
    ElMessage.warning('请输入卡券信息')
    return
  }

  bindSubmitting.value = true
  const failMsgs: string[] = []
  let successCount = 0

  try {
    for (const item of bindPreviewItems.value) {
      const safeVoucherNumber = maskVoucherNo(item.cardNo)

      try {
        await bindMemberCoupon(item.cardNo, item.password, account.ck, account.userIdentifier)
        successCount += 1
        logsStore.addLog('兑换券', account.phone, `绑定卡券成功：${safeVoucherNumber}`)
      } catch (error) {
        const message = getErrorMessage(error, '绑定失败')
        failMsgs.push(`${item.cardNo}：${message}`)
        logsStore.addLog('兑换券', account.phone, `绑定卡券失败：${message}`)
      }
    }

    bindResult.value = {
      successCount,
      failCount: failMsgs.length,
      failMsgs
    }

    if (successCount > 0) {
      ElMessage.success(`成功绑定 ${successCount} 张卡券`)
      logsStore.addLog('兑换券', account.phone, `批量绑定卡券成功：${successCount} 张`)
      await loadCoupons()
    }

    if (failMsgs.length > 0) {
      ElMessage.warning(`有 ${failMsgs.length} 张卡券绑定失败`)
      logsStore.addLog('兑换券', account.phone, `批量绑定卡券失败：${failMsgs.length} 张`)
    }
  } finally {
    bindSubmitting.value = false
  }
}

function handlePresentSecurityCodeInput() {
  presentCodeVerified.value = false
  presentVerifiedSecurityCode.value = ''
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

async function handleGenerateCouponLink(row: MemberCouponRow) {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const couponId = String(row.couponId || '').trim()
  const couponName = String(row.couponTypeName || row.name || '').trim()
  const validitySource = String(row.validityDateShowMsg || row.validity || '').trim()
  const validityText = validitySource.replace('有效期：', '').replace('有效期:', '').trim()
  const couponType = String(row.couponCategoryName || row.type || '').trim()

  if (!couponId) {
    ElMessage.warning('兑换券编号缺失')
    return
  }

  try {
    const wandaApp = window.wandaApp

    if (!wandaApp) {
      throw new Error('Electron 桥接未就绪')
    }

    const shareHost = ['qp', 'sxjrj', 'cn'].join('.')
    const requestUrl =
      `http://${shareHost}/sc.php?qh=${encodeURIComponent(couponId)}` +
      `&name=${encodeURIComponent(couponName)}` +
      `&youxiaoqi=${encodeURIComponent(validityText)}` +
      `&type=${encodeURIComponent(couponType)}` +
      `&ck=${encodeURIComponent(account.ck)}`
    const result = await wandaApp.wandaHttpGet({
      url: requestUrl,
      headers: {}
    })

    if (!result.ok) {
      throw new Error(result.error || '生成分享链接失败')
    }

    const rawResult =
      typeof result.data === 'string'
        ? result.data
        : typeof (result.data as { raw?: unknown } | null)?.raw === 'string'
          ? String((result.data as { raw?: unknown }).raw)
          : JSON.stringify(result.data)

    if (rawResult.trim().toLowerCase() !== 'ok') {
      throw new Error(rawResult || '生成分享链接失败')
    }

    const finalUrl = `http://${shareHost}?qh=${couponId}`
    await navigator.clipboard.writeText(finalUrl)
    ElMessage.success(`兑换链接已复制
${finalUrl}`)
    logsStore.addLog('兑换券', account.phone, `生成兑换链接 ${maskVoucherNo(couponId)}`)
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '????'))
  }
}

function isExpiringSoon(row: MemberCouponRow): boolean {
  if (!row.endTime) {
    return false
  }

  const endTime = row.endTime < 1_000_000_000_000 ? row.endTime * 1000 : row.endTime
  return endTime - Date.now() < 7 * 24 * 60 * 60 * 1000
}

onMounted(() => {
  void loadCouponCategories()
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
    bindDialogVisible.value = false
    resetPresentForm()
    void loadCoupons()
  }
)
</script>

<template>
  <section class="page-container">
    <div v-if="!accountsStore.currentAccount" class="no-account-hint">
      <el-empty description="请先在左侧选择一个已登录的万达账号" :image-size="80" />
    </div>

    <template v-else>
      <div v-if="loading" class="loading-wrapper">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else class="section-wrapper">
        <div class="section-header">
          <span class="section-title">
            <el-icon><Present /></el-icon>
            兑换券
            <span class="count-badge">{{ couponRows.length }}</span>
          </span>

          <div class="section-header-actions">
            <el-button size="small" type="primary" @click="openBindDialog">绑定卡券</el-button>
            <el-button size="small" type="warning" @click="handleBatchPresent">批量赠送<span v-if="selectedCoupons.length > 0"> ({{ selectedCoupons.length }})</span></el-button>
            <el-select v-model="nameFilter" placeholder="选择券名称" size="small" clearable style="width: 160px">
              <el-option v-for="name in nameOptions" :key="name" :label="name" :value="name" />
            </el-select>
            <el-select v-model="categoryFilter" placeholder="按分类筛选" size="small" clearable style="width: 160px">
              <el-option v-for="category in couponCategories" :key="category.id" :label="category.name" :value="category.id" />
            </el-select>
            <el-button size="small" @click="openCategoryDialog">分类管理</el-button>
            <el-input v-model="keyword" placeholder="搜索关键字" size="small" clearable style="width: 200px">
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button size="small" :type="statsMode ? 'warning' : 'default'" @click="showStats">
              {{ statsMode ? '明细' : '统计' }}
            </el-button>
            <el-button size="small" :icon="Refresh" :loading="loading" @click="loadCoupons">刷新</el-button>
          </div>
        </div>

        <div class="coupon-table-wrapper">
          <el-table
            v-if="statsMode"
            :data="couponNameStats"
            size="default"
            stripe
            height="100%"
            :empty-text="couponMessage || '暂无统计数据'"
          >
            <el-table-column type="index" label="#" width="50" align="center" />
            <el-table-column prop="name" label="券名称" min-width="220" show-overflow-tooltip />
            <el-table-column prop="count" label="张数" width="120" align="center">
              <template #default="{ row }">
                <el-tag type="warning" size="small">{{ row.count }}</el-tag>
              </template>
            </el-table-column>
          </el-table>

          <el-table
            v-else
            :data="couponRows"
            size="default"
            stripe
            height="100%"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="40" />
            <el-table-column prop="couponId" label="券号" width="160" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="coupon-code">{{ row.couponId || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="couponNo" label="couponNo" width="135" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="coupon-code">{{ row.couponNo || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="couponTypeName" label="券名称" min-width="200" show-overflow-tooltip sortable="custom">
              <template #default="{ row }">
                <span class="copyable-cell" :title="`点击复制: ${row.couponTypeName || '-'}`" @click="copyCouponName(row.couponTypeName || '-')">
                  {{ row.couponTypeName || '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="100" align="center">
              <template #default="{ row }">
                <el-tag size="small">{{ row.couponCategoryName || '-' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.giftStatus === 1 ? 'success' : 'info'" size="small">
                  {{ row.giftStatus === 1 ? '可赠送' : '不可赠送' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="endTime" label="有效期" width="200" show-overflow-tooltip sortable="custom">
              <template #default="{ row }">
                <span :class="{ 'expiring-date': isExpiringSoon(row) }">
                  {{ (row.validityDateShowMsg || '').replace('有效期：', '').replace('有效期:', '') }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220" align="center" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="handleGenerateCouponLink(row)">
                  生成链接
                </el-button>
                <el-button size="small" type="warning" link :disabled="row.giftStatus !== 1" @click="openPresentDialog(row)">
                  赠送
                </el-button>
                <el-button size="small" link @click="showCouponDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-empty v-if="!statsMode && couponRows.length === 0" description="暂无兑换券" :image-size="80" />
        </div>
      </div>
    </template>

    <el-dialog v-model="presentDialogVisible" :title="pendingPresentCoupons.length > 1 ? '批量赠送兑换券' : '赠送兑换券'" width="520px" :close-on-click-modal="false" @closed="resetPresentForm">
      <div class="coupon-gift-list">
        <p class="coupon-gift-hint">共 {{ pendingPresentCoupons.length }} 张兑换券</p>
        <div class="coupon-gift-items">
          <el-tag v-for="coupon in pendingPresentCoupons" :key="coupon.couponNo" size="small" style="margin: 2px">
            {{ coupon.couponTypeName || coupon.couponNo?.substring(0, 12) }}
          </el-tag>
        </div>
      </div>

      <el-alert v-if="presentNeedCheck" title="本次赠送需要短信验证" type="warning" :closable="false" show-icon />

      <el-form label-position="top" class="gift-form" style="margin-top: 16px">
        <el-form-item label="接收人手机号">
          <el-input v-model="presentTargetMobile" placeholder="请输入接收人手机号" maxlength="11" clearable :disabled="submittingPresent" />
        </el-form-item>
        <el-form-item v-if="presentNeedCheck" label="短信验证码">
          <div class="sms-row">
            <el-input
              v-model="presentSecurityCode"
              placeholder="请输入 6 位验证码"
              maxlength="6"
              clearable
              :disabled="validatingPresentCode"
              @input="handlePresentSecurityCodeInput"
            />
            <el-button type="primary" :loading="sendingPresentCode" :disabled="sendingPresentCode || presentCountdown > 0" @click="handleSendPresentCode">
              {{ presentCountdown > 0 ? `已发送 (${presentCountdown}s)` : '获取验证码' }}
            </el-button>
            <el-button type="primary" :loading="validatingPresentCode" :disabled="presentSecurityCode.length !== 6" @click="handleValidatePresentCode">
              验证
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <div class="gift-dialog-footer">
        <el-button :disabled="submittingPresent" @click="presentDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingPresent" :disabled="!/^1[3-9]\d{9}$/.test(presentTargetMobile)" @click="handleConfirmPresent">
          确认赠送
        </el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="bindDialogVisible" title="绑定卡券" width="600px" :close-on-click-modal="false" @closed="bindInput = ''; bindSubmitting = false; bindResult = null">
      <div class="bind-dialog-body">
        <el-form label-position="top">
          <el-form-item label="卡券信息（支持多行，每行一张）">
            <el-input
              v-model="bindInput"
              type="textarea"
              :rows="5"
              placeholder="卡号----密码&#10;或 纯卡号（无密码）&#10;支持多行批量输入"
              :disabled="bindSubmitting"
            />
          </el-form-item>
        </el-form>

        <div v-if="bindPreviewItems.length > 0" class="bind-preview">
          <p class="bind-preview-title">识别到 {{ bindPreviewItems.length }} 张卡券：</p>
          <div class="bind-preview-list">
            <div v-for="(item, index) in bindPreviewItems" :key="`${item.cardNo}-${index}`" class="bind-preview-item">
              <span class="bind-preview-index">{{ index + 1 }}.</span>
              <span class="bind-preview-no">{{ item.cardNo }}</span>
              <el-tag v-if="item.password" size="small" type="warning">有密码</el-tag>
              <el-tag v-else size="small" type="info">无密码</el-tag>
            </div>
          </div>
        </div>

        <div v-if="bindResult" class="bind-result">
          <el-alert :type="bindResult.successCount > 0 ? 'success' : 'error'" :closable="false">
            <template #title>
              成功 {{ bindResult.successCount }} 张{{ bindResult.failCount > 0 ? `，失败 ${bindResult.failCount} 张` : '' }}
            </template>
            <template v-if="bindResult.failCount > 0">
              <div v-for="(message, index) in bindResult.failMsgs" :key="index" class="bind-fail-msg">{{ message }}</div>
            </template>
          </el-alert>
        </div>
      </div>

      <div class="gift-dialog-footer">
        <el-button :disabled="bindSubmitting" @click="bindDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="bindSubmitting" :disabled="bindPreviewItems.length === 0" @click="handleBatchBind">
          确认绑定
        </el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="categoryDialogVisible" title="分类管理" width="460px" :close-on-click-modal="false" destroy-on-close>
      <div class="category-manage-body">
        <div class="cat-add-row">
          <el-input v-model="newCategoryName" placeholder="输入新分类名称" size="small" style="width: 180px" @keyup.enter="addCouponCategory" />
          <el-button size="small" type="primary" :disabled="!newCategoryName.trim()" @click="addCouponCategory">添加分类</el-button>
        </div>

        <div v-if="couponCategories.length === 0" class="cat-empty">暂无分类，请添加</div>

        <template v-for="category in couponCategories" :key="category.id">
          <div class="cat-item">
            <div class="cat-header">
              <el-input v-model="category.name" size="small" style="width: 180px" @change="saveCouponCategories" />
              <el-popconfirm title="确定删除此分类？" @confirm="removeCouponCategory(category.id)">
                <template #reference>
                  <el-button size="small" type="danger" text>删除</el-button>
                </template>
              </el-popconfirm>
            </div>
            <el-select
              v-model="category.couponNames"
              multiple
              filterable
              placeholder="选择券名称"
              size="small"
              style="width: 100%"
              @change="handleCategoryCouponNamesChange"
            >
              <el-option v-for="name in nameOptions" :key="name" :label="name" :value="name" />
            </el-select>
            <div class="cat-count">已选 {{ category.couponNames.length }} 种券</div>
          </div>
        </template>
      </div>
    </el-dialog>

    <el-dialog v-model="couponDetailDialogVisible" title="券信息" width="460px" :close-on-click-modal="false">
      <el-descriptions v-if="currentCouponDetail" :column="1" border>
        <el-descriptions-item label="券号">{{ currentCouponDetail.couponId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="couponNo">{{ currentCouponDetail.couponNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="券名称">{{ currentCouponDetail.couponTypeName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentCouponDetail.couponCategoryName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="有效期">{{ currentCouponDetail.validityDateShowMsg || '-' }}</el-descriptions-item>
      </el-descriptions>
      <pre class="detail-json">{{ currentCouponJson }}</pre>
    </el-dialog>

    <div v-if="pointsInsufficient" class="points-lock-overlay">
      <div class="points-lock-tip">
        <p>当前积分不足，请充值后再操作</p>
        <p v-if="remainingPoints !== null">当前剩余 {{ remainingPoints }} 积分</p>
        <p v-if="isDurationUser">时长用户不受积分限制</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.no-account-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.loading-wrapper {
  padding: 24px;
}

.section-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px var(--spacing-md);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.section-title :deep(.el-icon) {
  color: var(--wanda-primary);
}

.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--wanda-primary);
  border-radius: 11px;
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coupon-table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
}

.coupon-table-wrapper :deep(.el-table) {
  flex: 1;
  min-height: 0;
  --el-table-border-color: var(--border-light);
  font-size: 13px;
}

.coupon-table-wrapper :deep(.el-table th.el-table__cell) {
  background: var(--bg-secondary, #fafbfc);
  font-weight: 600;
  color: var(--text-primary);
}

.coupon-code {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.copyable-cell {
  cursor: pointer;
  color: #409eff;
  transition: color 0.2s;
}

.copyable-cell:hover {
  color: #66b1ff;
  text-decoration: underline;
}

.expiring-date {
  color: #e6a23c;
  font-weight: 600;
}

.coupon-gift-list {
  padding: 8px 0;
}

.coupon-gift-hint {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.coupon-gift-items {
  max-height: 120px;
  overflow-y: auto;
}

.gift-form {
  margin-bottom: 0;
}

.gift-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.sms-row {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
}

.bind-dialog-body {
  max-height: 60vh;
  overflow-y: auto;
}

.bind-preview {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  max-height: 150px;
  overflow-y: auto;
}

.bind-preview-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.bind-preview-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bind-preview-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-family: 'Courier New', monospace;
}

.bind-preview-index {
  color: var(--text-secondary);
  min-width: 24px;
}

.bind-preview-no {
  flex: 1;
  word-break: break-all;
}

.bind-result {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
}

.bind-fail-msg {
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.category-manage-body {
  max-height: 450px;
  overflow-y: auto;
}

.cat-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.cat-empty {
  text-align: center;
  color: #c0c4cc;
  padding: 24px 0;
  font-size: 14px;
}

.cat-item {
  padding: 12px;
  margin-bottom: 8px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.cat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.cat-count {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
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

.points-lock-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: rgb(255 255 255 / 75%);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.points-lock-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #f56c6c;
  font-size: 18px;
  font-weight: 600;
}

.points-lock-tip p {
  margin: 0;
  color: #666;
  font-size: 15px;
  font-weight: 500;
}
</style>

<!--
  Contract compatibility markers:
  @click="handleBindCoupon"
-->
