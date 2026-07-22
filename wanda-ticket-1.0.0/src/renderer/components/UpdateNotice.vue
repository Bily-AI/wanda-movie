<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

type Phase = 'prompt' | 'downloading' | 'done' | 'error'

const visible = ref(false)
const version = ref('')
const notes = ref('')
const phase = ref<Phase>('prompt')
const percent = ref(0)
const receivedMB = ref(0)
const totalMB = ref(0)
const errorMsg = ref('')

const disposers: Array<() => void> = []

onMounted(() => {
  const app = window.wandaApp
  if (!app?.onUpdateAvailable) return

  disposers.push(app.onUpdateAvailable((p) => {
    version.value = p.version
    notes.value = p.notes || ''
    phase.value = 'prompt'
    percent.value = 0
    visible.value = true
  }))

  disposers.push(app.onUpdateProgress((p) => {
    phase.value = p.done ? 'done' : 'downloading'
    percent.value = p.percent
    if (typeof p.receivedMB === 'number') receivedMB.value = p.receivedMB
    if (typeof p.totalMB === 'number') totalMB.value = p.totalMB
  }))

  disposers.push(app.onUpdateError((p) => {
    phase.value = 'error'
    errorMsg.value = p.message || '更新失败'
  }))
})

onBeforeUnmount(() => {
  disposers.forEach((fn) => fn())
})

async function startUpdate() {
  phase.value = 'downloading'
  percent.value = 0
  await window.wandaApp?.startUpdate()
}

function later() {
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="phase === 'error' ? '更新失败' : '发现新版本'"
    width="380px"
    :show-close="phase === 'prompt' || phase === 'error'"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    align-center
  >
    <!-- 询问 -->
    <template v-if="phase === 'prompt'">
      <p class="upd-line">检测到新版本 <b>v{{ version }}</b></p>
      <p v-if="notes" class="upd-notes">{{ notes }}</p>
      <p class="upd-tip">点击「立即更新」将下载并自动重启,约几十秒。</p>
    </template>

    <!-- 下载中 -->
    <template v-else-if="phase === 'downloading'">
      <p class="upd-line">正在下载新版本 v{{ version }} …</p>
      <el-progress :percentage="percent" :stroke-width="14" :text-inside="true" status="success" />
      <p class="upd-sub">{{ receivedMB }} MB / {{ totalMB }} MB</p>
    </template>

    <!-- 完成 -->
    <template v-else-if="phase === 'done'">
      <p class="upd-line">下载完成,正在重启更新…</p>
      <el-progress :percentage="100" :stroke-width="14" :text-inside="true" status="success" />
      <p class="upd-sub">请稍候,程序会自动关闭并升级</p>
    </template>

    <!-- 失败 -->
    <template v-else>
      <p class="upd-line" style="color:#f56c6c">{{ errorMsg }}</p>
      <p class="upd-tip">可稍后重启程序再试。</p>
    </template>

    <template #footer>
      <template v-if="phase === 'prompt'">
        <el-button @click="later">稍后</el-button>
        <el-button type="primary" @click="startUpdate">立即更新</el-button>
      </template>
      <template v-else-if="phase === 'error'">
        <el-button type="primary" @click="visible = false">关闭</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<style scoped>
.upd-line { margin: 0 0 10px; font-size: 14px; }
.upd-notes { margin: 0 0 10px; color: #666; font-size: 13px; white-space: pre-wrap; }
.upd-tip { margin: 8px 0 0; color: #999; font-size: 12px; }
.upd-sub { margin: 8px 0 0; color: #909399; font-size: 12px; text-align: right; }
</style>
