import { defineStore } from 'pinia'
import { toRaw } from 'vue'

import { sendVerifyCode, loginWithCode, checkLoginStatus } from '@renderer/services/wandaAuthApi'
import { DEFAULT_LOCAL_DATA, type AccountGroup, type AccountsLocalData, type WandaAccount } from '@shared/localData'
import { useLogsStore } from './logs'

const DEFAULT_WANDA_USER_IDENTIFIER = 'YYDDJDKYHA'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function normalizeAccount(account: WandaAccount): WandaAccount {
  return {
    ...account,
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER
  }
}

function buildImportedAccount(line: string, groupId: string): WandaAccount | null {
  const phone = line.match(/1\d{10}/)?.[0] ?? ''

  if (!phone) {
    return null
  }

  const ckMatch = line.match(/(?:CK|ck)[:：]?\s*([A-Za-z0-9+/=_-]+)/)
  const userMatch = line.match(/(?:USER|user|userIdentifier|用户标识)[:：]?\s*([A-Za-z0-9_-]+)/)
  const parts = line
    .split(/[\s,，|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const ck = ckMatch?.[1] ?? parts.find((part) => part !== phone && part.length >= 20) ?? ''
  const now = new Date()

  return {
    id: phone,
    phone,
    remark: ck ? '导入账号' : '待登录',
    status: ck ? 'normal' : 'unknown',
    statusText: ck ? '正常' : '待登录',
    groupId,
    ck,
    userIdentifier: userMatch?.[1] ?? DEFAULT_WANDA_USER_IDENTIFIER,
    loginDate: now.toISOString().slice(0, 10),
    loginTime: now.toLocaleTimeString('zh-CN', { hour12: false }),
    createdAt: now.toISOString(),
    isPayMember: false
  }
}

function toPlainAccountsData(data: AccountsLocalData): AccountsLocalData {
  return structuredClone({
    groups: data.groups.map((group) => ({ ...toRaw(group) })),
    accounts: data.accounts.map((account) => ({ ...toRaw(account) })),
    currentAccountId: data.currentAccountId
  })
}

export const useAccountsStore = defineStore('accounts', {
  state: () => ({
    groups: structuredClone(DEFAULT_LOCAL_DATA.accounts.groups) as AccountGroup[],
    accounts: [] as WandaAccount[],
    currentAccountId: '',
    selectedAccountIds: [] as string[],
    selectedGroupId: 'default',
    searchKeyword: '',
    loginForm: {
      phone: '',
      code: '',
      requestId: '',
      requestPhone: '',
      sending: false,
      loggingIn: false,
      message: ''
    }
  }),
  getters: {
    currentAccount(state) {
      return state.accounts.find((account) => account.id === state.currentAccountId) ?? null
    },
    filteredAccounts(state) {
      const keyword = state.searchKeyword.trim()
      const selectedGroupId = state.selectedGroupId.trim()
      const groupAccounts = selectedGroupId
        ? state.accounts.filter((account) => account.groupId === selectedGroupId)
        : state.accounts

      if (!keyword) {
        return groupAccounts
      }

      return groupAccounts.filter(
        (account) => account.phone.includes(keyword) || account.remark.includes(keyword)
      )
    },
    selectedCount(state) {
      return state.selectedAccountIds.length
    },
    loginStatusText(state) {
      const message = state.loginForm.message.trim()

      if (message) {
        return message
      }

      const account = state.accounts.find((item) => item.id === state.currentAccountId)

      if (account) {
        return `${account.phone} | ${account.statusText}`
      }

      return '未登录'
    }
  },
  actions: {
    async loadAccounts() {
      const result = await getWandaApp()?.readLocalData('accounts')

      if (!result?.ok) {
        return
      }

      this.groups = result.data.groups
      this.accounts = result.data.accounts.map(normalizeAccount)
      this.currentAccountId = result.data.currentAccountId
    },
    async saveAccounts() {
      const result = await getWandaApp()?.writeLocalData('accounts', toPlainAccountsData({
        groups: this.groups,
        accounts: this.accounts,
        currentAccountId: this.currentAccountId
      }))

      if (!result) {
        throw new Error('本地存储不可用，账号未保存')
      }

      if (!result.ok) {
        throw new Error(result.error || '账号保存失败')
      }
    },
    setSelectedAccountIds(ids: string[]) {
      this.selectedAccountIds = ids

      if (ids.length === 1) {
        this.currentAccountId = ids[0]
      }
    },
    cancelSelection() {
      this.selectedAccountIds = []
    },
    async moveSelectedToGroup(groupId: string) {
      if (this.selectedAccountIds.length === 0) {
        this.loginForm.message = '请先选择要移动的账号'
        return 0
      }

      const group = this.groups.find((item) => item.id === groupId)

      if (!group) {
        this.loginForm.message = '请选择目标分组'
        return 0
      }

      const selectedIds = new Set(this.selectedAccountIds)
      let movedCount = 0

      this.accounts = this.accounts.map((account) => {
        if (!selectedIds.has(account.id)) {
          return account
        }

        movedCount += 1
        return { ...account, groupId }
      })

      await this.saveAccounts()
      this.selectedAccountIds = []
      this.loginForm.message = `已移动 ${movedCount} 个账号到 ${group.name}`
      useLogsStore().addLog('账号分组', '', this.loginForm.message)
      return movedCount
    },
    async importAccountsFromText(text: string) {
      const groupId = this.selectedGroupId || 'default'
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
      const importedAccounts = lines
        .map((line) => buildImportedAccount(line, groupId))
        .filter((account): account is WandaAccount => Boolean(account))

      if (importedAccounts.length === 0) {
        this.loginForm.message = '未识别到可导入的手机号'
        return 0
      }

      for (const account of importedAccounts) {
        const index = this.accounts.findIndex((item) => item.id === account.id || item.phone === account.phone)

        if (index >= 0) {
          this.accounts[index] = { ...this.accounts[index], ...account }
        } else {
          this.accounts.unshift(account)
        }
      }

      this.currentAccountId = importedAccounts[0].id
      this.selectedAccountIds = [importedAccounts[0].id]
      await this.saveAccounts()
      this.loginForm.message = `已导入 ${importedAccounts.length} 个账号`
      useLogsStore().addLog('账号导入', importedAccounts[0].phone, this.loginForm.message)
      return importedAccounts.length
    },
    async sendLoginCode() {
      const phone = this.loginForm.phone.trim()

      if (!phone) {
        this.loginForm.message = '请输入手机号'
        return
      }

      this.loginForm.requestId = ''
      this.loginForm.requestPhone = ''
      this.loginForm.code = ''
      this.loginForm.sending = true
      this.loginForm.message = '正在发送验证码'

      try {
        const result = await sendVerifyCode(phone)
        this.loginForm.requestId = result.requestID
        this.loginForm.requestPhone = phone
        this.loginForm.message = '验证码已发送'
        useLogsStore().addLog('万达登录', phone, '验证码发送成功')
      } catch (error) {
        const message = getErrorMessage(error, '验证码发送失败')
        this.loginForm.requestId = ''
        this.loginForm.requestPhone = ''
        this.loginForm.message = message
        useLogsStore().addLog('万达登录', phone, `验证码发送失败：${message}`)
      } finally {
        this.loginForm.sending = false
      }
    },
    async loginWandaAccount() {
      const phone = this.loginForm.phone.trim()
      const code = this.loginForm.code.trim()

      if (!phone || !code || !this.loginForm.requestId) {
        this.loginForm.message = '请输入手机号、验证码并先获取验证码'
        return
      }

      if (this.loginForm.requestPhone !== phone) {
        this.loginForm.message = '手机号已变化，请重新获取验证码'
        return
      }

      this.loginForm.loggingIn = true
      this.loginForm.message = '正在登录'

      try {
        const result = await loginWithCode(phone, code, this.loginForm.requestId)

        const now = new Date()
        const account: WandaAccount = {
          id: phone,
          phone: result.mobile || phone,
          remark: '登录成功',
          status: 'normal',
          statusText: '正常',
          groupId: this.selectedGroupId,
          ck: result.userToken,
          userIdentifier: result.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER,
          loginDate: now.toISOString().slice(0, 10),
          loginTime: now.toLocaleTimeString('zh-CN', { hour12: false }),
          createdAt: now.toISOString(),
          isPayMember: Boolean(result.isPayMember)
        }
        const index = this.accounts.findIndex((item) => item.id === account.id || item.phone === phone)

        if (index >= 0) {
          this.accounts[index] = { ...this.accounts[index], ...account }
        } else {
          this.accounts.unshift(account)
        }

        this.currentAccountId = account.id
        this.selectedAccountIds = [account.id]
        this.loginForm.code = ''
        this.loginForm.requestId = ''
        this.loginForm.requestPhone = ''
        await this.saveAccounts()
        this.loginForm.message = '登录成功，账号已保存'
        useLogsStore().addLog('万达登录', phone, '登录成功，账号已保存')
      } catch (error) {
        const message = getErrorMessage(error, '万达账号登录失败')
        this.loginForm.message = message
        useLogsStore().addLog('万达登录', phone, `登录失败：${message}`)
      } finally {
        this.loginForm.loggingIn = false
      }
    },
    async checkCurrentLoginStatus() {
      const account = this.currentAccount

      if (!account?.ck) {
        this.loginForm.message = '请选择已登录万达账号'
        return
      }

      let status: Awaited<ReturnType<typeof checkLoginStatus>>

      try {
        status = await checkLoginStatus(account.ck, account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER)
      } catch (error) {
        const message = getErrorMessage(error, '万达账号登录已失效')
        account.status = 'expired'
        account.statusText = '失效'
        this.loginForm.message = message

        try {
          await this.saveAccounts()
        } catch (saveError) {
          const saveMessage = getErrorMessage(saveError, '账号状态保存失败')
          this.loginForm.message = `${message}；${saveMessage}`
        }

        useLogsStore().addLog('万达登录', account.phone, `账号状态失效：${message}`)
        return
      }

      account.status = 'normal'
      account.statusText = '正常'
      account.isPayMember = Boolean(status.userInfo?.isPayMember)

      if (status.userInfo?.mobile) {
        account.phone = status.userInfo.mobile
      }

      if (status.userInfo?.userIdentifier) {
        account.userIdentifier = status.userInfo.userIdentifier
      }

      try {
        await this.saveAccounts()
      } catch (error) {
        const message = getErrorMessage(error, '账号状态正常，但保存失败')
        this.loginForm.message = message
        useLogsStore().addLog('万达登录', account.phone, `账号状态保存失败：${message}`)
        return
      }

      this.loginForm.message = '当前账号状态正常'
      useLogsStore().addLog('万达登录', account.phone, '账号状态正常')
    }
  }
})
