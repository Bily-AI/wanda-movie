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
import { useAccountsStore } from '@renderer/stores/accounts'
import { useLogsStore } from '@renderer/stores/logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

interface PaymentDialogData extends StoredCardPaymentResult {
  title: string
  amountLabel: string
}

const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const cards = ref<StoredCardRow[]>([])
const balanceInfo = ref<StoredCardBalanceInfo | null>(null)
const loading = ref(false)
const loadingAll = ref(false)
const cardsMessage = ref('')
const cardDisplayMode = ref<'table' | 'card'>('table')

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
const paymentResult = ref<PaymentDialogData | null>(null)

let loadSerial = 0

const cardRows = computed(() => cards.value)
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
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

  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
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
      totalBalance: Number((balanceTotal + presentTotal).toFixed(2)),
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
    ElMessage.success('支付参数已获取')
  } catch (error) {
    const message = getErrorMessage(error, '购买储值卡失败')
    logsStore.addLog('储值卡', account.phone, `购买储值卡失败：${message}`)
    ElMessage.error(message)
  } finally {
    submittingPurchase.value = false
  }
}

async function handleConfirmRecharge() {
  const account = getCurrentAccount()
  const card = selectedCard.value

  if (!account || !card) {
    return
  }

  const denomination = findDenomination(rechargeAmount.value)
  submittingRecharge.value = true

  try {
    const result = await createStoredCardRechargePayment(
      denomination.value,
      card.cardNo,
      account.ck,
      account.userIdentifier
    )

    rechargeDialogVisible.value = false
    showPaymentResult('储值卡充值支付参数', `${card.cardNo} / ${denomination.label}`, result)
    logsStore.addLog('储值卡', account.phone, `储值卡充值支付参数获取成功：${card.cardNo}`)
    ElMessage.success('支付参数已获取')
  } catch (error) {
    const message = getErrorMessage(error, '储值卡充值失败')
    logsStore.addLog('储值卡', account.phone, `储值卡充值失败：${message}`)
    ElMessage.error(message)
  } finally {
    submittingRecharge.value = false
  }
}

async function handleConfirmTransfer() {
  const account = getCurrentAccount()
  const card = selectedCard.value
  const mobile = transferMobile.value.trim()

  if (!account || !card) {
    return
  }

  if (!/^1\d{10}$/.test(mobile)) {
    ElMessage.warning('请输入正确的接收手机号')
    return
  }

  submittingTransfer.value = true

  try {
    await transferStoredCard(card.cardNo, mobile, account.ck, account.userIdentifier)
    transferDialogVisible.value = false
    logsStore.addLog('储值卡', account.phone, `储值卡赠送成功：${card.cardNo} -> ${mobile}`)
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
</script>

<template>
  <section class="card-page table-page">
    <header class="page-toolbar">
      <div class="page-title">
        <el-icon><CreditCard /></el-icon>
        <strong>储值卡</strong>
        <el-tag round>{{ cardRows.length }}</el-tag>
      </div>
      <span class="toolbar-spacer" />
      <span class="total-text">总额: {{ formatMoney(totalBalance) }}</span>
      <el-button @click="cardDisplayMode = cardDisplayMode === 'table' ? 'card' : 'table'">
        {{ cardDisplayMode === 'table' ? '卡片' : '列表' }}
      </el-button>
      <el-button type="success" :icon="ShoppingCart" @click="openPurchaseDialog">购买储值卡</el-button>
      <el-button type="warning" :loading="loadingAll" @click="loadAllAccountsCards">获取全部账号支付卡</el-button>
      <el-button :icon="Refresh" :loading="loading" @click="loadCards">刷新</el-button>
    </header>

    <section v-if="cardDisplayMode === 'table'" class="table-panel">
      <el-table v-loading="loading" :data="cardRows" height="100%" :empty-text="cardsMessage || '暂无数据'">
        <el-table-column prop="holder" label="持有人" min-width="140" />
        <el-table-column prop="name" label="卡名称" min-width="210" />
        <el-table-column prop="cardNo" label="卡号" min-width="210" />
        <el-table-column label="余额" width="110">
          <template #default="{ row }">{{ formatMoney(row.balance) }}</template>
        </el-table-column>
        <el-table-column label="赠送余额" width="120">
          <template #default="{ row }">{{ formatMoney(row.presentBalance) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="effectDate" label="有效期" min-width="150" />
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showCardDetail(row)">详情</el-button>
            <el-button link type="success" @click="openRechargeDialog(row)">充值</el-button>
            <el-button link @click="openTransferDialog(row)">赠送</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else v-loading="loading" class="card-grid-panel">
      <el-empty v-if="cardRows.length === 0" :description="cardsMessage || '暂无数据'" />
      <article v-for="row in cardRows" v-else :key="row.cardNo || row.name" class="stored-card">
        <div class="stored-card-top">
          <strong>{{ row.name || '储值卡' }}</strong>
          <el-tag size="small" :type="row.available ? 'success' : 'info'">{{ row.status }}</el-tag>
        </div>
        <div class="stored-card-no">{{ row.cardNo || '-' }}</div>
        <div class="stored-card-money">{{ formatMoney(row.balance + row.presentBalance) }}</div>
        <div class="stored-card-meta">
          <span>{{ row.ownerPhone || row.holder || '-' }}</span>
          <span>{{ row.effectDate || '长期有效' }}</span>
        </div>
        <div class="stored-card-actions">
          <el-button link type="primary" @click="showCardDetail(row)">详情</el-button>
          <el-button link type="success" @click="openRechargeDialog(row)">充值</el-button>
          <el-button link @click="openTransferDialog(row)">赠送</el-button>
        </div>
      </article>
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
        <el-descriptions-item label="有效期">{{ selectedCard.effectDate || '-' }}</el-descriptions-item>
        <el-descriptions-item label="权益">{{ selectedCard.coverName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="不可用原因">{{ selectedCard.unavailableReason || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-input class="raw-json" type="textarea" :rows="8" :model-value="detailRawText" readonly />
    </el-dialog>

    <el-dialog v-model="purchaseDialogVisible" title="购买储值卡" width="520px">
      <el-radio-group v-model="purchaseAmount" class="denomination-group">
        <el-radio-button v-for="item in STORED_CARD_DENOMINATIONS" :key="item.value" :label="item.value">
          {{ item.label }} 赠 {{ item.displayBonus }}元
        </el-radio-button>
      </el-radio-group>
      <template #footer>
        <el-button @click="purchaseDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingPurchase" @click="handleConfirmPurchase">确认购买</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="rechargeDialogVisible" title="储值卡充值" width="520px">
      <div v-if="selectedCard" class="dialog-card-line">
        <span>{{ selectedCard.name }}</span>
        <strong>{{ selectedCard.cardNo }}</strong>
      </div>
      <el-radio-group v-model="rechargeAmount" class="denomination-group">
        <el-radio-button v-for="item in STORED_CARD_DENOMINATIONS" :key="item.value" :label="item.value">
          {{ item.label }} 赠 {{ item.displayBonus }}元
        </el-radio-button>
      </el-radio-group>
      <template #footer>
        <el-button @click="rechargeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingRecharge" @click="handleConfirmRecharge">确认充值</el-button>
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
        <el-button type="primary" :loading="submittingTransfer" @click="handleConfirmTransfer">确认赠送</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="paymentResultDialogVisible" :title="paymentResult?.title || '支付参数'" width="720px">
      <el-descriptions v-if="paymentResult" :column="2" border>
        <el-descriptions-item label="订单号">{{ paymentResult.orderId || '-' }}</el-descriptions-item>
        <el-descriptions-item label="金额">{{ paymentResult.amountLabel }}</el-descriptions-item>
      </el-descriptions>
      <el-input class="raw-json" type="textarea" :rows="12" :model-value="paymentResultText" readonly />
      <template #footer>
        <el-button @click="paymentResultDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyPaymentResult">复制支付参数</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.table-page {
  min-width: 980px;
  min-height: 100%;
  display: grid;
  grid-template-rows: 50px minmax(0, 1fr);
  gap: 16px;
}

.page-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-size: 16px;
}

.page-title :deep(.el-icon),
.total-text {
  color: var(--app-accent);
}

.toolbar-spacer {
  flex: 1;
}

.total-text {
  font-weight: 700;
}

.table-panel,
.card-grid-panel {
  min-height: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  overflow: hidden;
}

.card-grid-panel {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  align-content: start;
  gap: 14px;
  overflow: auto;
}

.stored-card {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f6fbff 100%);
  box-shadow: 0 8px 20px rgb(15 23 42 / 6%);
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
  color: var(--app-text-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.stored-card-money {
  margin-top: 16px;
  color: #2f91ff;
  font-size: 28px;
  font-weight: 700;
}

.stored-card-meta {
  margin-top: 10px;
  color: var(--app-text-muted);
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
  color: var(--app-text-muted);
}
</style>
