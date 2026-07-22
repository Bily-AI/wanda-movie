<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'
import { changePassword } from '@renderer/services/authApi'

const auth = useAuthStore()
const router = useRouter()
const mode = ref<'login' | 'register' | 'changePwd'>('login')
const username = ref('')
const password = ref('')
const cardCode = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const remember = ref(false)

const REMEMBER_KEY = 'wanda_login_remember'

// 启动时回填已记住的账号密码
onMounted(() => {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { username?: string; password?: string }
      username.value = saved.username || ''
      password.value = saved.password || ''
      remember.value = true
    }
  } catch { /* 记录损坏则忽略 */ }
})

function switchMode(next: 'login' | 'register' | 'changePwd') {
  mode.value = next
  auth.authError = ''
  cardCode.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

async function submit() {
  if (!username.value.trim() || !password.value) return
  if (mode.value === 'register' && !cardCode.value.trim()) { auth.authError = '注册需要填写卡密'; return }
  submitting.value = true
  try {
    const ok = mode.value === 'login'
      ? await auth.login(username.value, password.value)
      : await auth.register(username.value, password.value, cardCode.value)
    if (ok) {
      // 登录模式:按「记住密码」保存或清除本地凭据
      if (mode.value === 'login') {
        if (remember.value) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({ username: username.value.trim(), password: password.value }))
        } else {
          localStorage.removeItem(REMEMBER_KEY)
        }
      }
      ElMessage.success(mode.value === 'login' ? '登录成功' : '注册成功'); router.replace('/ticket')
    }
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

// 修改密码:用 用户名 + 原密码 校验
async function submitChangePwd() {
  if (!username.value.trim() || !password.value) { auth.authError = '请输入用户名和原密码'; return }
  if (!newPassword.value || newPassword.value.length < 6) { auth.authError = '新密码至少 6 位'; return }
  if (newPassword.value !== confirmPassword.value) { auth.authError = '两次输入的新密码不一致'; return }
  submitting.value = true
  auth.authError = ''
  try {
    const res = await changePassword(username.value.trim(), password.value, newPassword.value)
    if (res.ok) {
      ElMessage.success('密码已修改,请用新密码登录')
      // 用新密码回填,切回登录
      password.value = newPassword.value
      switchMode('login')
    } else {
      auth.authError = mapChangePwdCode(res.code)
      ElMessage.error(auth.authError)
    }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    auth.authError = `连接失败 [${e?.code ?? 'ERR'}] ${e?.message ?? String(err)}`
    ElMessage.error(auth.authError)
  } finally {
    submitting.value = false
  }
}

function mapChangePwdCode(code?: string): string {
  switch (code) {
    case 'BAD_LOGIN': return '用户名或原密码错误'
    case 'PASSWORD_TOO_SHORT': return '新密码至少 6 位'
    case 'USER_DISABLED': return '账号已被禁用'
    default: return '修改失败,请检查网络'
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-box">
      <div class="login-tabs">
        <button :class="{ active: mode === 'login' }" @click="switchMode('login')">登录</button>
        <button :class="{ active: mode === 'register' }" @click="switchMode('register')">注册</button>
      </div>

      <!-- 登录 / 注册 -->
      <template v-if="mode !== 'changePwd'">
        <el-input v-model="username" placeholder="用户名" />
        <el-input v-model="password" type="password" placeholder="密码" show-password @keyup.enter="submit" />
        <el-input v-if="mode === 'register'" v-model="cardCode" placeholder="卡密(点卡或时长卡)" @keyup.enter="submit" />
        <div v-if="mode === 'login'" class="login-remember">
          <el-checkbox v-model="remember">记住密码</el-checkbox>
        </div>
        <p v-if="auth.authError" class="login-err">{{ auth.authError }}</p>
        <el-button type="primary" :loading="submitting" :disabled="!username.trim() || !password || (mode === 'register' && !cardCode.trim())" @click="submit">
          {{ mode === 'login' ? '登录' : '注册' }}
        </el-button>
        <p v-if="mode === 'login'" class="login-link"><span @click="switchMode('changePwd')">修改密码</span></p>
      </template>

      <!-- 修改密码 -->
      <template v-else>
        <el-input v-model="username" placeholder="用户名" />
        <el-input v-model="password" type="password" placeholder="原密码" show-password />
        <el-input v-model="newPassword" type="password" placeholder="新密码(至少6位)" show-password />
        <el-input v-model="confirmPassword" type="password" placeholder="确认新密码" show-password @keyup.enter="submitChangePwd" />
        <p v-if="auth.authError" class="login-err">{{ auth.authError }}</p>
        <el-button type="primary" :loading="submitting" :disabled="!username.trim() || !password || !newPassword || !confirmPassword" @click="submitChangePwd">
          确认修改
        </el-button>
        <p class="login-link"><span @click="switchMode('login')">返回登录</span></p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.login-page { height: 100%; display: grid; place-items: center; background: var(--app-bg, #f3f5f9); }
.login-box { width: 320px; display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px rgba(31,42,68,.12); }
.login-tabs { display: flex; gap: 8px; }
.login-tabs button { flex: 1; padding: 8px; border: none; background: #eef1f6; border-radius: 6px; cursor: pointer; color: #6b7280; }
.login-tabs button.active { background: var(--app-accent, #2f6fed); color: #fff; }
.login-remember { display: flex; margin: -2px 0; }
.login-err { margin: 0; color: #f56c6c; font-size: 13px; }
.login-link { margin: 0; text-align: center; font-size: 13px; }
.login-link span { color: var(--app-accent, #2f6fed); cursor: pointer; }
.login-link span:hover { text-decoration: underline; }
</style>
