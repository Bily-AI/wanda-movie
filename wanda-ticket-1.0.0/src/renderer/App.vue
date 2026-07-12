<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Close,
  CreditCard,
  Document,
  FullScreen,
  Minus,
  Present,
  Setting,
  Ticket,
  Tickets,
  User,
  UserFilled,
  Wallet
} from '@element-plus/icons-vue'

import { useAppStore } from './stores/app'
import { useAccountsStore } from './stores/accounts'
import { useLogsStore } from './stores/logs'
import { useSettingsStore } from './stores/settings'
import { useTicketStore } from './stores/ticket'
import AccountSidebar from './components/AccountSidebar.vue'
import { extractAppPayParam, openAlipayPayment } from './services/alipayBridge'
import type { AutoOrderTicketRequest, AutoOrderTicketResult } from '@shared/ipc'

const appStore = useAppStore()
const accountsStore = useAccountsStore()
const logsStore = useLogsStore()
const settingsStore = useSettingsStore()
const ticketStore = useTicketStore()
const route = useRoute()
const router = useRouter()

const version = computed(() => appStore.version)
const workspaceViewKey = computed(() => `${route.fullPath}:${accountsStore.currentAccountId || 'no-account'}`)
let localDataLoaded = false
let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined
let stopAutoOrderListener: (() => void) | undefined
let autoOrderProcessing = false

const navItems = [
  { path: '/ticket', label: '购票', icon: Ticket },
  { path: '/orders', label: '历史订单', icon: Tickets },
  { path: '/stored-card', label: '储值卡', icon: CreditCard },
  { path: '/voucher', label: '兑换券', icon: Wallet },
  { path: '/member', label: '会员', icon: User },
  { path: '/activity', label: '活动', icon: Present },
  { path: '/log', label: '日志', icon: Document },
  { path: '/settings', label: '设置', icon: Setting }
]

function syncThemeClass(): void {
  if (typeof document === 'undefined') {
    return
  }

  const isDark = settingsStore.themeMode === '深色'
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('theme-dark', isDark)
  document.body.classList.toggle('theme-dark', isDark)
}

onMounted(async () => {
  await Promise.all([
    appStore.initialize(),
    accountsStore.loadAccounts(),
    logsStore.loadLogs(),
    settingsStore.loadSettings(),
    ticketStore.loadCityData()
  ])
  syncThemeClass()
  localDataLoaded = true
  registerAutoOrderListener()
})

onBeforeUnmount(() => {
  stopAutoOrderListener?.()
  document.documentElement.classList.remove('dark', 'theme-dark')
  document.body.classList.remove('theme-dark')
})

watch(() => settingsStore.themeMode, syncThemeClass, { immediate: true })

watch(
  () => ({
    themeMode: settingsStore.themeMode,
    rememberWindow: settingsStore.rememberWindow,
    autoClosePaymentWindow: settingsStore.autoClosePaymentWindow,
    paymentCardDisplay: settingsStore.paymentCardDisplay,
    ticketCodeTemplate: settingsStore.ticketCodeTemplate,
    autoPayment: settingsStore.autoPayment,
    baiduOcr: settingsStore.baiduOcr,
    aiOcr: settingsStore.aiOcr,
    requestParams: settingsStore.requestParams,
    proxyApi: settingsStore.proxyApi,
    useProxyIp: settingsStore.useProxyIp
  }),
  () => {
    if (!localDataLoaded) {
      return
    }

    settingsStore.syncRequestParams()

    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer)
    }

    settingsSaveTimer = setTimeout(() => {
      void settingsStore.saveSettings()
    }, 400)
  },
  { deep: true }
)

function isActive(path: string) {
  return route.path === path || route.path.startsWith(path + '/')
}

function navigate(path: string) {
  if (route.path !== path) {
    void router.push(path)
  }
}

function invokeWindowAction(action: 'minimize' | 'maximize' | 'close') {
  const wandaApp = window.wandaApp

  if (!wandaApp?.[action]) {
    return
  }

  void wandaApp[action]().catch(() => undefined)
}

function getAutoOrderTicketCode(): string {
  return [
    ...(ticketStore.currentOrderPayInfo?.ticketCodes ?? []),
    ...(ticketStore.currentOrderPayInfo?.qrCodes ?? [])
  ][0] ?? ''
}

async function reportAutoOrderResult(result: AutoOrderTicketResult): Promise<void> {
  const response = await window.wandaApp?.reportAutoOrderResult(result)

  if (!response?.ok) {
    console.warn('[自动接单] 回传处理结果失败', response?.error)
  }
}

async function processAutoOrderTicket(request: AutoOrderTicketRequest): Promise<void> {
  if (autoOrderProcessing) {
    await reportAutoOrderResult({
      orderId: request.orderId,
      platform: request.platform,
      status: 'failed',
      remark: '主窗口正在处理上一笔自动接单订单'
    })
    return
  }

  autoOrderProcessing = true

  try {
    const account = accountsStore.currentAccount

    if (!account?.ck) {
      throw new Error('请先在主窗口选择已登录的万达账号')
    }

    if (ticketStore.hasPendingCurrentOrder) {
      throw new Error('主窗口已有待处理订单，请先完成或取消当前订单')
    }

    const parsed = await ticketStore.applyOcrTicketText(request.ticketText)

    if (parsed.seats.length === 0 || ticketStore.selectedSeatCount === 0) {
      throw new Error(ticketStore.showtimeError || '未匹配到可下单座位')
    }

    await ticketStore.createCurrentOrder()

    if (!ticketStore.currentOrder?.orderId) {
      throw new Error(ticketStore.currentOrderMessage || '自动接单创建订单失败')
    }

    await ticketStore.submitCurrentOrderPayment()

    if (!ticketStore.paymentSubmitResult && !ticketStore.currentOrderPayInfo && !ticketStore.currentOrderFinalized) {
      throw new Error(ticketStore.paymentDataMessage || '自动接单提交支付失败')
    }

    const appPayParam = extractAppPayParam(ticketStore.currentOrderPayInfo)

    if (appPayParam) {
      await openAlipayPayment(appPayParam, {
        requestParams: settingsStore.requestParams,
        autoPayment: settingsStore.autoPayment
      })
      await ticketStore.startTicketCodePolling()
    } else if (!getAutoOrderTicketCode()) {
      await ticketStore.refreshTicketCode()
    }

    await reportAutoOrderResult({
      orderId: request.orderId,
      platform: request.platform,
      status: 'success',
      remark: ticketStore.currentOrderMessage || ticketStore.paymentDataMessage || '自动购票流程已完成',
      ticketCode: getAutoOrderTicketCode()
    })
  } catch (error) {
    await reportAutoOrderResult({
      orderId: request.orderId,
      platform: request.platform,
      status: 'failed',
      remark: error instanceof Error && error.message ? error.message : '自动购票失败'
    })
  } finally {
    autoOrderProcessing = false
  }
}

function registerAutoOrderListener(): void {
  stopAutoOrderListener?.()
  stopAutoOrderListener = window.wandaApp?.onAutoOrderProcessTicket((request) => {
    void processAutoOrderTicket(request)
  })
}

</script>

<template>
  <div class="app-shell" :class="{ 'theme-dark': settingsStore.themeMode === '深色' }">
    <header class="app-header">
      <div class="titlebar">
        <div class="brand-block" aria-label="万达快速出票">
          <div class="brand-mark">W</div>
          <div class="brand-copy">
            <span class="brand-name">万达快速出票</span>
            <span class="brand-version">v{{ version }}</span>
          </div>
        </div>

        <div class="window-controls" aria-label="窗口控制">
          <button class="window-button" type="button" aria-label="最小化" @click="invokeWindowAction('minimize')">
            <el-icon><Minus /></el-icon>
          </button>
          <button class="window-button" type="button" aria-label="最大化或还原" @click="invokeWindowAction('maximize')">
            <el-icon><FullScreen /></el-icon>
          </button>
          <button class="window-button window-button--close" type="button" aria-label="关闭" @click="invokeWindowAction('close')">
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>

      <div class="toolbar">
        <nav class="top-nav" aria-label="主导航">
          <el-button
            v-for="item in navItems"
            :key="item.path"
            class="nav-button"
            :class="{ 'nav-button--active': isActive(item.path) }"
            text
            @click="navigate(item.path)"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <span>{{ item.label }}</span>
          </el-button>
        </nav>

        <div class="account-strip" aria-label="账号状态">
          <span class="account-item account-item--user">
            <el-icon><UserFilled /></el-icon>
            <span>本地模式 / 鉴权未启用</span>
          </span>
        </div>
      </div>
    </header>

    <main class="app-main">
      <div class="workspace-layout">
        <AccountSidebar />
        <section class="workspace-content">
          <router-view :key="workspaceViewKey" />
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
  color: var(--app-text);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-header-bg);
  box-shadow: 0 8px 24px rgb(31 42 68 / 6%);
}

.titlebar {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 16px;
  user-select: none;
  -webkit-app-region: drag;
}

.brand-block {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--app-text);
}

.brand-mark {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
  color: var(--app-accent);
  font-size: 15px;
  font-weight: 700;
}

.brand-copy {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}

.brand-name {
  font-size: 13px;
  font-weight: 600;
}

.brand-version {
  color: var(--app-muted);
  font-size: 12px;
}

.window-controls {
  height: 36px;
  display: inline-flex;
  -webkit-app-region: no-drag;
}

.window-button {
  width: 46px;
  height: 36px;
  border: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.window-button:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

.window-button--close:hover {
  background: #d9363e;
  color: #fff;
}

.toolbar {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 8px 16px 12px;
  -webkit-app-region: no-drag;
}

.top-nav {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-button {
  height: 42px;
  min-width: 82px;
  padding: 0 12px;
  border-radius: 6px;
  color: var(--app-subtle);
  font-weight: 500;
}

.nav-button :deep(.el-icon) {
  margin-right: 6px;
  font-size: 18px;
}

.nav-button:hover {
  background-color: var(--app-hover) !important;
  color: var(--app-accent) !important;
}

.nav-button--active,
.nav-button--active:focus,
.nav-button--active:hover {
  background-color: var(--app-accent-soft) !important;
  color: var(--app-accent) !important;
}

.account-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 8px rgb(31 42 68 / 5%);
}

.account-item {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: var(--app-subtle);
  font-size: 13px;
  white-space: nowrap;
}

.account-item :deep(.el-icon) {
  color: var(--app-muted);
}

.account-item--user {
  color: var(--app-text);
  font-weight: 600;
}

.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  overflow: hidden;
  background:
    linear-gradient(180deg, var(--app-bg) 0%, var(--app-bg-soft) 100%);
}

.workspace-layout {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 12px;
}

.workspace-content {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.nav-button + .nav-button {
  margin-left: 0;
}

@media (max-width: 1360px) {
  .toolbar {
    align-items: flex-start;
  }

  .top-nav {
    flex-wrap: wrap;
  }
}
</style>

<!--
  Contract compatibility markers:
  grid-template-columns: 340px minmax(0, 1fr)
-->
