<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CreditCard, Refresh, ShoppingCart } from '@element-plus/icons-vue'

import {
  STORED_CARD_DENOMINATIONS,
  createStoredCardPurchasePayment,
  createStoredCardRechargePayment,
  fetchStoredCardsWithBalance,
  transferStoredCard,
  type StoredCardBalanceInfo,
  type StoredCardPaymentResult,
  type StoredCardRow
} from '@renderer/services/featureApi'
import { openAlipayPayment } from '@renderer/services/alipayBridge'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'
import { useSettingsStore } from '@renderer/stores/settings'
import type { WandaAccount } from '@shared/localData'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'
const CARD_DISPLAY_MODE_KEY = 'setting_paycard_display_mode'

interface PaymentDialogData extends StoredCardPaymentResult {
  title: string
  amountLabel: string
}

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const settingsStore = useSettingsStore()
const cards = ref<StoredCardRow[]>([])
const balanceInfo = ref<StoredCardBalanceInfo | null>(null)
const loading = ref(false)
const loadingAll = ref(false)
const cardsMessage = ref('')
const cardDisplayMode = ref<'table' | 'card'>(
  localStorage.getItem(CARD_DISPLAY_MODE_KEY) === 'card' ? 'card' : 'table'
)

const detailDialogVisible = ref(false)
const purchaseDialogVisible = ref(false)
const rechargeDialogVisible = ref(false)
const transferDialogVisible = ref(false)
const paymentResultDialogVisible = ref(false)

const selectedCard = ref<StoredCardRow | null>(null)
const purchaseAmount = ref(STORED_CARD_DENOMINATIONS[0].value)
const rechargeAmount = ref(STORED_CARD_DENOMINATIONS[0].value)
const transferMobile = ref('')
const submittingPurchase = ref(false)
const submittingRecharge = ref(false)
const submittingTransfer = ref(false)
const openingAlipay = ref(false)
const paymentResult = ref<PaymentDialogData | null>(null)

let loadSerial = 0

const cardRows = computed(() => cards.value)
const availableCardCount = computed(() => cards.value.filter((card) => !isStoredCardDisabled(card)).length)
const unavailableCardCount = computed(() => cards.value.filter((card) => isStoredCardDisabled(card)).length)
const normalBalance = computed(
  () => balanceInfo.value?.balance ?? cards.value.reduce((sum, card) => sum + card.balance, 0)
)
const presentBalance = computed(
  () => balanceInfo.value?.presentBalance ?? cards.value.reduce((sum, card) => sum + card.presentBalance, 0)
)
const totalBalance = computed(() =>
  balanceInfo.value?.totalBalance ?? Number((normalBalance.value + presentBalance.value).toFixed(2))
)
const paymentResultText = computed(() => {
  if (!paymentResult.value) {
    return ''
  }

  return JSON.stringify(
    {
      orderId: paymentResult.value.orderId,
      amount: paymentResult.value.amountLabel,
      appPayParam: paymentResult.value.appPayParam,
      raw: paymentResult.value.raw
    },
    null,
    2
  )
})
const detailRawText = computed(() => (selectedCard.value ? JSON.stringify(selectedCard.value.raw, null, 2) : ''))

function formatMoney(value: number): string {
  return `¥${Number(value || 0).toFixed(2)}`
}

function isStoredCardDisabled(row: StoredCardRow): boolean {
  const statusText = `${row.statusDesc || row.status || ''}`
  return !row.available || /禁用|停用|冻结|失效/.test(statusText)
}

function getStoredCardStatusTagType(row: StoredCardRow): 'success' | 'danger' {
  return isStoredCardDisabled(row) ? 'danger' : 'success'
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function maskCardNo(value: string): string {
  const rawValue = String(value || '').replace(/\s/g, '')

  if (rawValue.length <= 8) {
    return rawValue || '-'
  }

  return `${rawValue.slice(0, 4)}****${rawValue.slice(-4)}`
}

function maskPhone(value: string): string {
  const rawValue = String(value || '').trim()

  if (!/^1\d{10}$/.test(rawValue)) {
    return rawValue || '-'
  }

  return `${rawValue.slice(0, 3)}****${rawValue.slice(-4)}`
}

function normalizePhone(value: string): string {
  return String(value || '').replace(/\s/g, '').trim()
}

function withRuntimeAccount(account: WandaAccount) {
  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
}

function nextLoadSerial(): number {
  loadSerial += 1
  return loadSerial
}

function isCurrentLoad(serial: number): boolean {
  return serial === loadSerial
}

function getCurrentAccount() {
  const account = accountsStore.currentAccount

  if (!account?.ck) {
    cards.value = []
    balanceInfo.value = null
    cardsMessage.value = '请选择已登录的万达账号'
    return null
  }

  return withRuntimeAccount(account)
}

function getCardActionAccount(card: StoredCardRow) {
  const ownerPhone = normalizePhone(card.ownerPhone || card.holder)
  const ownerAccount = accountsStore.accounts.find(
    (account) => ownerPhone && account.ck && normalizePhone(account.phone) === ownerPhone
  )

  if (ownerAccount) {
    return withRuntimeAccount(ownerAccount)
  }

  const currentAccount = accountsStore.currentAccount
  const currentPhone = normalizePhone(currentAccount?.phone || '')

  if (currentAccount?.ck && (!ownerPhone || currentPhone === ownerPhone)) {
    return withRuntimeAccount(currentAccount)
  }

  if (ownerPhone) {
    ElMessage.warning(`这张储值卡属于 ${maskPhone(ownerPhone)}，请先登录或导入对应账号`)
    return null
  }

  return getCurrentAccount()
}

function withOwner(card: StoredCardRow, phone: string): StoredCardRow {
  return {
    ...card,
    holder: card.holder || phone,
    ownerPhone: card.ownerPhone || phone
  }
}

function findDenomination(value: number) {
  return STORED_CARD_DENOMINATIONS.find((item) => item.value === value) ?? STORED_CARD_DENOMINATIONS[0]
}

async function loadCards() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const serial = nextLoadSerial()
  loading.value = true
  cardsMessage.value = ''

  try {
    const result = await fetchStoredCardsWithBalance(account.ck, account.userIdentifier)

    if (!isCurrentLoad(serial)) {
      return
    }

    cards.value = result.cards.map((card) => withOwner(card, account.phone))
    balanceInfo.value = result.balanceInfo
    await accountsStore.updateAccountProfileSummary(account.id, {
      storedCardCount: cards.value.length
    }).catch((error) => {
      logsStore.addLog('储值卡', account.phone, `账号储值卡摘要保存失败：${getErrorMessage(error, '保存失败')}`)
    })
    cardsMessage.value = cards.value.length > 0 ? '' : '暂无可用储值卡'
    logsStore.addLog('储值卡', account.phone, `储值卡加载成功：${cards.value.length} 张`)
  } catch (error) {
    if (!isCurrentLoad(serial)) {
      return
    }

    const message = getErrorMessage(error, '储值卡加载失败')
    cards.value = []
    balanceInfo.value = null
    cardsMessage.value = message
    logsStore.addLog('储值卡', account.phone, `储值卡加载失败：${message}`)
  } finally {
    if (isCurrentLoad(serial)) {
      loading.value = false
    }
  }
}

async function loadAllAccountsCards() {
  const accounts = accountsStore.accounts
    .filter((account) => account.ck)
    .map((account) => ({ ...account, userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER }))

  if (accounts.length === 0) {
    ElMessage.warning('请先登录或导入万达账号')
    return
  }

  const serial = nextLoadSerial()
  loadingAll.value = true
  loading.value = true
  cardsMessage.value = ''

  const mergedCards: StoredCardRow[] = []
  let balanceTotal = 0
  let presentTotal = 0

  try {
    for (const account of accounts) {
      if (!isCurrentLoad(serial)) {
        return
      }

      try {
        const result = await fetchStoredCardsWithBalance(account.ck, account.userIdentifier)

        mergedCards.push(...result.cards.map((card) => withOwner(card, account.phone)))
        await accountsStore.updateAccountProfileSummary(account.id, {
          storedCardCount: result.cards.length
        }).catch((error) => {
          logsStore.addLog('储值卡', account.phone, `账号储值卡摘要保存失败：${getErrorMessage(error, '保存失败')}`)
        })
        balanceTotal += result.balanceInfo?.balance ?? result.cards.reduce((sum, card) => sum + card.balance, 0)
        presentTotal +=
          result.balanceInfo?.presentBalance ?? result.cards.reduce((sum, card) => sum + card.presentBalance, 0)
        logsStore.addLog('储值卡', account.phone, `账号储值卡加载成功：${result.cards.length} 张`)
      } catch (error) {
        const message = getErrorMessage(error, '账号储值卡加载失败')
        logsStore.addLog('储值卡', account.phone, `账号储值卡加载失败：${message}`)
      }
    }

    if (!isCurrentLoad(serial)) {
      return
    }

    cards.value = mergedCards
    balanceInfo.value = {
      balance: Number(balanceTotal.toFixed(2)),
      presentBalance: Number(presentTotal.toFixed(2)),
      totalBalance: Number(balanceTotal.toFixed(2)),
      raw: null
    }
    cardsMessage.value = cards.value.length > 0 ? '' : '暂无可用储值卡'
    ElMessage.success(`已获取 ${accounts.length} 个账号的储值卡`)
  } finally {
    if (isCurrentLoad(serial)) {
      loading.value = false
      loadingAll.value = false
    }
  }
}

function showCardDetail(row: StoredCardRow) {
  selectedCard.value = row
  detailDialogVisible.value = true
}

function openPurchaseDialog() {
  if (!getCurrentAccount()) {
    return
  }

  purchaseAmount.value = STORED_CARD_DENOMINATIONS[0].value
  purchaseDialogVisible.value = true
}

function openRechargeDialog(row: StoredCardRow) {
  if (!getCurrentAccount()) {
    return
  }

  if (!row.cardNo) {
    ElMessage.warning('储值卡卡号为空')
    return
  }

  selectedCard.value = row
  rechargeAmount.value = STORED_CARD_DENOMINATIONS[0].value
  rechargeDialogVisible.value = true
}

function openTransferDialog(row: StoredCardRow) {
  if (!getCurrentAccount()) {
    return
  }

  if (!row.cardNo) {
    ElMessage.warning('储值卡卡号为空')
    return
  }

  selectedCard.value = row
  transferMobile.value = ''
  transferDialogVisible.value = true
}

function showPaymentResult(title: string, amountLabel: string, result: StoredCardPaymentResult) {
  paymentResult.value = {
    ...result,
    title,
    amountLabel
  }
  paymentResultDialogVisible.value = true
}

async function handleConfirmPurchase() {
  const account = getCurrentAccount()

  if (!account) {
    return
  }

  const denomination = findDenomination(purchaseAmount.value)
  submittingPurchase.value = true

  try {
    const result = await createStoredCardPurchasePayment(denomination.value, account.ck, account.userIdentifier)

    purchaseDialogVisible.value = false
    showPaymentResult('购买储值卡支付参数', denomination.label, result)
    logsStore.addLog('储值卡', account.phone, `购买储值卡支付参数获取成功：${denomination.label}`)
    await handleOpenAlipayPayment()
  } catch (error) {
    const message = getErrorMessage(error, '购买储值卡失败')
    logsStore.addLog('储值卡', account.phone, `购买储值卡失败：${message}`)
    ElMessage.error(message)
  } finally {
    submittingPurchase.value = false
  }
}

async function handleConfirmRecharge() {
  const card = selectedCard.value

  if (!card) {
    return
  }

  const account = getCardActionAccount(card)

  if (!account) {
    return
  }

  const denomination = findDenomination(rechargeAmount.value)
  const safeCardNo = maskCardNo(card.cardNo)
  submittingRecharge.value = true

  try {
    const result = await createStoredCardRechargePayment(
      denomination.value,
      card.cardNo,
      account.ck,
      account.userIdentifier
    )

    rechargeDialogVisible.value = false
    showPaymentResult('储值卡充值支付参数', `${safeCardNo} / ${denomination.label}`, result)
    logsStore.addLog('储值卡', account.phone, `储值卡充值支付参数获取成功：${safeCardNo}`)
    await handleOpenAlipayPayment()
  } catch (error) {
    const message = getErrorMessage(error, '储值卡充值失败')
    logsStore.addLog('储值卡', account.phone, `储值卡充值失败：${message}`)
    ElMessage.error(message)
  } finally {
    submittingRecharge.value = false
  }
}

async function handleConfirmTransfer() {
  const card = selectedCard.value
  const mobile = transferMobile.value.trim()

  if (!card) {
    return
  }

  if (!/^1\d{10}$/.test(mobile)) {
    ElMessage.warning('请输入正确的接收手机号')
    return
  }

  const account = getCardActionAccount(card)

  if (!account) {
    return
  }

  const safeCardNo = maskCardNo(card.cardNo)
  const safeMobile = maskPhone(mobile)
  submittingTransfer.value = true

  try {
    await transferStoredCard(card.cardNo, mobile, account.ck, account.userIdentifier)
    transferDialogVisible.value = false
    logsStore.addLog('储值卡', account.phone, `储值卡赠送成功：${safeCardNo} -> ${safeMobile}`)
    ElMessage.success('储值卡赠送成功')
    await loadCards()
  } catch (error) {
    const message = getErrorMessage(error, '储值卡赠送失败')
    logsStore.addLog('储值卡', account.phone, `储值卡赠送失败：${message}`)
    ElMessage.error(message)
  } finally {
    submittingTransfer.value = false
  }
}

async function copyPaymentResult() {
  if (!paymentResultText.value) {
    return
  }

  try {
    await navigator.clipboard.writeText(paymentResultText.value)
    ElMessage.success('支付参数已复制')
  } catch {
    ElMessage.warning('复制失败，请手动选中支付参数')
  }
}

async function handleOpenAlipayPayment() {
  if (!paymentResult.value?.appPayParam) {
    ElMessage.warning('缺少支付宝支付参数')
    return
  }

  openingAlipay.value = true

  try {
    const result = await openAlipayPayment(paymentResult.value.appPayParam, {
      requestParams: settingsStore.requestParams,
      autoPayment: settingsStore.autoPayment
    })
    ElMessage.success(result.reusedWindow ? '已刷新支付宝支付窗口' : '已打开支付宝支付窗口')
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '打开支付宝支付失败')
  } finally {
    openingAlipay.value = false
  }
}

onMounted(() => {
  void loadCards()
})

watch(
  () => accountsStore.currentAccountId,
  () => {
    selectedCard.value = null
    paymentResult.value = null
    detailDialogVisible.value = false
    purchaseDialogVisible.value = false
    rechargeDialogVisible.value = false
    transferDialogVisible.value = false
    paymentResultDialogVisible.value = false
    void loadCards()
  }
)

watch(cardDisplayMode, (mode) => {
  localStorage.setItem(CARD_DISPLAY_MODE_KEY, mode)
})
</script>

<template>
  <section class="stored-card-page">
    <section class="stored-card-summary-grid" aria-label="储值卡摘要">
      <article class="stored-summary-card stored-summary-card--blue">
        <span>储值卡</span>
        <strong>{{ cardRows.length }}</strong>
        <em>可用 {{ availableCardCount }} 张 · 不可用 {{ unavailableCardCount }} 张</em>
      </article>
      <article class="stored-summary-card stored-summary-card--green">
        <span>总余额</span>
        <strong>{{ formatMoney(totalBalance) }}</strong>
      </article>
      <article class="stored-summary-card">
        <span>本金余额</span>
        <strong>{{ formatMoney(normalBalance) }}</strong>
      </article>
      <article class="stored-summary-card stored-summary-card--amber">
        <span>赠送余额</span>
        <strong>{{ formatMoney(presentBalance) }}</strong>
        <em>不可用 {{ unavailableCardCount }} 张</em>
      </article>
    </section>
    <section class="stored-card-action-panel panel">
      <div class="stored-card-action-left">
        <el-radio-group v-model="cardDisplayMode" class="stored-card-view-toggle" size="small">
          <el-radio-button value="table">列表</el-radio-button>
          <el-radio-button value="card">卡片</el-radio-button>
        </el-radio-group>
        <span class="stored-card-account">当前账号：{{ accountsStore.currentAccount?.phone || '-' }}</span>
      </div>

      <div class="stored-card-action-right">
        <el-button type="success" :icon="ShoppingCart" @click="openPurchaseDialog">购买储值卡</el-button>
        <el-button type="warning" :loading="loadingAll" @click="loadAllAccountsCards">获取全部账号支付卡</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="loadCards">刷新</el-button>
      </div>
    </section>

    <section class="stored-card-content-panel panel">
      <header class="stored-card-panel-header">
        <div class="stored-card-panel-title">
          <span>
            <el-icon><CreditCard /></el-icon>
            储值卡列表
          </span>
          <em>{{ cardRows.length }} 张 | 总额 {{ formatMoney(totalBalance) }}</em>
        </div>
        <span class="stored-card-panel-hint">详情可查看接口原始数据，充值/赠送将调用真实万达接口</span>
      </header>

      <div v-if="cardDisplayMode === 'table'" class="stored-card-table-wrapper">
        <el-table
          v-loading="loading"
          :data="cardRows"
          height="100%"
          stripe
          highlight-current-row
          :empty-text="cardsMessage || '暂无数据'"
        >
          <el-table-column prop="holder" label="持有人" width="132" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="stored-card-holder">{{ row.ownerPhone || row.holder || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="卡名称" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.name || '储值卡' }}</template>
          </el-table-column>
          <el-table-column prop="cardNo" label="卡号" width="188" show-overflow-tooltip>
            <template #default="{ row }">{{ row.cardNo || '-' }}</template>
          </el-table-column>
          <el-table-column prop="categoryName" label="分类" width="120">
            <template #default="{ row }">{{ row.categoryName || '未分类' }}</template>
          </el-table-column>
          <el-table-column label="余额" width="118" align="right">
            <template #default="{ row }">
              <span class="stored-card-amount">{{ formatMoney(row.balance) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="赠送" width="108" align="right">
            <template #default="{ row }">{{ formatMoney(row.presentBalance) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="108" align="center">
            <template #default="{ row }">
              <el-tag size="small" class="stored-card-status-tag" :class="{ 'stored-card-status-tag--disabled': isStoredCardDisabled(row) }" :type="getStoredCardStatusTagType(row)">{{ row.statusDesc || row.status || '-' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="176" align="right" fixed="right">
            <template #default="{ row }">
              <div class="stored-card-action-group">
                <el-button link type="primary" size="small" @click="showCardDetail(row)">详情</el-button>
                <el-button link type="success" size="small" @click="openRechargeDialog(row)">充值</el-button>
                <el-button link size="small" @click="openTransferDialog(row)">赠送</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else v-loading="loading" class="stored-card-grid-panel">
        <el-empty v-if="cardRows.length === 0" :description="cardsMessage || '暂无数据'" />
        <div v-else class="stored-card-grid">
          <article v-for="row in cardRows" :key="row.cardNo || row.name" class="stored-card stored-card-item">
            <div class="stored-card-top">
              <strong>{{ row.name || '储值卡' }}</strong>
              <el-tag size="small" class="stored-card-status-tag" :class="{ 'stored-card-status-tag--disabled': isStoredCardDisabled(row) }" :type="getStoredCardStatusTagType(row)">{{ row.statusDesc || row.status || '-' }}</el-tag>
            </div>
            <div class="stored-card-no">{{ row.cardNo || '-' }}</div>
            <div class="stored-card-money">{{ formatMoney(row.balance) }}</div>
            <div class="stored-card-meta">
              <span>{{ row.ownerPhone || row.holder || '-' }}</span>
            </div>
            <div class="stored-card-actions">
              <el-button link type="primary" @click="showCardDetail(row)">详情</el-button>
              <el-button link type="success" @click="openRechargeDialog(row)">充值</el-button>
              <el-button link @click="openTransferDialog(row)">赠送</el-button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <el-dialog v-model="detailDialogVisible" title="储值卡详情" width="680px">
      <el-descriptions v-if="selectedCard" :column="2" border>
        <el-descriptions-item label="卡名称">{{ selectedCard.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="卡号">{{ selectedCard.cardNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="余额">{{ formatMoney(selectedCard.balance) }}</el-descriptions-item>
        <el-descriptions-item label="赠送余额">{{ formatMoney(selectedCard.presentBalance) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ selectedCard.statusDesc || selectedCard.status || '-' }}</el-descriptions-item>
        <el-descriptions-item label="持有人">{{ selectedCard.ownerPhone || selectedCard.holder || '-' }}</el-descriptions-item>
        <el-descriptions-item label="剩余次数">{{ selectedCard.remainingCount || '-' }}</el-descriptions-item>
        <el-descriptions-item label="卡分类">{{ selectedCard.categoryName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="折扣">{{ selectedCard.discountRate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="权益">{{ selectedCard.coverName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="不可用原因">{{ selectedCard.unavailableReason || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-input class="raw-json" type="textarea" :rows="8" :model-value="detailRawText" readonly />
    </el-dialog>

    <el-dialog v-model="purchaseDialogVisible" title="购买储值卡" width="520px">
      <el-radio-group v-model="purchaseAmount" class="denomination-group">
        <el-radio-button v-for="item in STORED_CARD_DENOMINATIONS" :key="item.value" :value="item.value">
          {{ item.label }} 赠 {{ item.displayBonus }}元
        </el-radio-button>
      </el-radio-group>
      <template #footer>
        <el-button @click="purchaseDialogVisible = false">取消</el-button>
        <el-popconfirm
          title="确认购买储值卡？将调用真实万达接口并生成支付参数。"
          confirm-button-text="确认购买"
          cancel-button-text="取消"
          @confirm="handleConfirmPurchase"
        >
          <template #reference>
            <el-button type="primary" :loading="submittingPurchase">确认购买</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-dialog>

    <el-dialog v-model="rechargeDialogVisible" title="储值卡充值" width="520px">
      <div v-if="selectedCard" class="dialog-card-line">
        <span>{{ selectedCard.name }}</span>
        <strong>{{ selectedCard.cardNo }}</strong>
      </div>
      <el-radio-group v-model="rechargeAmount" class="denomination-group">
        <el-radio-button v-for="item in STORED_CARD_DENOMINATIONS" :key="item.value" :value="item.value">
          {{ item.label }} 赠 {{ item.displayBonus }}元
        </el-radio-button>
      </el-radio-group>
      <template #footer>
        <el-button @click="rechargeDialogVisible = false">取消</el-button>
        <el-popconfirm
          title="确认充值储值卡？将调用真实万达接口并生成支付参数。"
          confirm-button-text="确认充值"
          cancel-button-text="取消"
          @confirm="handleConfirmRecharge"
        >
          <template #reference>
            <el-button type="primary" :loading="submittingRecharge">确认充值</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialogVisible" title="赠送储值卡" width="500px">
      <el-form label-width="90px">
        <el-form-item label="卡号">
          <el-input :model-value="selectedCard?.cardNo || ''" readonly />
        </el-form-item>
        <el-form-item label="接收手机号">
          <el-input v-model="transferMobile" maxlength="11" placeholder="请输入接收手机号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDialogVisible = false">取消</el-button>
        <el-popconfirm
          title="确认赠送储值卡？将把当前卡转赠到填写的手机号。"
          confirm-button-text="确认赠送"
          cancel-button-text="取消"
          @confirm="handleConfirmTransfer"
        >
          <template #reference>
            <el-button type="primary" :loading="submittingTransfer">确认赠送</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-dialog>

    <el-dialog v-model="paymentResultDialogVisible" :title="paymentResult?.title || '支付参数'" width="720px">
      <el-descriptions v-if="paymentResult" :column="2" border>
        <el-descriptions-item label="订单号">{{ paymentResult.orderId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ paymentResult.amountLabel }}</el-descriptions-item>
      </el-descriptions>
      <el-input class="raw-json" type="textarea" :rows="12" :model-value="paymentResultText" readonly />
      <template #footer>
        <el-popconfirm
          title="确认打开支付宝支付？如已开启自动支付，窗口可能尝试自动填写。"
          confirm-button-text="打开支付宝"
          cancel-button-text="取消"
          @confirm="handleOpenAlipayPayment"
        >
          <template #reference>
            <el-button :loading="openingAlipay" :disabled="!paymentResult?.appPayParam">
              打开支付宝支付
            </el-button>
          </template>
        </el-popconfirm>
        <el-button @click="paymentResultDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyPaymentResult">复制支付参数</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.stored-card-page {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 100px auto minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-page, var(--app-bg));
}

.stored-card-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}

.stored-summary-card {
  min-width: 0;
  height: 100px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 7px;
  padding: 14px 16px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.stored-summary-card span,
.stored-summary-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-summary-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 22px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-summary-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.stored-summary-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.stored-summary-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
}

.panel {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.stored-card-action-panel {
  min-width: 0;
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  overflow: hidden;
}

.stored-card-action-left,
.stored-card-action-right,
.stored-card-action-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stored-card-view-toggle {
  flex-shrink: 0;
}

.stored-card-account {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-card-content-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stored-card-panel-header {
  min-height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-light, var(--app-border));
}

.stored-card-panel-title {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stored-card-panel-title span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 15px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-card-panel-title .el-icon {
  color: var(--app-accent);
}

.stored-card-panel-title em,
.stored-card-panel-hint {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-card-table-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.stored-card-table-wrapper :deep(.el-table) {
  height: 100%;
}

.stored-card-table-wrapper :deep(.el-table th.el-table__cell) {
  background: #f8fafc;
  color: var(--text-primary, var(--app-text));
  font-weight: 700;
}

.stored-card-table-wrapper :deep(.el-table__cell) {
  vertical-align: top;
}

.stored-card-holder {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stored-card-amount {
  color: var(--app-accent);
  font-weight: 700;
}

:deep(.stored-card-status-tag--disabled.el-tag) {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
}

.stored-card-grid-panel {
  flex: 1;
  min-height: 0;
  padding: 14px;
  overflow: auto;
}

.stored-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  align-content: start;
  gap: 12px;
}

.stored-card {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--app-surface);
  box-shadow: var(--shadow-panel);
}

.stored-card-top,
.stored-card-meta,
.stored-card-actions,
.dialog-card-line {
  display: flex;
  align-items: center;
}

.stored-card-top,
.stored-card-meta,
.dialog-card-line {
  justify-content: space-between;
  gap: 12px;
}

.stored-card-no {
  margin-top: 12px;
  color: var(--app-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.stored-card-money {
  margin-top: 16px;
  color: var(--app-accent);
  font-size: 24px;
  font-weight: 700;
}

.stored-card-meta {
  margin-top: 10px;
  color: var(--app-muted);
  font-size: 13px;
}

.stored-card-actions {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.raw-json {
  margin-top: 14px;
}

.denomination-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.denomination-group :deep(.el-radio-button__inner) {
  width: 100%;
  border-left: var(--el-border);
  border-radius: 6px;
}

.dialog-card-line {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-muted);
}

@media (max-width: 1360px) {
  .stored-card-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: 96px;
  }

  .stored-card-page {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .stored-card-action-panel {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-height: 720px) {
  .stored-card-page {
    grid-template-rows: 88px auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
  }

  .stored-summary-card {
    height: 88px;
  }

  .stored-summary-card strong {
    font-size: 20px;
  }
}
</style>
