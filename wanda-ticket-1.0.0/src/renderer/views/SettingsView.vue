<script setup lang="ts">
import { Delete, InfoFilled, Key, Monitor, Refresh, Setting, Tickets, Wallet } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useSettingsStore } from '@renderer/stores/settings'
import { useTicketStore } from '@renderer/stores/ticket'

const settingsStore = useSettingsStore()
const ticketStore = useTicketStore()

function handleRefreshRequestParams(): void {
  settingsStore.refreshRequestParams()
  ElMessage.success('请求头设备参数已刷新')
}

async function handleClearCacheData(): Promise<void> {
  try {
    await ElMessageBox.confirm('只清除城市和影院缓存，不会删除账号、日志和设置。是否继续？', '清除缓存', {
      confirmButtonText: '清除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await settingsStore.clearCacheData()
    await ticketStore.loadCityData()
    ElMessage.success('缓存已清除，城市和影院数据已重新加载')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error instanceof Error && error.message ? error.message : '清除缓存失败')
    }
  }
}
</script>

<template>
  <section class="settings-page">
    <header class="settings-title">
      <h1>设置</h1>
      <p>管理应用偏好与系统配置</p>
    </header>

    <section class="setting-card">
      <header>
        <el-icon><Setting /></el-icon>
        <strong>外观设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>界面样式</span>
          <small>沿用旧版桌面操作布局</small>
        </div>
        <el-tag>默认</el-tag>
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Monitor /></el-icon>
        <strong>窗口设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>记住窗口位置</span>
          <small>启动时恢复上次关闭时的窗口位置和大小</small>
        </div>
        <el-switch v-model="settingsStore.rememberWindow" />
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Tickets /></el-icon>
        <strong>购票设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>下单成功后自动关闭弹窗</span>
          <small>购票支付成功后自动关闭支付弹窗</small>
        </div>
        <el-switch v-model="settingsStore.autoClosePaymentWindow" />
      </div>
      <div class="setting-row">
        <div>
          <span>支付卡显示方式</span>
          <small>选择支付卡在购票页面的展示形式</small>
        </div>
        <el-radio-group v-model="settingsStore.paymentCardDisplay" size="small">
          <el-radio-button label="列表" />
          <el-radio-button label="卡片" />
        </el-radio-group>
      </div>
      <div class="setting-row">
        <div>
          <span>取票码面板模板</span>
          <small>选择取票成功后的面板展示样式</small>
        </div>
        <el-radio-group v-model="settingsStore.ticketCodeTemplate" size="small">
          <el-radio-button label="默认" />
          <el-radio-button label="万达风格" />
        </el-radio-group>
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Wallet /></el-icon>
        <strong>自动支付设置</strong>
      </header>
      <div class="setting-row setting-row--compact">
        <el-switch v-model="settingsStore.autoPayment.enabled" />
        <el-input v-model="settingsStore.autoPayment.phone" placeholder="输入支付宝手机号" />
        <el-input v-model="settingsStore.autoPayment.password" placeholder="输入支付密码" show-password />
        <el-button :icon="Refresh" @click="handleRefreshRequestParams">刷新设备</el-button>
      </div>
      <p class="setting-warning">
        手动支付一次缓存支付宝登录信息以后再开启自动支付功能，否则会出现不确定错误或导致无限验证。
      </p>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Setting /></el-icon>
        <strong>业务请求头参数</strong>
      </header>
      <div class="request-grid">
        <el-input v-model="settingsStore.requestParams.deviceFingerprint" placeholder="设备指纹" />
        <el-input v-model="settingsStore.requestParams.model" placeholder="设备型号" />
        <el-input v-model="settingsStore.requestParams.userId" placeholder="用户ID" />
        <el-input v-model="settingsStore.requestParams.shumeiBoxId" placeholder="ShumeiBoxId" />
        <el-input v-model="settingsStore.requestParams.ios" placeholder="ios" />
        <el-input v-model="settingsStore.requestParams.screen" placeholder="screen" />
        <el-input v-model="settingsStore.requestParams.width" placeholder="width" />
        <el-input v-model="settingsStore.requestParams.height" placeholder="height" />
        <el-input v-model="settingsStore.requestParams.build" placeholder="build" />
        <el-input v-model="settingsStore.requestParams.languageType" placeholder="language_type" />
      </div>
      <pre class="param-preview">{{ settingsStore.requestParamsPreview }}</pre>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Setting /></el-icon>
        <strong>代理API设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>代理提取API</span>
          <small>活动礼包和业务请求可复用旧版代理设置</small>
        </div>
        <el-input v-model="settingsStore.proxyApi" placeholder="例如：https://example.com/api/getip" />
      </div>
      <div class="setting-row">
        <div>
          <span>使用代理IP</span>
          <small>旧版代理配置字段为 useProxy</small>
        </div>
        <el-switch v-model="settingsStore.useProxyIp" />
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Key /></el-icon>
        <strong>百度 OCR 设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>API Key</span>
          <small>图片识别调用百度 OCR 时使用，只保存在本地</small>
        </div>
        <el-input v-model="settingsStore.baiduOcr.apiKey" placeholder="输入百度 OCR API Key" show-password clearable />
      </div>
      <div class="setting-row">
        <div>
          <span>Secret Key</span>
          <small>主进程读取后调用百度 OCR，不会暴露给页面请求</small>
        </div>
        <el-input
          v-model="settingsStore.baiduOcr.secretKey"
          placeholder="输入百度 OCR Secret Key"
          show-password
          clearable
        />
      </div>
      <div class="setting-row">
        <div>
          <span>配置状态</span>
          <small>未配置时图片识别会提示缺少百度 OCR 配置</small>
        </div>
        <el-tag :type="settingsStore.baiduOcrConfigured ? 'success' : 'warning'">
          {{ settingsStore.baiduOcrConfigured ? '已配置' : '未配置' }}
        </el-tag>
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Key /></el-icon>
        <strong>AI OCR 解析设置</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>启用 AI 兜底</span>
          <small>本地解析缺字段时再调用，不替代万达真实数据</small>
        </div>
        <el-switch v-model="settingsStore.aiOcr.enabled" />
      </div>
      <div class="setting-row">
        <div>
          <span>Base URL</span>
          <small>默认使用旧版 DeepSeek 兼容接口，可按需替换</small>
        </div>
        <el-input v-model="settingsStore.aiOcr.baseUrl" placeholder="https://api.deepseek.com/chat/completions" clearable />
      </div>
      <div class="setting-row">
        <div>
          <span>模型名</span>
          <small>默认 deepseek-chat，只用于整理 OCR 文本</small>
        </div>
        <el-input v-model="settingsStore.aiOcr.model" placeholder="deepseek-chat" clearable />
      </div>
      <div class="setting-row">
        <div>
          <span>API Key</span>
          <small>只保存在本地，由主进程调用 AI 接口</small>
        </div>
        <el-input v-model="settingsStore.aiOcr.apiKey" placeholder="输入 AI OCR API Key" show-password clearable />
      </div>
      <div class="setting-row">
        <div>
          <span>配置状态</span>
          <small>未启用或缺少密钥时会跳过 AI 兜底</small>
        </div>
        <el-tag :type="settingsStore.aiOcrConfigured ? 'success' : 'warning'">
          {{ settingsStore.aiOcrConfigured ? '已启用' : '未启用' }}
        </el-tag>
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><Delete /></el-icon>
        <strong>数据管理</strong>
      </header>
      <div class="setting-row">
        <div>
          <span>清除缓存数据</span>
          <small>清除本地缓存，下次启动将重新加载数据</small>
        </div>
        <el-button type="danger" plain @click="handleClearCacheData">清除缓存</el-button>
      </div>
    </section>

    <section class="setting-card">
      <header>
        <el-icon><InfoFilled /></el-icon>
        <strong>关于</strong>
      </header>
      <div class="setting-row">
        <span>应用名称</span>
        <strong>万达快速出票</strong>
      </div>
      <div class="setting-row">
        <span>当前版本</span>
        <strong>1.0.0</strong>
      </div>
      <div class="setting-row">
        <span>运行环境</span>
        <strong>Electron + Vue 3</strong>
      </div>
    </section>
  </section>
</template>

<style scoped>
.settings-page {
  min-width: 980px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 24px 28px;
}

.settings-title {
  padding: 0 0 8px;
  border-bottom: 1px solid var(--app-border);
}

.settings-title h1 {
  margin: 0;
  color: var(--app-text);
  font-size: 24px;
}

.settings-title p {
  margin: 4px 0 0;
  color: var(--app-muted);
}

.setting-card {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
}

.setting-card header {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
}

.setting-card header :deep(.el-icon) {
  color: var(--app-accent);
}

.setting-row {
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(220px, 420px);
  gap: 18px;
  align-items: center;
  padding: 12px 18px;
  border-bottom: 1px solid #eef2f8;
  color: var(--app-subtle);
}

.setting-row:last-child {
  border-bottom: 0;
}

.setting-row div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-row span {
  color: var(--app-text);
}

.setting-row small {
  color: var(--app-muted);
}

.setting-row--compact {
  grid-template-columns: auto 200px 200px 110px;
}

.setting-warning {
  margin: 0;
  padding: 0 18px 18px;
  color: #f56c6c;
}

.request-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #eef2f8;
}

.param-preview {
  margin: 0;
  padding: 0 18px 18px 38px;
  color: var(--app-muted);
  font-family: Consolas, 'Courier New', monospace;
  white-space: pre-wrap;
}
</style>
