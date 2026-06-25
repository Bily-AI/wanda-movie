<script setup lang="ts">
import { Delete, InfoFilled, Key, Monitor, Refresh, Setting, Tickets, Wallet } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useSettingsStore } from '@renderer/stores/settings'
import { useTicketStore } from '@renderer/stores/ticket'

const settingsStore = useSettingsStore()
const ticketStore = useTicketStore()

async function persistSettings(successText: string) {
  await settingsStore.saveSettings()
  ElMessage.success(successText)
}

async function handleRefreshRequestParams() {
  settingsStore.refreshRequestParams()
  await persistSettings(`业务参数已刷新：${settingsStore.requestParams.model}`)
}

async function handleClearCacheData() {
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
  <div class="settings-page">
    <header class="settings-header">
      <h2 class="settings-title">设置</h2>
      <p class="settings-subtitle">管理应用偏好与系统配置</p>
    </header>

    <div class="settings-body">
      <el-card class="settings-card settings-card--single" shadow="never" style="height: 112px">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>外观设置</span>
          </div>
        </template>
        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">界面风格</span>
            <span class="setting-desc">沿用旧版桌面操作布局</span>
          </div>
          <div class="setting-control">
            <el-tag>默认</el-tag>
          </div>
        </div>
      </el-card>

      <el-card class="settings-card settings-card--single" shadow="never" style="height: 112px">
        <template #header>
          <div class="card-header">
            <el-icon><Monitor /></el-icon>
            <span>窗口设置</span>
          </div>
        </template>
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

      <el-card class="settings-card settings-card--auto-pay" shadow="never" style="height: 165px">
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
          <el-button size="small" :icon="Refresh" @click="handleRefreshRequestParams">刷新设备</el-button>
        </div>

        <p class="auto-pay-warning">
          手动支付一次缓存支付宝登录信息以后在开启自动支付功能，否则会出现不确定错误或导致无限验证。
        </p>
      </el-card>

      <el-card class="settings-card settings-card--biz" shadow="never" style="height: 146px">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>业务请求头参数</span>
          </div>
        </template>

        <div class="setting-row setting-row--stack">
          <div class="inline-header">
            <span class="setting-name">设备指纹/型号/用户ID</span>
            <el-button size="small" :icon="Refresh" @click="handleRefreshRequestParams">刷新参数</el-button>
          </div>

          <div class="biz-params-preview">
            <div>设备指纹：{{ settingsStore.requestParams.deviceFingerprint?.slice(0, 24) || '...' }}</div>
            <div>设备型号：{{ settingsStore.requestParams.model || '-' }}</div>
            <div>用户标识：{{ settingsStore.requestParams.userId || '-' }}</div>
          </div>

          <span class="setting-desc">
            刷新后 ShumeiBoxId、X-RY-MODEL、X-RY-USER 将重新随机生成，影响所有网络请求的协议头参数，直到下次手动刷新。
          </span>
        </div>
      </el-card>

      <el-card class="settings-card settings-card--proxy" shadow="never" style="height: 146px">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>代理API设置</span>
          </div>
        </template>

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

      <el-card class="settings-card" shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Key /></el-icon>
            <span>百度 OCR 设置</span>
          </div>
        </template>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">API Key</span>
            <span class="setting-desc">图片识别调用百度 OCR 时使用，只保存在本地</span>
          </div>
          <div class="setting-control setting-control--wide">
            <el-input
              v-model="settingsStore.baiduOcr.apiKey"
              placeholder="输入百度 OCR API Key"
              show-password
              clearable
              @change="() => persistSettings('百度 OCR 设置已保存')"
            />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">Secret Key</span>
            <span class="setting-desc">主进程读取后调用百度 OCR，不会暴露给页面请求</span>
          </div>
          <div class="setting-control setting-control--wide">
            <el-input
              v-model="settingsStore.baiduOcr.secretKey"
              placeholder="输入百度 OCR Secret Key"
              show-password
              clearable
              @change="() => persistSettings('百度 OCR 设置已保存')"
            />
          </div>
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

      <el-card class="settings-card" shadow="never">
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

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">Base URL</span>
            <span class="setting-desc">默认使用旧版 DeepSeek 兼容接口，可按需替换</span>
          </div>
          <div class="setting-control setting-control--wide">
            <el-input
              v-model="settingsStore.aiOcr.baseUrl"
              placeholder="https://api.deepseek.com/chat/completions"
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">模型名</span>
            <span class="setting-desc">默认 deepseek-chat，只用于整理 OCR 文本</span>
          </div>
          <div class="setting-control setting-control--wide">
            <el-input
              v-model="settingsStore.aiOcr.model"
              placeholder="deepseek-chat"
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span class="setting-name">API Key</span>
            <span class="setting-desc">只保存在本地，由主进程调用 AI 接口</span>
          </div>
          <div class="setting-control setting-control--wide">
            <el-input
              v-model="settingsStore.aiOcr.apiKey"
              placeholder="输入 AI OCR API Key"
              show-password
              clearable
              @change="() => persistSettings('AI OCR 设置已保存')"
            />
          </div>
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

      <el-card class="settings-card settings-card--single" shadow="never" style="height: 128px">
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

      <el-card class="settings-card settings-card--about" shadow="never" style="height: 178px">
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
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.settings-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.settings-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.settings-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-height: 0;
  padding-bottom: 8px;
}

.settings-card {
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.setting-row--stack {
  flex-direction: column;
  align-items: stretch;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-name {
  font-size: 14px;
  font-weight: 500;
}

.setting-desc {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.setting-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.setting-control--wide {
  flex: 1;
  min-width: 280px;
}

.auto-pay-row {
  display: grid;
  grid-template-columns: auto 1fr 1fr auto;
  gap: 8px;
  align-items: center;
}

.auto-pay-warning {
  margin: 12px 0 0;
  color: #e6a23c;
  font-size: 12px;
  line-height: 1.6;
}

.inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.biz-params-preview {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
  background: var(--el-fill-color-light);
  padding: 6px 10px;
  border-radius: 8px;
  font-family: monospace;
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.about-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.about-label {
  color: var(--text-secondary);
}

.about-value {
  font-weight: 500;
}

@media (max-width: 1200px) {
  .settings-body {
    grid-template-columns: 1fr;
  }

  .auto-pay-row {
    grid-template-columns: 1fr;
  }

  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .setting-control {
    justify-content: flex-start;
  }

  .setting-control--wide {
    min-width: 0;
  }
}
</style>
