<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, InfoFilled, Key, Monitor, Refresh, Setting, Tickets, Wallet } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { buildAlipayDeviceFingerprint } from '@renderer/services/alipayBridge'
import { useSettingsStore } from '@renderer/stores/settings'
import { useTicketStore } from '@renderer/stores/ticket'

const settingsStore = useSettingsStore()
const ticketStore = useTicketStore()
const refreshingAlipayDevice = ref(false)

const autoPaymentStatusText = computed(() => (settingsStore.autoPayment.enabled ? '已启用' : '未启用'))

const proxyStatusText = computed(() => (settingsStore.useProxyIp ? '已启用' : '未启用'))

const ocrStatusText = computed(() => (settingsStore.baiduOcrConfigured ? '已配置' : '未配置'))

const aiOcrStatusText = computed(() => (settingsStore.aiOcrConfigured ? '已启用' : '未启用'))

const requestDeviceText = computed(() => settingsStore.requestParams.model || '未生成')

async function persistSettings(successText: string) {
  await settingsStore.saveSettings()
  ElMessage.success(successText)
}

async function handleRefreshRequestParams() {
  settingsStore.refreshRequestParams()
  await persistSettings(`业务参数已刷新！设备：${settingsStore.requestParams.model}`)
}

async function handleRefreshAlipayDevice() {
  refreshingAlipayDevice.value = true

  try {
    settingsStore.refreshRequestParams()
    await settingsStore.saveSettings()

    const wandaApp = window.wandaApp

    if (!wandaApp) {
      throw new Error('Electron 桥接未就绪')
    }

    const device = buildAlipayDeviceFingerprint(settingsStore.requestParams)
    const syncResult = await wandaApp.alipaySyncDevice(device)

    if (!syncResult.ok) {
      throw new Error(syncResult.error || '同步支付宝设备失败')
    }

    const clearResult = await wandaApp.alipayClearSession()

    if (!clearResult.ok) {
      throw new Error(clearResult.error || '清理支付宝会话失败')
    }

    ElMessage.success(`设备已刷新：${device.model || '-'} iOS ${device.ios || '-'} ${device.screen || '-'}`)
  } catch (error) {
    ElMessage.error(error instanceof Error && error.message ? error.message : '刷新设备失败')
  } finally {
    refreshingAlipayDevice.value = false
  }
}

async function handleClearCacheData() {
  try {
    await ElMessageBox.confirm('确定要清除所有本地缓存数据吗？此操作不可恢复。', '清除缓存', {
      confirmButtonText: '确认清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await settingsStore.clearCacheData()
    await ticketStore.loadCityData()
    ElMessage.success('缓存已清除，保留登录状态和设置')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error && error.message ? error.message : '清除缓存失败')
    }
  }
}
</script>

<template>
  <section class="settings-page">
    <section class="settings-summary-grid" aria-label="设置摘要">
      <article class="settings-summary-card settings-summary-card--blue">
        <span>设置中心</span>
        <strong>{{ settingsStore.themeMode }}</strong>
        <em>窗口 {{ settingsStore.rememberWindow ? '记住位置' : '默认启动' }}</em>
      </article>
      <article class="settings-summary-card settings-summary-card--green">
        <span>自动支付</span>
        <strong>{{ autoPaymentStatusText }}</strong>
        <em>{{ settingsStore.autoPayment.phone || '未填写手机号' }}</em>
      </article>
      <article class="settings-summary-card settings-summary-card--amber">
        <span>网络设备</span>
        <strong>{{ requestDeviceText }}</strong>
        <em>代理 {{ proxyStatusText }}</em>
      </article>
      <article class="settings-summary-card">
        <span>识别配置</span>
        <strong>{{ ocrStatusText }}</strong>
        <em>AI OCR {{ aiOcrStatusText }}</em>
      </article>
    </section>

    <section class="settings-workbench">
      <div class="settings-column settings-column--main">
        <el-card class="settings-card settings-card--system" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Setting /></el-icon>
              <span>基础偏好</span>
            </div>
          </template>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">主题模式</span>
              <span class="setting-desc">切换浅色/深色显示模式</span>
            </div>
            <div class="setting-control">
              <el-radio-group
                v-model="settingsStore.themeMode"
                size="small"
                @change="() => persistSettings(`已切换至${settingsStore.themeMode}模式`)"
              >
                <el-radio-button value="浅色">浅色</el-radio-button>
                <el-radio-button value="深色">深色</el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">记住窗口位置</span>
              <span class="setting-desc">启动时恢复上次关闭时的窗口位置和大小</span>
            </div>
            <div class="setting-control">
              <el-switch
                v-model="settingsStore.rememberWindow"
                @change="() => persistSettings('窗口设置已保存')"
              />
            </div>
          </div>
        </el-card>

        <el-card class="settings-card settings-card--ticket" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Tickets /></el-icon>
              <span>购票设置</span>
            </div>
          </template>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">下单成功后自动关闭弹窗</span>
              <span class="setting-desc">购票支付成功后自动关闭支付弹窗</span>
            </div>
            <div class="setting-control">
              <el-switch
                v-model="settingsStore.autoClosePaymentWindow"
                @change="() => persistSettings('购票设置已保存')"
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">支付卡显示方式</span>
              <span class="setting-desc">选择支付卡在购票页面的展示形式</span>
            </div>
            <div class="setting-control">
              <el-radio-group
                v-model="settingsStore.paymentCardDisplay"
                size="small"
                @change="() => persistSettings(`支付卡显示方式已切换为${settingsStore.paymentCardDisplay}`)"
              >
                <el-radio-button value="列表">列表</el-radio-button>
                <el-radio-button value="卡片">卡片</el-radio-button>
              </el-radio-group>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">取票码面板模板</span>
              <span class="setting-desc">选择取票成功后的面板展示样式</span>
            </div>
            <div class="setting-control">
              <el-radio-group
                v-model="settingsStore.ticketCodeTemplate"
                size="small"
                @change="() => persistSettings(`取票码面板模板已切换为${settingsStore.ticketCodeTemplate}`)"
              >
                <el-radio-button value="默认">默认</el-radio-button>
                <el-radio-button value="万达风格">万达风格</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </el-card>

        <el-card class="settings-card settings-card--auto-pay" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Wallet /></el-icon>
              <span>自动支付设置</span>
            </div>
          </template>

          <div class="auto-pay-row">
            <el-switch
              v-model="settingsStore.autoPayment.enabled"
              @change="() => persistSettings('自动支付设置已保存')"
            />
            <el-input
              v-model="settingsStore.autoPayment.phone"
              placeholder="输入支付宝手机号"
              size="small"
              clearable
              @change="() => persistSettings('自动支付设置已保存')"
            />
            <el-input
              v-model="settingsStore.autoPayment.password"
              type="password"
              placeholder="输入支付密码"
              size="small"
              show-password
              @change="() => persistSettings('自动支付设置已保存')"
            />
            <el-button size="small" :icon="Refresh" :loading="refreshingAlipayDevice" @click="handleRefreshAlipayDevice">刷新设备</el-button>
          </div>

          <p class="auto-pay-warning">
            手动支付一次缓存支付宝登录信息以后再开启自动支付功能，否则会出现不确定错误或导致无限验证。滑块验证不通过时点击「刷新设备」更换设备特征。
          </p>
        </el-card>

        <el-card class="settings-card settings-card--network" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Monitor /></el-icon>
              <span>网络与请求</span>
            </div>
          </template>

          <div class="setting-row setting-row--stack">
            <div class="inline-header">
              <span class="setting-name">业务请求头参数</span>
              <el-button size="small" :icon="Refresh" @click="handleRefreshRequestParams">刷新参数</el-button>
            </div>

            <div class="biz-params-preview">
              <div>设备指纹：{{ settingsStore.requestParams.shumeiBoxId?.slice(0, 24) || '...' }}</div>
              <div>设备型号：{{ settingsStore.requestParams.model || '-' }}</div>
              <div>用户标识：{{ settingsStore.requestParams.userId || '-' }}</div>
            </div>

            <span class="setting-desc">
              刷新后 ShumeiBoxId、X-RY-MODEL、X-RY-USER 将重新随机生成，影响所有网络请求的协议头参数，直到下次手动刷新。
            </span>
          </div>

          <div class="setting-row setting-row--stack">
            <div class="inline-header">
              <span class="setting-name">代理提取API</span>
              <el-switch
                v-model="settingsStore.useProxyIp"
                @change="() => persistSettings(`代理模式已${settingsStore.useProxyIp ? '开启' : '关闭'}`)"
              />
            </div>

            <el-input
              v-model="settingsStore.proxyApi"
              placeholder="例如: https://example.com/api/getip"
              size="small"
              clearable
              @change="() => persistSettings('代理API已保存')"
            />

            <span class="setting-desc">
              请输入代理IP提取API连接，请在提取API生成的时候设置每次提取一条以TXT返回。推荐使用快代理和小象代理。
            </span>
          </div>
        </el-card>
      </div>

      <div class="settings-column settings-column--side">
        <el-card class="settings-card settings-card--ocr" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Key /></el-icon>
              <span>百度 OCR 设置</span>
            </div>
          </template>

          <div class="setting-row setting-row--stack">
            <div class="setting-label">
              <span class="setting-name">API Key</span>
              <span class="setting-desc">图片识别调用百度 OCR 时使用，只保存在本地</span>
            </div>
            <el-input
              v-model="settingsStore.baiduOcr.apiKey"
              placeholder="输入百度 OCR API Key"
              show-password
              clearable
              @change="() => persistSettings('百度 OCR 设置已保存')"
            />
          </div>

          <div class="setting-row setting-row--stack">
            <div class="setting-label">
              <span class="setting-name">Secret Key</span>
              <span class="setting-desc">主进程读取后调用百度 OCR，不会暴露给页面请求</span>
            </div>
            <el-input
              v-model="settingsStore.baiduOcr.secretKey"
              placeholder="输入百度 OCR Secret Key"
              show-password
              clearable
              @change="() => persistSettings('百度 OCR 设置已保存')"
            />
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">配置状态</span>
              <span class="setting-desc">未配置时图片识别会提示缺少百度 OCR 配置</span>
            </div>
            <div class="setting-control">
              <el-tag :type="settingsStore.baiduOcrConfigured ? 'success' : 'warning'">
                {{ settingsStore.baiduOcrConfigured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
          </div>
        </el-card>

        <el-card class="settings-card settings-card--ai-ocr" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Key /></el-icon>
              <span>AI OCR 解析设置</span>
            </div>
          </template>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">启用 AI 兜底</span>
              <span class="setting-desc">本地解析缺字段时再调用，不替代万达真实数据</span>
            </div>
            <div class="setting-control">
              <el-switch
                v-model="settingsStore.aiOcr.enabled"
                @change="() => persistSettings('AI OCR 设置已保存')"
              />
            </div>
          </div>

          <div class="setting-row setting-row--stack">
            <div class="setting-label">
              <span class="setting-name">Base URL</span>
              <span class="setting-desc">默认使用旧版 DeepSeek 兼容接口，可按需替换</span>
            </div>
            <el-input
              v-model="settingsStore.aiOcr.baseUrl"
              placeholder="https://api.deepseek.com/chat/completions"
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>

          <div class="setting-row setting-row--stack">
            <div class="setting-label">
              <span class="setting-name">模型名</span>
              <span class="setting-desc">默认 deepseek-chat，只用于整理 OCR 文本</span>
            </div>
            <el-input
              v-model="settingsStore.aiOcr.model"
              placeholder="deepseek-chat"
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>

          <div class="setting-row setting-row--stack">
            <div class="setting-label">
              <span class="setting-name">API Key</span>
              <span class="setting-desc">只保存在本地，由主进程调用 AI 接口</span>
            </div>
            <el-input
              v-model="settingsStore.aiOcr.apiKey"
              placeholder="输入 AI OCR API Key"
              show-password
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>

          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">配置状态</span>
              <span class="setting-desc">未启用或缺少密钥时会跳过 AI 兜底</span>
            </div>
            <div class="setting-control">
              <el-tag :type="settingsStore.aiOcrConfigured ? 'success' : 'warning'">
                {{ settingsStore.aiOcrConfigured ? '已启用' : '未启用' }}
              </el-tag>
            </div>
          </div>
        </el-card>

        <el-card class="settings-card settings-card--data" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><Delete /></el-icon>
              <span>数据管理</span>
            </div>
          </template>
          <div class="setting-row">
            <div class="setting-label">
              <span class="setting-name">清除缓存数据</span>
              <span class="setting-desc">清除本地缓存，下次启动将重新加载数据</span>
            </div>
            <div class="setting-control">
              <el-button type="danger" plain size="small" @click="handleClearCacheData">清除缓存</el-button>
            </div>
          </div>
        </el-card>

        <el-card class="settings-card settings-card--about" shadow="never">
          <template #header>
            <div class="card-header">
              <el-icon><InfoFilled /></el-icon>
              <span>关于</span>
            </div>
          </template>
          <div class="about-info">
            <div class="about-row">
              <span class="about-label">应用名称</span>
              <span class="about-value">万达快速出票</span>
            </div>
            <div class="about-row">
              <span class="about-label">当前版本</span>
              <span class="about-value">v1.0.0</span>
            </div>
            <div class="about-row">
              <span class="about-label">运行环境</span>
              <span class="about-value">Electron + Vue 3</span>
            </div>
          </div>
        </el-card>
      </div>
    </section>
  </section>
</template>

<style scoped>
.settings-page {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 100px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  overflow: hidden;
  background: var(--bg-page, var(--app-bg));
}

.settings-summary-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.settings-summary-card {
  min-width: 0;
  height: 64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 8px 14px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
}

.settings-summary-card span,
.settings-summary-card em {
  overflow: hidden;
  color: var(--text-secondary, var(--app-muted));
  font-size: 13px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-summary-card strong {
  overflow: hidden;
  color: var(--text-primary, var(--app-text));
  font-size: 18px;
  line-height: 1.18;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-summary-card--blue {
  border-color: var(--summary-blue-border);
  background: var(--summary-blue-bg);
}

.settings-summary-card--green {
  border-color: var(--summary-green-border);
  background: var(--summary-green-bg);
}

.settings-summary-card--amber {
  border-color: var(--summary-amber-border);
  background: var(--summary-amber-bg);
}

.settings-workbench {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 480px);
  align-content: start;
  gap: 12px;
  overflow-y: auto;
  padding-right: 2px;
}

.settings-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-card {
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--bg-primary, var(--app-surface));
  box-shadow: var(--shadow-panel);
  overflow: hidden;
}

.settings-card :deep(.el-card__header) {
  padding: 13px 16px;
  border-bottom: 1px solid var(--app-border);
}

.settings-card :deep(.el-card__body) {
  padding: 0;
}

.settings-workbench::-webkit-scrollbar {
  width: 8px;
}

.settings-workbench::-webkit-scrollbar-thumb {
  border-radius: 8px;
  background: #c7d0dd;
}

.settings-workbench::-webkit-scrollbar-track {
  background: transparent;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
}

.card-header :deep(.el-icon) {
  color: var(--app-accent);
  font-size: 18px;
}

.setting-row {
  min-width: 0;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}

.setting-row + .setting-row {
  border-top: 1px solid var(--app-border);
}

.setting-row--stack {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 14px 16px;
}

.setting-label {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-name {
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
}

.setting-desc {
  color: var(--app-muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.setting-control {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.setting-control--wide {
  flex: 1;
  min-width: 280px;
  max-width: 520px;
}

.auto-pay-row {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) minmax(160px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
}

.auto-pay-row :deep(.el-input) {
  min-width: 0;
}

.auto-pay-warning {
  margin: 0 16px 14px;
  padding: 8px 10px;
  border: 1px solid var(--summary-amber-border);
  border-radius: 8px;
  background: var(--warning-soft-bg);
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.5;
}

.inline-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.biz-params-preview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  color: var(--app-muted);
  font-family: monospace;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  padding: 8px 10px;
}

.biz-params-preview div {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.about-info {
  padding: 10px 16px;
}

.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.about-row + .about-row {
  border-top: 1px solid var(--app-border);
}

.about-label {
  color: var(--app-muted);
  font-size: 13px;
}

.about-value {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
}

@media (max-width: 1360px) {
  .settings-page {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .settings-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 960px) {
  .auto-pay-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .biz-params-preview {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .setting-row {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .setting-control {
    justify-content: flex-start;
    margin-left: 0;
  }

  .setting-control--wide {
    max-width: none;
    min-width: 0;
  }
}

@media (max-height: 720px) {
  .settings-page {
    gap: 10px;
    padding: 12px;
  }

  .settings-summary-card {
    height: 88px;
    padding: 12px 14px;
  }

  .settings-summary-card strong {
    font-size: 20px;
  }
}
</style>
