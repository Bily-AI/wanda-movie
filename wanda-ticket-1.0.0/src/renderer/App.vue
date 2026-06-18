<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
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
import { useSettingsStore } from './stores/settings'

const appStore = useAppStore()
const accountsStore = useAccountsStore()
const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()

const version = computed(() => appStore.version)
let localDataLoaded = false
let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined

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

onMounted(async () => {
  await Promise.all([appStore.initialize(), accountsStore.loadAccounts(), settingsStore.loadSettings()])
  localDataLoaded = true
})

watch(
  () => ({
    rememberWindow: settingsStore.rememberWindow,
    autoClosePaymentWindow: settingsStore.autoClosePaymentWindow,
    paymentCardDisplay: settingsStore.paymentCardDisplay,
    ticketCodeTemplate: settingsStore.ticketCodeTemplate,
    autoPayment: settingsStore.autoPayment,
    requestParams: settingsStore.requestParams,
    proxyApi: settingsStore.proxyApi,
    useProxyIp: settingsStore.useProxyIp
  }),
  () => {
    if (!localDataLoaded) {
      return
    }

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
  return route.path === path
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

</script>

<template>
  <div class="app-shell">
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
      <router-view />
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
  border-radius: 6px;
  background: linear-gradient(135deg, #d9363e 0%, #f06d35 100%);
  color: #fff;
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
  background: var(--app-hover);
  color: var(--app-accent);
}

.nav-button--active,
.nav-button--active:hover {
  background: var(--app-accent-soft);
  color: var(--app-accent);
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
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow: auto;
  background:
    linear-gradient(180deg, var(--app-bg) 0%, var(--app-bg-soft) 100%);
}

.nav-button + .nav-button {
  margin-left: 0;
}

@media (max-width: 1360px) {
  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .top-nav,
  .account-strip {
    width: 100%;
  }

  .account-strip {
    justify-content: flex-end;
  }
}
</style>
