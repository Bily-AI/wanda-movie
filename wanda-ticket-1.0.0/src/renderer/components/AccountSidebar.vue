<script setup lang="ts">
import { Lock, Refresh, Search, UserFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useAccountsStore } from '@renderer/stores/accounts'
import type { WandaAccount } from '@shared/localData'

const accountsStore = useAccountsStore()

function handleAccountSelectionChange(rows: WandaAccount[]): void {
  accountsStore.setSelectedAccountIds(rows.map((row) => row.id))
}

async function handleMoveSelectedToGroup(): Promise<void> {
  const movedCount = await accountsStore.moveSelectedToGroup(accountsStore.selectedGroupId)

  if (movedCount > 0) {
    ElMessage.success(accountsStore.loginForm.message)
  } else {
    ElMessage.warning(accountsStore.loginForm.message)
  }
}

async function handleImportAccounts(): Promise<void> {
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

      <el-table
        class="account-table"
        :data="accountsStore.filteredAccounts"
        height="100%"
        row-key="id"
        empty-text="暂无数据"
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
        <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="accountsStore.cancelSelection">
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
            :disabled="accountsStore.loginForm.sending || accountsStore.loginForm.loggingIn || !accountsStore.loginForm.phone"
            @click="accountsStore.sendLoginCode"
          >
            获取验证码
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
            !accountsStore.loginForm.code ||
            !accountsStore.loginForm.requestId
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
</style>
