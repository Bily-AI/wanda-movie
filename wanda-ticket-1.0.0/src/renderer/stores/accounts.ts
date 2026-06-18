import { defineStore } from 'pinia'

import { DEFAULT_LOCAL_DATA, type AccountGroup, type WandaAccount } from '@shared/localData'

function getWandaApp() {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.wandaApp
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
      code: ''
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
    },
    cancelSelection() {
      this.selectedAccountIds = []
    }
  }
})
