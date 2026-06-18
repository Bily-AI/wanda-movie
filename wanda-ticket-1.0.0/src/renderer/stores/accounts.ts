import { defineStore } from 'pinia'

import { sendVerifyCode, loginWithCode, checkLoginStatus } from '@renderer/services/wandaAuthApi'
import { DEFAULT_LOCAL_DATA, type AccountGroup, type WandaAccount } from '@shared/localData'
import { useLogsStore } from './logs'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
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

      if (!keyword) {
        return state.accounts
      }

      return state.accounts.filter(
        (account) => account.phone.includes(keyword) || account.remark.includes(keyword)
      )
    },
    selectedCount(state) {
      return state.selectedAccountIds.length
    },
    loginStatusText(state) {
      const account = state.accounts.find((item) => item.id === state.currentAccountId)

      if (account) {
        return `${account.phone} | ${account.statusText}`
      }

      return state.loginForm.message || '未登录'
    }
  },
  actions: {
    async loadAccounts() {
      const result = await getWandaApp()?.readLocalData('accounts')

      if (!result?.ok) {
        return
      }

      this.groups = result.data.groups
      this.accounts = result.data.accounts
      this.currentAccountId = result.data.currentAccountId
    },
    async saveAccounts() {
      await getWandaApp()?.writeLocalData('accounts', {
        groups: this.groups,
        accounts: this.accounts,
        currentAccountId: this.currentAccountId
      })
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
    async sendLoginCode() {
      const phone = this.loginForm.phone.trim()

      if (!phone) {
        this.loginForm.message = '请输入手机号'
        return
      }

      this.loginForm.sending = true
      this.loginForm.message = '正在发送验证码'

      try {
        const result = await sendVerifyCode(phone)
        this.loginForm.requestId = result.requestID
        this.loginForm.message = '验证码已发送'
        useLogsStore().addLog('万达登录', phone, '验证码发送成功')
      } catch (error) {
        const message = getErrorMessage(error, '验证码发送失败')
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

      this.loginForm.loggingIn = true
      this.loginForm.message = '正在登录'

      try {
        const result = await loginWithCode(phone, code, this.loginForm.requestId)

        if (!result.userIdentifier) {
          throw new Error('万达账号用户标识缺失')
        }

        const now = new Date()
        const account: WandaAccount = {
          id: phone,
          phone: result.mobile || phone,
          remark: '登录成功',
          status: 'normal',
          statusText: '正常',
          groupId: this.selectedGroupId,
          ck: result.userToken,
          userIdentifier: result.userIdentifier,
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
        this.loginForm.message = '登录成功，账号已保存'
        await this.saveAccounts()
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

      if (!account?.ck || !account.userIdentifier) {
        return
      }

      try {
        const status = await checkLoginStatus(account.ck, account.userIdentifier)
        account.status = 'normal'
        account.statusText = '正常'
        account.isPayMember = Boolean(status.userInfo?.isPayMember)

        if (status.userInfo?.mobile) {
          account.phone = status.userInfo.mobile
        }

        if (status.userInfo?.userIdentifier) {
          account.userIdentifier = status.userInfo.userIdentifier
        }

        this.loginForm.message = '当前账号状态正常'
        await this.saveAccounts()
        useLogsStore().addLog('万达登录', account.phone, '账号状态正常')
      } catch (error) {
        const message = getErrorMessage(error, '万达账号登录已失效')
        account.status = 'expired'
        account.statusText = '失效'
        this.loginForm.message = message
        await this.saveAccounts()
        useLogsStore().addLog('万达登录', account.phone, `账号状态失效：${message}`)
      }
    }
  }
})
