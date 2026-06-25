<script setup lang="ts">
import { ref } from 'vue'
import { Lock, Refresh, Search, UserFilled, Edit, Delete, DocumentCopy, Upload, FolderAdd, Sort } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { TableInstance } from 'element-plus'

import { useAccountsStore } from '@renderer/stores/accounts'
import type { WandaAccount } from '@shared/localData'

const accountsStore = useAccountsStore()

const accountTableRef = ref<TableInstance>()

function handleAccountSelectionChange(rows: WandaAccount[]): void {
  accountsStore.setSelectedAccountIds(rows.map((row) => row.id))
}

function handleCancelSelection() {
  accountTableRef.value?.clearSelection()
  accountsStore.cancelSelection()
}

const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuAccount = ref<WandaAccount | null>(null)

function handleRowClick(row: WandaAccount) {
  accountsStore.setCurrentAccount(row.id)
}

function tableRowClassName({ row }: { row: WandaAccount }) {
  return row.id === accountsStore.currentAccountId ? 'is-current-row' : ''
}

function handleRowContextMenu(row: WandaAccount, column: any, event: MouseEvent) {
  event.preventDefault()
  contextMenuAccount.value = row
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
  
  const closeMenu = () => {
    contextMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
  }
  document.addEventListener('click', closeMenu)
}

async function handleEditRemark() {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入新的备注', '修改备注', {
      inputValue: account.remark,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await accountsStore.updateAccountRemark(account.id, value)
  } catch {}
}

async function handleDeleteAccount() {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    await ElMessageBox.confirm(`确定要删除账号 ${account.phone} 吗？`, '删除账号', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await accountsStore.deleteAccount(account.id)
  } catch {}
}

async function handleCopyPhone() {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  try {
    await navigator.clipboard.writeText(account.phone)
    ElMessage.success('手机号已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleCreateGroup() {
  contextMenuVisible.value = false
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '创建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消'
    })
    if (value.trim()) {
      await accountsStore.createGroup(value.trim())
    }
  } catch {}
}

async function handleMoveToGroup(groupId: string) {
  const account = contextMenuAccount.value
  if (!account) return
  contextMenuVisible.value = false
  await accountsStore.moveAccountToGroup(account.id, groupId)
}

const moveGroupDialogVisible = ref(false)
const targetGroupId = ref('')

function handleMoveSelectedToGroup(): void {
  targetGroupId.value = accountsStore.groups[0]?.id || ''
  moveGroupDialogVisible.value = true
}

async function confirmMoveSelectedToGroup(): Promise<void> {
  if (!targetGroupId.value) return
  
  const movedCount = await accountsStore.moveSelectedToGroup(targetGroupId.value)
  if (movedCount > 0) {
    ElMessage.success(accountsStore.loginForm.message)
    handleCancelSelection()
  } else {
    ElMessage.warning(accountsStore.loginForm.message)
  }
  moveGroupDialogVisible.value = false
}

async function handleImportAccounts(): Promise<void> {
  contextMenuVisible.value = false
  try {
    const result = await ElMessageBox.prompt('每行一个账号，可填写手机号、CK 和用户标识', '导入万达账号', {
      confirmButtonText: '导入',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '手机号 CK 后接真实值 USER 后接用户标识'
    })
    const count = await accountsStore.importAccountsFromText(result.value)

    if (count > 0) {
      ElMessage.success(accountsStore.loginForm.message)
    } else {
      ElMessage.warning(accountsStore.loginForm.message)
    }
  } catch {
    // 用户取消导入时不需要提示。
  }
}
</script>

<template>
  <aside class="account-sidebar">
    <section class="panel account-panel">
      <div class="account-toolbar">
        <el-icon class="toolbar-icon"><UserFilled /></el-icon>
        <el-select v-model="accountsStore.selectedGroupId" size="small" placeholder="分组">
          <el-option
            v-for="group in accountsStore.groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
        <el-button size="small" :icon="Refresh" @click="accountsStore.loadAccounts()" />
        <el-input
          v-model="accountsStore.searchKeyword"
          size="small"
          placeholder="搜索..."
          :prefix-icon="Search"
        />
      </div>

      <div v-if="accountsStore.currentAccount" class="current-account-info">
        当前使用：{{ accountsStore.currentAccount.phone }}
        <span
          v-if="accountsStore.currentAccount.statusText"
          class="status-badge status-badge--active"
        >
          {{ accountsStore.currentAccount.statusText }}
        </span>
        ({{ accountsStore.currentAccount.remark }})
      </div>

      <el-table
        ref="accountTableRef"
        class="account-table"
        :data="accountsStore.filteredAccounts"
        height="100%"
        row-key="id"
        empty-text="暂无数据"
        :row-class-name="tableRowClassName"
        @row-click="handleRowClick"
        @row-contextmenu="handleRowContextMenu"
        @selection-change="handleAccountSelectionChange"
      >
        <el-table-column type="selection" width="40" />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="remark" label="备注" min-width="88" />
        <el-table-column prop="statusText" label="状态" width="72" />
      </el-table>

      <div class="account-actions">
        <span>已选 {{ accountsStore.selectedCount }} 项</span>
        <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleMoveSelectedToGroup">
          移动到分组
        </el-button>
        <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="handleCancelSelection">
          取消选择
        </el-button>
      </div>
    </section>

    <section class="panel wanda-login-panel">
      <header class="panel-header">
        <span>
          <el-icon><Lock /></el-icon>
          万达账号登录
        </span>
        <el-button size="small" text @click="handleImportAccounts">导入账号</el-button>
      </header>

      <div class="login-form">
        <el-input v-model="accountsStore.loginForm.phone" placeholder="请输入手机号">
          <template #prepend>+86</template>
        </el-input>
        <div class="login-code-row">
          <el-input v-model="accountsStore.loginForm.code" placeholder="验证码" />
          <el-button
            type="primary"
            :loading="accountsStore.loginForm.sending"
            :disabled="
              accountsStore.loginForm.sending ||
              accountsStore.loginForm.loggingIn ||
              accountsStore.loginForm.countdown > 0 ||
              !accountsStore.loginForm.phone
            "
            @click="accountsStore.sendLoginCode"
          >
            {{ accountsStore.loginForm.countdown > 0 ? `${accountsStore.loginForm.countdown}秒后获取` : '获取验证码' }}
          </el-button>
        </div>
        <el-button
          class="full-button"
          type="primary"
          :loading="accountsStore.loginForm.loggingIn"
          :disabled="
            accountsStore.loginForm.sending ||
            accountsStore.loginForm.loggingIn ||
            !accountsStore.loginForm.phone ||
            !accountsStore.loginForm.code
          "
          @click="accountsStore.loginWandaAccount"
        >
          登录
        </el-button>
      </div>

      <div class="login-status">
        <span class="status-dot" />
        {{ accountsStore.loginStatusText }}
      </div>
    </section>

    <teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="custom-context-menu el-popper is-light"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <el-menu size="small" class="context-menu-list">
          <el-menu-item @click="handleEditRemark">
            <el-icon><Edit /></el-icon>
            <span>修改备注</span>
          </el-menu-item>
          <el-menu-item @click="handleDeleteAccount" class="danger-item">
            <el-icon><Delete /></el-icon>
            <span>删除账号</span>
          </el-menu-item>
          <el-menu-item @click="handleCopyPhone">
            <el-icon><DocumentCopy /></el-icon>
            <span>复制手机号</span>
          </el-menu-item>
          <div class="el-menu-item-divider"></div>
          <el-menu-item @click="handleImportAccounts">
            <el-icon><Upload /></el-icon>
            <span>导入账号</span>
          </el-menu-item>
          <el-menu-item @click="handleCreateGroup">
            <el-icon><FolderAdd /></el-icon>
            <span>创建分组</span>
          </el-menu-item>
          <el-sub-menu index="move">
            <template #title>
              <el-icon><Sort /></el-icon>
              <span>移动分组</span>
            </template>
            <el-menu-item
              v-for="group in accountsStore.groups"
              :key="group.id"
              @click="handleMoveToGroup(group.id)"
            >
              {{ group.name }}
            </el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>
    </teleport>

    <el-dialog v-model="moveGroupDialogVisible" title="移动到分组" width="400px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="目标分组">
          <el-select v-model="targetGroupId" style="width: 100%" placeholder="请选择目标分组">
            <el-option
              v-for="group in accountsStore.groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="moveGroupDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMoveSelectedToGroup">移动</el-button>
        </span>
      </template>
    </el-dialog>
  </aside>
</template>

<style scoped>
.account-sidebar {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
}

.panel-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-header span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-header :deep(.el-icon) {
  color: var(--app-accent);
}

.account-panel {
  flex: 1;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.account-toolbar {
  display: grid;
  grid-template-columns: 28px 110px 40px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.toolbar-icon {
  color: var(--app-text);
  font-size: 20px;
}

.account-table {
  flex: 1;
}

.account-actions {
  min-height: 44px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-muted);
}

.wanda-login-form :deep(.el-input-group__append) {
  padding: 0;
}

.account-table :deep(.is-current-row) > td.el-table__cell {
  background-color: var(--app-accent-soft) !important;
}

.custom-context-menu {
  position: fixed;
  z-index: 9999;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
  background: white;
  min-width: 160px;
  padding: 4px 0;
}
.context-menu-list {
  border-right: none;
}
.context-menu-list .el-menu-item {
  height: 36px;
  line-height: 36px;
}
.context-menu-list :deep(.el-sub-menu__title) {
  height: 36px;
  line-height: 36px;
}
.danger-item {
  color: #f56c6c !important;
}
.danger-item .el-icon {
  color: #f56c6c !important;
}
.el-menu-item-divider {
  height: 1px;
  background-color: #ebeef5;
  margin: 4px 0;
}

.wanda-login-panel {
  padding-bottom: 12px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.login-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
}

.full-button {
  width: 100%;
}

.login-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: var(--app-muted);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c7d0dd;
}

.current-account-info {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid #d9ecff;
  border-radius: 4px;
  background-color: #ecf5ff;
  color: #409eff;
  font-size: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  height: 20px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 3px;
  background-color: #e4e7ed;
  color: #909399;
  line-height: 1;
}
.status-badge--active {
  background-color: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}
</style>
