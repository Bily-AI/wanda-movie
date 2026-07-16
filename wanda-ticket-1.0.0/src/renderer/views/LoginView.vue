<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const code = ref('')
const submitting = ref(false)

async function handleActivate() {
  submitting.value = true
  const ok = await auth.activateCard(code.value)
  submitting.value = false
  if (ok) { ElMessage.success('激活成功'); router.replace('/ticket') }
  else ElMessage.error(auth.loginError)
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <h2>激活卡密</h2>
      <el-input v-model="code" placeholder="请输入卡密" @keyup.enter="handleActivate" />
      <p v-if="auth.loginError" class="login-err">{{ auth.loginError }}</p>
      <el-button type="primary" :loading="submitting" :disabled="!code.trim()" @click="handleActivate">激活</el-button>
    </div>
  </div>
</template>

<style scoped>
.login-page { height: 100vh; display: grid; place-items: center; background: var(--app-bg, #f3f5f9); }
.login-box { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(31,42,68,.12); }
.login-box h2 { margin: 0 0 4px; font-size: 18px; }
.login-err { margin: 0; color: #f56c6c; font-size: 13px; }
</style>
