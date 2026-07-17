<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@renderer/stores/auth'
import { submitFeedback, myFeedback, type FeedbackItem } from '@renderer/services/feedbackApi'

const auth = useAuthStore()

// ---------- 提交表单 ----------
const fbType = ref<string>('problem')
const fbCategory = ref<string>('出票')
const fbContent = ref<string>('')
const fbContact = ref<string>('')
const fbImages = ref<string[]>([])
const submitting = ref(false)

const categoryOptions = ['出票', '支付', '账号登录', '界面', '其它']

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  const remaining = 3 - fbImages.value.length
  const files = Array.from(input.files).slice(0, remaining)
  for (const file of files) {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      if (result && fbImages.value.length < 3) {
        fbImages.value.push(result)
      }
    }
    reader.readAsDataURL(file)
  }
  // 重置 input 以便同名文件可再次选
  input.value = ''
}

function removeImage(index: number) {
  fbImages.value.splice(index, 1)
}

async function handleSubmit() {
  if (!fbContent.value.trim()) return
  submitting.value = true
  try {
    const res = await submitFeedback(auth.token, {
      type: fbType.value,
      category: fbCategory.value,
      content: fbContent.value.trim(),
      contact: fbContact.value.trim() || undefined,
      images: fbImages.value.length > 0 ? fbImages.value : undefined
    })
    if (res.ok) {
      ElMessage.success('反馈提交成功，感谢您的建议！')
      fbContent.value = ''
      fbContact.value = ''
      fbImages.value = []
      fbType.value = 'problem'
      fbCategory.value = '出票'
      await loadMyFeedback()
    } else {
      ElMessage.error(`提交失败：${res.code ?? '未知错误'}`)
    }
  } catch (err) {
    ElMessage.error('网络错误，提交失败')
  } finally {
    submitting.value = false
  }
}

// ---------- 我的反馈 ----------
const myList = ref<FeedbackItem[]>([])
const loading = ref(false)

const statusLabel: Record<string, string> = {
  pending: '待处理',
  replied: '已回复',
  fixed: '已修复'
}
const statusColor: Record<string, string> = {
  pending: '#909399',
  replied: '#409eff',
  fixed: '#67c23a'
}

async function loadMyFeedback() {
  loading.value = true
  try {
    const res = await myFeedback(auth.token)
    if (res.ok && res.items) {
      myList.value = res.items
    }
  } catch {
    ElMessage.error('加载反馈列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadMyFeedback()
})
</script>

<template>
  <div class="feedback-page">
    <!-- 提交反馈 -->
    <section class="feedback-section">
      <div class="section-title">提交反馈</div>

      <div class="form-row">
        <span class="form-label">类型</span>
        <el-radio-group v-model="fbType">
          <el-radio value="problem">问题</el-radio>
          <el-radio value="feature">需求</el-radio>
        </el-radio-group>
      </div>

      <div class="form-row">
        <span class="form-label">分类</span>
        <el-select v-model="fbCategory" placeholder="请选择分类" style="width: 160px;">
          <el-option v-for="cat in categoryOptions" :key="cat" :label="cat" :value="cat" />
        </el-select>
      </div>

      <div class="form-row form-row--column">
        <span class="form-label">内容 <span class="required">*</span></span>
        <el-input
          v-model="fbContent"
          type="textarea"
          :rows="4"
          placeholder="请描述您遇到的问题或需求..."
          maxlength="1000"
          show-word-limit
        />
      </div>

      <div class="form-row">
        <span class="form-label">联系方式</span>
        <el-input v-model="fbContact" placeholder="手机/邮箱（选填）" style="width: 240px;" />
      </div>

      <div class="form-row form-row--column">
        <span class="form-label">图片（最多 3 张）</span>
        <div class="image-area">
          <div v-for="(img, idx) in fbImages" :key="idx" class="thumb-wrap">
            <img :src="img" class="thumb" alt="预览图" />
            <button class="thumb-del" type="button" @click="removeImage(idx)">×</button>
          </div>
          <label v-if="fbImages.length < 3" class="upload-btn">
            <span>+ 添加图片</span>
            <input
              type="file"
              accept="image/*"
              multiple
              style="display: none;"
              @change="onFileChange"
            />
          </label>
        </div>
      </div>

      <div class="form-row">
        <el-button
          type="primary"
          :disabled="!fbContent.trim() || submitting"
          :loading="submitting"
          @click="handleSubmit"
        >
          提交
        </el-button>
      </div>
    </section>

    <!-- 我的反馈 -->
    <section class="feedback-section">
      <div class="section-title">
        我的反馈
        <el-button size="small" :loading="loading" style="margin-left: 12px;" @click="loadMyFeedback">刷新</el-button>
      </div>

      <div v-if="loading && myList.length === 0" class="list-empty">加载中...</div>
      <div v-else-if="myList.length === 0" class="list-empty">暂无反馈记录</div>

      <div v-for="item in myList" :key="item.id" class="fb-card">
        <div class="fb-card-header">
          <span class="fb-type-tag">{{ item.type === 'problem' ? '问题' : '需求' }}</span>
          <span class="fb-category">{{ item.category }}</span>
          <span
            class="fb-status-tag"
            :style="{ color: statusColor[item.status] ?? '#909399', borderColor: statusColor[item.status] ?? '#909399' }"
          >
            {{ statusLabel[item.status] ?? item.status }}
          </span>
          <span class="fb-time">{{ item.createdAt.slice(0, 10) }}</span>
        </div>
        <div class="fb-content">{{ item.content }}</div>
        <div v-if="item.reply" class="fb-reply">
          <span class="fb-reply-label">管理员答复：</span>{{ item.reply }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.feedback-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}

.feedback-section {
  background: var(--app-surface, #fff);
  border: 1px solid var(--app-border, #e4e7ed);
  border-radius: 8px;
  padding: 16px;
  box-shadow: var(--shadow-panel);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.form-row--column {
  flex-direction: column;
  align-items: flex-start;
}

.form-label {
  font-size: 13px;
  color: var(--app-subtle, #606266);
  min-width: 80px;
  flex-shrink: 0;
}

.required {
  color: #f56c6c;
}

.image-area {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.thumb-wrap {
  position: relative;
  width: 72px;
  height: 72px;
}

.thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--app-border, #e4e7ed);
}

.thumb-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  padding: 0;
}

.upload-btn {
  width: 72px;
  height: 72px;
  border: 1px dashed var(--app-border, #e4e7ed);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  color: var(--app-muted, #909399);
  transition: border-color 0.2s;
  text-align: center;
}

.upload-btn:hover {
  border-color: var(--app-accent, #409eff);
  color: var(--app-accent, #409eff);
}

.list-empty {
  color: var(--app-muted, #909399);
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}

.fb-card {
  border: 1px solid var(--app-border, #e4e7ed);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 10px;
  background: var(--app-bg, #f5f7fa);
}

.fb-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.fb-type-tag {
  font-size: 12px;
  background: var(--summary-blue-bg, #eff6ff);
  color: #409eff;
  border-radius: 4px;
  padding: 1px 6px;
}

.fb-category {
  font-size: 12px;
  color: var(--app-subtle, #606266);
}

.fb-status-tag {
  font-size: 12px;
  border: 1px solid;
  border-radius: 4px;
  padding: 0 6px;
}

.fb-time {
  font-size: 12px;
  color: var(--app-muted, #909399);
  margin-left: auto;
}

.fb-content {
  font-size: 13px;
  color: var(--app-text);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.fb-reply {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--summary-green-bg, #f0fdf4);
  border-radius: 4px;
  font-size: 13px;
  color: var(--app-text);
  line-height: 1.5;
}

.fb-reply-label {
  font-weight: 600;
  color: #67c23a;
}
</style>
