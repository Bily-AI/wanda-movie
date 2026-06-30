import { defineStore } from 'pinia'

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
    userIdentifier: account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER,
    accountAgeDays: calculateAccountAgeDays(account)
  }
}

function normalizeAccountStatus(status: string): WandaAccount['status'] {
  return status === 'normal' || status === 'expired' || status === 'error' || status === 'unknown' ? status : 'unknown'
}

function toPlainGroup(group: AccountGroup): AccountGroup {
  return {
    id: String(group.id || ''),
    name: String(group.name || '')
  }
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function calculateAccountAgeDays(account: Pick<WandaAccount, 'createdAt' | 'loginDate'>): number {
  const rawDate = account.createdAt || account.loginDate
  const createdTime = rawDate ? new Date(rawDate).getTime() : NaN

  if (!Number.isFinite(createdTime)) {
    return 0
  }

  const diffDays = Math.floor((Date.now() - createdTime) / 86400000)
  return Math.max(0, diffDays)
}

function toPlainAccount(account: WandaAccount): WandaAccount {
  return {
    id: String(account.id || ''),
    phone: String(account.phone || ''),
    remark: String(account.remark || ''),
    status: normalizeAccountStatus(String(account.status || 'unknown')),
    statusText: String(account.statusText || ''),
    groupId: String(account.groupId || 'default'),
    ck: String(account.ck || ''),
    userIdentifier: String(account.userIdentifier || DEFAULT_WANDA_USER_IDENTIFIER),
    loginDate: String(account.loginDate || ''),
    loginTime: String(account.loginTime || ''),
    createdAt: String(account.createdAt || ''),
    isPayMember: Boolean(account.isPayMember),
    accountAgeDays: calculateAccountAgeDays(account),
    pointsBalance: toNullableNumber(account.pointsBalance),
    wplusExpireAt: String(account.wplusExpireAt || ''),
    storedCardCount: toNullableNumber(account.storedCardCount),
    couponCount: toNullableNumber(account.couponCount),
    memberGradeName: String(account.memberGradeName || ''),
    growthValue: toNullableNumber(account.growthValue)
  }
}

interface ImportedAccountSource {
  phone: string
  ck: string
  remark: string
  loginDate: string
  loginTime: string
  userIdentifier: string
}

function readText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function firstText(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = readText(record[key])

    if (value) {
      return value
    }
  }

  return ''
}

function normalizeImportedAccount(source: Partial<ImportedAccountSource>, groupId: string): WandaAccount | null {
  const phone = readText(source.phone).match(/1\d{10}/)?.[0] ?? ''

  if (!phone) {
    return null
  }

  const ck = readText(source.ck)
  const remark = readText(source.remark) || (ck ? '导入账号' : '待登录')
  const now = new Date()
  const loginDate = readText(source.loginDate) || now.toISOString().slice(0, 10)
  const loginTime = readText(source.loginTime) || now.toLocaleTimeString('zh-CN', { hour12: false })

  return {
    id: phone,
    phone,
    remark,
    status: ck ? 'normal' : 'unknown',
    statusText: ck ? '正常' : '待登录',
    groupId,
    ck,
    userIdentifier: readText(source.userIdentifier) || DEFAULT_WANDA_USER_IDENTIFIER,
    loginDate,
    loginTime,
    createdAt: now.toISOString(),
    isPayMember: false,
    accountAgeDays: 0,
    pointsBalance: null,
    wplusExpireAt: '',
    storedCardCount: null,
    couponCount: null,
    memberGradeName: '',
    growthValue: null
  }
}

function buildImportedAccountFromRecord(value: unknown, groupId: string): WandaAccount | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>

  return normalizeImportedAccount(
    {
      phone: firstText(record, 'phone', 'mobile', 'mobilePhone', '手机号'),
      ck: firstText(record, 'ck', 'CK', 'token', 'userToken'),
      remark: firstText(record, 'remark', '备注', 'name'),
      loginDate: firstText(record, 'loginDate', '登录日期'),
      loginTime: firstText(record, 'loginTime', '登录时间'),
      userIdentifier: firstText(record, 'userIdentifier', 'user', 'USER', '用户标识')
    },
    groupId
  )
}

function buildImportedAccount(line: string, groupId: string): WandaAccount | null {
  const phone = line.match(/1\d{10}/)?.[0] ?? ''

  if (!phone) {
    return null
  }

  const legacyParts = line
    .split('---')
    .map((part) => part.trim())
    .filter(Boolean)

  if (legacyParts.length >= 2) {
    const phoneIndex = legacyParts.findIndex((part) => /1\d{10}/.test(part))

    if (phoneIndex === 0) {
      return normalizeImportedAccount(
        {
          phone,
          ck: legacyParts[1],
          loginTime: legacyParts[2]
        },
        groupId
      )
    }

    if (phoneIndex >= 2) {
      return normalizeImportedAccount(
        {
          phone,
          remark: legacyParts[phoneIndex - 2],
          ck: legacyParts[phoneIndex - 1],
          loginTime: legacyParts[phoneIndex + 1]
        },
        groupId
      )
    }
  }

  const ckMatch = line.match(/(?:CK|ck)[:：]?\s*([^\s,，|]+)/)
  const userMatch = line.match(/(?:USER|user|userIdentifier|用户标识)[:：]?\s*([A-Za-z0-9_-]+)/)
  const parts = line
    .split(/[\s,，|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const ck = ckMatch?.[1] ?? parts.find((part) => part !== phone && part.length >= 20) ?? ''

  return normalizeImportedAccount(
    {
      phone,
      ck,
      userIdentifier: userMatch?.[1]
    },
    groupId
  )
}

function parseImportedAccounts(text: string, groupId: string): WandaAccount[] {
  const trimmed = text.trim()

  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const records = Array.isArray(parsed) ? parsed : [parsed]

      return records
        .map((record) => buildImportedAccountFromRecord(record, groupId))
        .filter((account): account is WandaAccount => Boolean(account))
    } catch {
      return []
    }
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => buildImportedAccount(line, groupId))
    .filter((account): account is WandaAccount => Boolean(account))
}

function toPlainAccountsData(data: AccountsLocalData): AccountsLocalData {
  return structuredClone({
    groups: data.groups.map(toPlainGroup),
    accounts: data.accounts.map(toPlainAccount),
    currentAccountId: String(data.currentAccountId || '')
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
      message: '',
      countdown: 0
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
    setCurrentAccount(id: string) {
      this.currentAccountId = id
    },
    async updateAccountRemark(id: string, remark: string) {
      const index = this.accounts.findIndex((acc) => acc.id === id)
      if (index !== -1) {
        this.accounts[index] = { ...this.accounts[index], remark }
        await this.saveAccounts()
        this.loginForm.message = '备注已更新'
      }
    },
    async deleteAccount(id: string) {
      const index = this.accounts.findIndex((acc) => acc.id === id)
      if (index !== -1) {
        this.accounts.splice(index, 1)
        if (this.currentAccountId === id) {
          this.currentAccountId = ''
        }
        this.selectedAccountIds = this.selectedAccountIds.filter(selId => selId !== id)
        await this.saveAccounts()
        this.loginForm.message = '账号已删除'
      }
    },
    async createGroup(name: string) {
      const id = 'group_' + Date.now()
      this.groups.push({ id, name })
      await this.saveAccounts()
      this.loginForm.message = '分组创建成功'
      return id
    },
    async moveAccountToGroup(accountId: string, groupId: string) {
      const index = this.accounts.findIndex((acc) => acc.id === accountId)
      if (index !== -1) {
        this.accounts[index] = { ...this.accounts[index], groupId }
        await this.saveAccounts()
        this.loginForm.message = '账号分组已更新'
      }
    },
    async updateAccountProfileSummary(
      accountId: string,
      summary: Partial<Pick<WandaAccount, 'pointsBalance' | 'wplusExpireAt' | 'storedCardCount' | 'couponCount' | 'memberGradeName' | 'growthValue' | 'isPayMember'>>
    ) {
      const index = this.accounts.findIndex((acc) => acc.id === accountId)

      if (index === -1) {
        return
      }

      this.accounts[index] = {
        ...this.accounts[index],
        ...summary,
        accountAgeDays: calculateAccountAgeDays(this.accounts[index])
      }
      await this.saveAccounts()
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
      const importedAccounts = parseImportedAccounts(text, groupId)

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
    startCountdown() {
      this.loginForm.countdown = 60
      const timer = setInterval(() => {
        if (this.loginForm.countdown > 0) {
          this.loginForm.countdown--
        } else {
          clearInterval(timer)
        }
      }, 1000)
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
        this.startCountdown()
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

      if (!phone) {
        this.loginForm.message = '请输入手机号'
        return
      }
      if (!code) {
        this.loginForm.message = '请输入验证码'
        return
      }
      if (!this.loginForm.requestId) {
        this.loginForm.message = '请先获取验证码'
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
        const pointsBalance = toNullableNumber(
          result.pointsBalance ?? result.point ?? result.points ?? result.integral ?? result.score
        )
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
          isPayMember: Boolean(result.isPayMember),
          accountAgeDays: 0,
          pointsBalance,
          wplusExpireAt: '',
          storedCardCount: null,
          couponCount: null,
          memberGradeName: '',
          growthValue: null
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
        this.loginForm.countdown = 0
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

      const pointsBalance = toNullableNumber(
        status.userInfo?.pointsBalance ??
          status.userInfo?.point ??
          status.userInfo?.points ??
          status.userInfo?.integral ??
          status.userInfo?.score
      )

      if (pointsBalance !== null) {
        account.pointsBalance = pointsBalance
      }

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
