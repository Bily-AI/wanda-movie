<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const cardCode = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) return
  if (mode.value === 'register' && !cardCode.value.trim()) { auth.authError = '注册需要填写卡密'; return }
  submitting.value = true
  try {
    const ok = mode.value === 'login'
      ? await auth.login(username.value, password.value)
      : await auth.register(username.value, password.value, cardCode.value)
    if (ok) { ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功'); router.replace('/ticket') }
    else ElMessage.error(auth.authError)
  } catch (err) {
    // 网络不通/服务器没起/请求超时都会抛到这里 —— 之前没接住,按钮会一直转圈且无提示
    const e = err as { code?: string; message?: string; config?: { baseURL?: string } }
    const base = e?.config?.baseURL ?? '?'
    auth.authError = `连接失败 [${e?.code ?? 'ERR'}] ${e?.message ?? String(err)} (base=${base})`
    ElMessage.error(auth.authError)
    console.error('[auth] submit failed:', err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>
      <el-input v-model="username" placeholder="用户名" />
      <el-input v-model="password" type="password" placeholder="密码" show-password @keyup.enter="submit" />
      <el-input v-if="mode === 'register'" v-model="cardCode" placeholder="卡密(点卡或时长卡)" @keyup.enter="submit" />
      <p v-if="auth.authError" class="login-err">{{ auth.authError }}</p>
      <el-button type="primary" :loading="submitting" :disabled="!username.trim() || !password || (mode === 'register' && !cardCode.trim())" @click="submit">
        {{ mode === 'login' ? '登录' : '注册' }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.login-page { height: 100%; display: grid; place-items: center; background: var(--app-bg, #f3f5f9); }
.login-box { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(31,42,68,.12); }
.login-tabs { display: flex; gap: 8px; }
.login-tabs button { flex: 1; padding: 8px; border: none; background: #eef1f6; border-radius: 6px; cursor: pointer; color: #6b7280; }
.login-tabs button.active { background: var(--app-accent, #2f6fed); color: #fff; }
.login-err { margin: 0; color: #f56c6c; font-size: 13px; }
</style>
