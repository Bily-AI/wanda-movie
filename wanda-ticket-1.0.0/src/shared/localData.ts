export const LOCAL_DATA_FILES = {
  ACCOUNTS: 'accounts',
  SETTINGS: 'settings',
  REQUEST_PARAMS: 'requestParams',
  PROXY: 'proxy',
  LOGS: 'logs',
  CITY: 'city'
} as const

export type LocalDataFileName = (typeof LOCAL_DATA_FILES)[keyof typeof LOCAL_DATA_FILES]

export type AccountStatus = 'normal' | 'expired' | 'error' | 'unknown'

export interface WandaAccount {
  id: string
  phone: string
  remark: string
  status: AccountStatus
  statusText: string
  groupId: string
  ck: string
  userIdentifier: string
  loginDate: string
  loginTime: string
  createdAt: string
  isPayMember: boolean
}

export interface AccountGroup {
  id: string
  name: string
}

export interface AccountsLocalData {
  groups: AccountGroup[]
  accounts: WandaAccount[]
  currentAccountId: string
}

export interface SettingsLocalData {
  rememberWindow: boolean
  autoClosePaymentWindow: boolean
  paymentCardDisplay: '列表' | '卡片'
  ticketCodeTemplate: '默认' | '万达风格'
  autoPayment: {
    enabled: boolean
    phone: string
    password: string
  }
}

export interface RequestParamsLocalData {
  deviceFingerprint: string
  userId: string
  model: string
  ios: string
  screen: string
  width: string
  height: string
  build: string
  shumeiBoxId: string
  languageType: string
}

export interface ProxyLocalData {
  proxyApiUrl: string
  useProxy: boolean
}

export interface LogRecord {
  id: string
  time: string
  type: string
  account: string
  detail: string
}

export interface LogsLocalData {
  records: LogRecord[]
}

export interface CityLocalData {
  cities: unknown[]
  cinemas: unknown[]
  updatedAt: string
  city: unknown[]
}

export interface LocalDataMap {
  accounts: AccountsLocalData
  settings: SettingsLocalData
  requestParams: RequestParamsLocalData
  proxy: ProxyLocalData
  logs: LogsLocalData
  city: CityLocalData
}

export const DEFAULT_LOCAL_DATA: LocalDataMap = {
  accounts: {
    groups: [{ id: 'default', name: '默认分组' }],
    accounts: [],
    currentAccountId: ''
  },
  settings: {
    rememberWindow: true,
    autoClosePaymentWindow: true,
    paymentCardDisplay: '列表',
    ticketCodeTemplate: '默认',
    autoPayment: {
      enabled: false,
      phone: '',
      password: ''
    }
  },
  requestParams: {
    deviceFingerprint: '',
    userId: '',
    model: '',
    ios: '',
    screen: '',
    width: '',
    height: '',
    build: '',
    shumeiBoxId: '',
    languageType: ''
  },
  proxy: {
    proxyApiUrl: '',
    useProxy: false
  },
  logs: {
    records: []
  },
  city: {
    cities: [],
    cinemas: [],
    updatedAt: '',
    city: []
  }
}

export const LOCAL_DATA_FILE_NAMES = Object.values(LOCAL_DATA_FILES)

export function isLocalDataFileName(value: unknown): value is LocalDataFileName {
  return typeof value === 'string' && LOCAL_DATA_FILE_NAMES.includes(value as LocalDataFileName)
}

export function cloneDefaultLocalData<T extends LocalDataFileName>(name: T): LocalDataMap[T] {
  return structuredClone(DEFAULT_LOCAL_DATA[name])
}
