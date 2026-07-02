import { WANDA_API_PATHS } from '@shared/wandaCore'
import { WANDA_HOSTS, sanitizeWandaErrorMessage, wandaGet, wandaPostForm, wandaSeatGet, wandaSignInPostJson } from './wandaRequest'

export interface StoredCardRow {
  holder: string
  name: string
  cardNo: string
  balance: number
  presentBalance: number
  available: boolean
  status: string
  statusDesc: string
  remainingCount: string
  categoryName: string
  discountRate: string
  effectDate: string
  coverName: string
  unavailableReason: string
  ownerPhone: string
  raw: unknown
}

export interface StoredCardBalanceInfo {
  balance: number
  presentBalance: number
  totalBalance: number
  raw: unknown
}

export interface StoredCardListResult {
  cards: StoredCardRow[]
  balanceInfo: StoredCardBalanceInfo | null
  raw: unknown
}

export interface StoredCardDenomination {
  label: string
  value: number
  bonus: number
  displayPrice: number
  displayBonus: number
}

export interface StoredCardOrderResult {
  orderId: string
  raw: unknown
}

export interface StoredCardPaymentResult {
  orderId: string
  appPayParam: string
  raw: unknown
}

export interface MemberCouponRow {
  couponId: string
  voucherNo: string
  couponNo: string
  name: string
  couponTypeName: string
  type: string
  status: string
  giftStatus: number
  validity: string
  validityDateShowMsg: string
  couponCategoryName: string
  endTime: number
  raw: unknown
}

export interface MemberEquityRow {
  gradeId: string
  equityId: string
  gradeName: string
  name: string
  desc: string
  amount: string
  count: string
  category: string
  status: string
  auto: boolean
  equityGainStatus: number
  equityType: number
  canGainMonth: boolean
  canReceive: boolean
  useEquityIconUrl: string
  getEquityIconUrl: string
  raw: unknown
}

export interface MemberGradeGroup {
  gradeId: string
  gradeName: string
  gradeDesc: string
  gradeNameColor: string
  growthValue: number
  growthMinVal: number
  growthMaxVal: number | null
  memberGrowthVal: number
  monthExpiredGrowth: number
  needGrowthValue: number
  guidingText: string
  isCurrent: boolean
  equities: MemberEquityRow[]
  highEquities: MemberEquityRow[]
  raw: unknown
}

export interface MemberWPlusProfile {
  isPayMember: boolean
  expireAt: string
  raw: unknown
}

export interface MemberWPlusRight {
  groupId: string
  name: string
  subtitle: string
  tag: string
  icon: string
  deadline: string
  receiveStatus: number
  verifyStatus: number
  orderCode: string
  code: string
  rightType: string
  redirect: Record<string, unknown> | null
  raw: unknown
}

export interface MemberWPlusRightGroup {
  groupId: string
  name: string
  iconUrl: string
  verifyStatus: number
  rightList: MemberWPlusRight[]
  raw: unknown
}

export interface MemberWPlusExchangeResult {
  bizCode: number
  bizMsg: string
  canOpen: boolean
  raw: unknown
}

export interface MemberSignInDay {
  sortOrder: string
  day: string
  date: string
  content: string
  iconUrl: string
  state: number
  todayFlag: boolean
  raw: unknown
}

export interface MemberSignInCalendar {
  consecutiveDays: number
  signInStreak: number
  dataList: MemberSignInDay[]
  raw: unknown
}

export interface MemberSignInSubmitResult {
  bizCode: number
  bizMsg: string
  successMessage: string
  raw: unknown
}

export interface ActivityGiftRow {
  id: string
  code: string
  name: string
  note: string
  price: number
  raw: unknown
}

export interface ActivityGiftOrderRow {
  orderId: string
  subject: string
  activityCode: string
  quantity: number
  totalPrice: number
  status: string
  createdAt: string
  raw: unknown
}

export interface ActivityGiftOrderListResult {
  records: ActivityGiftOrderRow[]
  total: number
  raw: unknown
}

export interface ActivityGiftOrderResult {
  orderId: string
  raw: unknown
}

export interface ActivityGiftPaymentResult {
  orderId: string
  payId: string
  transactionId: string
  appPayParam: string
  raw: unknown
}

interface ActivityGiftOrderDetailResult {
  orderId: string
  payId: string
  raw: unknown
}

interface ActivityGiftTransactionResult {
  transactionId: string
  raw: unknown
}

export const STORED_CARD_DENOMINATIONS: StoredCardDenomination[] = [
  { label: '300元', value: 30000, bonus: 20, displayPrice: 300, displayBonus: 20 },
  { label: '500元', value: 50000, bonus: 50, displayPrice: 500, displayBonus: 50 },
  { label: '800元', value: 80000, bonus: 80, displayPrice: 800, displayBonus: 80 },
  { label: '1000元', value: 100000, bonus: 120, displayPrice: 1000, displayBonus: 120 }
]

const STORED_CARD_CINEMA_ID = '5911'
const STORED_CARD_COVER_CODE = '13002428'
const STORED_CARD_ACTIVITY_CODE = 'CS202401080004'
const STORED_CARD_PAY_TYPE = '1057'
const STORED_CARD_RETURN_URL = 'wandafilm/pay/finished'
const ACTIVITY_GIFT_PAY_METHOD_ID = '1057'
const ACTIVITY_GIFT_TRANSACTION_POLL_LIMIT = 10
const ACTIVITY_GIFT_TRANSACTION_POLL_DELAY = 1500

function assertNotBlank(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value).trim()

    if (text) {
      return text
    }
  }

  return ''
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'y', 'yes'].includes(value.trim().toLowerCase())
  }

  return false
}

function centsToYuan(value: unknown): number {
  return Number((toNumber(value) / 100).toFixed(2))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function ensureSuccess(response: unknown, fallbackMessage: string): Record<string, unknown> {
  const record = asRecord(response)
  const data = asRecord(record.data)
  const code = toNumber(record.code, record.success === true ? 0 : -1)
  const bizCode = data.bizCode === undefined ? 0 : toNumber(data.bizCode, -1)

  if (code !== 0 || bizCode !== 0) {
    const message = sanitizeWandaErrorMessage(firstText(data.bizMsg, data.msg, record.msg, fallbackMessage))

    throw new Error(message || fallbackMessage)
  }

  return Object.keys(data).length > 0 ? data : record
}

function formatWandaDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function normalizeSignInSubmitResult(response: unknown): MemberSignInSubmitResult {
  const record = asRecord(response)
  const data = asRecord(record.data)
  const result = asRecord(data.data ?? data.res ?? data.result)

  return {
    bizCode: data.bizCode === undefined ? toNumber(record.code, -1) : toNumber(data.bizCode, -1),
    bizMsg: firstText(data.bizMsg, data.msg, record.msg),
    successMessage: firstText(result.successMessage, data.successMessage, data.bizMsg, data.msg, record.msg),
    raw: response
  }
}

function isAlreadySignedResult(result: MemberSignInSubmitResult): boolean {
  return result.bizCode === 1004 || result.bizMsg.includes('已签到') || result.bizMsg.includes('重复签到')
}

function ensureSignInSubmitSuccess(response: unknown, fallbackMessage: string): MemberSignInSubmitResult {
  const result = normalizeSignInSubmitResult(response)

  if (result.bizCode === 0 || isAlreadySignedResult(result)) {
    return result
  }

  ensureSuccess(response, fallbackMessage)

  return result
}

function collectList(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  const record = asRecord(value)
  const result: unknown[] = []

  for (const key of keys) {
    result.push(...asList(record[key]))
  }

  for (const key of ['data', 'res', 'result']) {
    if (record[key] !== value) {
      result.push(...collectList(record[key], keys))
    }
  }

  return result
}

function normalizeStoredCard(item: unknown): StoredCardRow {
  const record = asRecord(item)
  const statusDesc = firstText(record.statusDesc, record.statusName, record.status, '未知')

  return {
    holder: firstText(record.ownerPhone, record.mobilePhone, record.mobile, record.phone, record.holder),
    name: firstText(record.cardName, record.name, record.cardTypeName),
    cardNo: firstText(record.cardNo, record.card_no, record.no),
    balance: centsToYuan(record.balance ?? record.cardBalance ?? record.amount),
    presentBalance: centsToYuan(record.presentBalance ?? record.giftBalance ?? record.presentAmount),
    available: record.available === undefined ? true : toBoolean(record.available),
    status: statusDesc,
    statusDesc,
    remainingCount: firstText(record.remainingCount, record.remainCount, record.count),
    categoryName: firstText(record.categoryName, record.category, record.cardCategoryName),
    discountRate: firstText(record.discountRate, record.discount, record.rate),
    effectDate: firstText(record.effectDate, record.validityDate, record.expireTime, record.endDate),
    coverName: firstText(record.coverName, record.coverCode),
    unavailableReason: firstText(record.unavailableReason, record.reason),
    ownerPhone: firstText(record.ownerPhone, record.mobilePhone, record.mobile, record.phone),
    raw: item
  }
}

function normalizeStoredCardBalanceInfo(item: unknown): StoredCardBalanceInfo | null {
  if (!isRecord(item)) {
    return null
  }

  const balance = centsToYuan(item.balance)
  const presentBalance = centsToYuan(item.presentBalance)

  return {
    balance,
    presentBalance,
    totalBalance: balance,
    raw: item
  }
}

function extractStoredCardPayment(data: Record<string, unknown>, raw: unknown, orderId = ''): StoredCardPaymentResult {
  const result = asRecord(data.res)
  const payment = asRecord(result.payment ?? data.payment)
  const appPayParam = firstText(payment.appPayParam, result.appPayParam, data.appPayParam)

  if (!appPayParam) {
    throw new Error(firstText(data.bizMsg, data.msg, '储值卡支付参数获取成功但缺少 appPayParam'))
  }

  return {
    orderId: firstText(orderId, data.orderId, result.orderId),
    appPayParam,
    raw
  }
}

function normalizeCoupon(item: unknown): MemberCouponRow {
  const record = asRecord(item)

  return {
    couponId: firstText(record.couponId, record.voucherNo, record.voucher_number, record.code),
    voucherNo: firstText(record.voucherNo, record.voucher_number, record.code),
    couponNo: firstText(record.couponNo, record.no),
    name: firstText(record.couponTypeName, record.couponName, record.name),
    couponTypeName: firstText(record.couponTypeName, record.couponName, record.name),
    type: firstText(record.detailtypename, record.detailTypeName, record.typeName, record.typeCode),
    status: firstText(record.couponStatus, record.status, record.giftStatus),
    giftStatus: toNumber(record.giftStatus, 0),
    validity: firstText(record.validityDateShowMsg, record.validity, record.expireTime),
    validityDateShowMsg: firstText(record.validityDateShowMsg, record.validity, record.expireTime),
    couponCategoryName: firstText(record.couponCategoryName, record.typeName, record.detailTypeName, record.detailtypename),
    endTime: toNumber(record.endTime ?? record.expireTime),
    raw: item
  }
}

function normalizeEquity(item: unknown, group: Record<string, unknown> = {}): MemberEquityRow {
  const record = asRecord(item)
  const auto = toBoolean(record.auto)
  const getEquityIconUrl = firstText(record.getEquityIconUrl, record.receiveIconUrl)
  const equityGainStatus = toNumber(record.equityGainStatus)
  const equityType = toNumber(record.equityType)
  const explicitCanReceiveRaw = record.canReceive ?? record.can_receive ?? record.canGain ?? record.receivable ?? record.canGet
  const explicitCanReceive =
    explicitCanReceiveRaw === undefined || explicitCanReceiveRaw === null || explicitCanReceiveRaw === ''
      ? true
      : toBoolean(explicitCanReceiveRaw)
  const hasCanGainMonth = record.canGainMonth !== undefined && record.canGainMonth !== null && record.canGainMonth !== ''
  const canGainMonth = toBoolean(record.canGainMonth)

  const EQUITY_TYPES: Record<number, string> = {
    1: '票务券',
    2: '卖品券',
    3: '兑换券',
    4: '折扣券',
    5: '积分',
    6: '线下特权'
  }

  const STATUS_MAP: Record<number, string> = {
    1: '未解锁',
    2: '待领取',
    3: '已生效',
    4: '已抢光',
    5: '已领取',
    6: '未达条件'
  }

  const equityTypeStr = equityType ? EQUITY_TYPES[equityType] || String(equityType) : ''
  const statusStr = record.equityGainStatus != null ? STATUS_MAP[equityGainStatus] || String(equityGainStatus) : ''

  return {
    gradeId: firstText(record.gradeId, group.gradeId, group.id),
    equityId: firstText(record.equityId, record.id, record.rightCode, record.code),
    gradeName: firstText(group.gradeName, group.name, record.gradeName),
    name: firstText(record.equityName, record.name, record.title),
    desc: firstText(record.equityDesc, record.desc, record.content, record.subtitle),
    amount: firstText(record.prizeName, record.amount, record.faceValue, record.price, '-'),
    count: firstText(record.prizeNum != null ? String(record.prizeNum) : '', record.count, record.num, record.quantity, '-'),
    category: firstText(equityTypeStr, record.categoryName, record.typeName, record.type, '-'),
    status: firstText(statusStr, record.statusName, record.status, record.receiveStatus, '-'),
    auto,
    equityGainStatus,
    equityType,
    canGainMonth,
    canReceive: !auto && equityGainStatus === 2 && equityType !== 6 && explicitCanReceive && (!hasCanGainMonth || canGainMonth),
    useEquityIconUrl: firstText(record.useEquityIconUrl, record.useIconUrl),
    getEquityIconUrl,
    raw: item
  }
}

function normalizeGradeGroup(item: unknown): MemberGradeGroup {
  const record = asRecord(item)
  const equitiesRaw = collectList(record, ['equityList', 'rights', 'items', 'couponList', 'gradeEquityList'])
  const equities = equitiesRaw.map((eq) => normalizeEquity(eq, record))
  const highEquities = collectList(record, ['highEquityList']).map((eq) => normalizeEquity(eq, record))

  const growthValue = Number(record.growthValue ?? record.memberGrowthVal ?? record.currentGrowth) || 0
  const minVal = Number(record.growthMinVal ?? 0)
  const maxVal = record.growthMaxVal != null ? Number(record.growthMaxVal) : null
  const maxCompareValue = maxVal ?? Infinity

  const isCurrent = Boolean(
    record.isCurrent ?? record.current ?? record.isCurrentGrade ?? (growthValue >= minVal && growthValue <= maxCompareValue)
  )

  let needGrowthValue = Number(record.needGrowthValue ?? record.nextGrowthVal) || 0
  if (!needGrowthValue && isCurrent && maxVal !== null) {
    needGrowthValue = maxVal + 1 - growthValue
  }

  return {
    gradeId: firstText(record.gradeId, record.id, record.code),
    gradeName: firstText(record.gradeName, record.name, record.title),
    gradeDesc: firstText(record.gradeDesc, record.desc, record.description, record.guidingText),
    gradeNameColor: firstText(record.gradeNameColor, record.color),
    growthValue,
    growthMinVal: minVal,
    growthMaxVal: maxVal,
    memberGrowthVal: Number(record.memberGrowthVal ?? record.growthValue ?? record.currentGrowth) || 0,
    monthExpiredGrowth: Number(record.monthExpiredGrowth) || 0,
    needGrowthValue,
    guidingText: firstText(record.guidingText),
    isCurrent,
    equities,
    highEquities,
    raw: item
  }
}

function normalizeSignInDay(item: unknown): MemberSignInDay {
  const record = asRecord(item)
  const rawState = toNumber(
    record.state ?? record.status ?? record.signInState ?? record.signState ?? record.signinState,
    Number.NaN
  )
  const signedFlag = [
    record.signed,
    record.isSigned,
    record.isSignIn,
    record.isSign,
    record.hasSignIn,
    record.checked,
    record.isChecked,
    record.done,
    record.finished
  ].some(toBoolean)
  const statusText = firstText(record.signStatus, record.statusDesc, record.statusText)
  const state = Number.isFinite(rawState)
    ? rawState
    : signedFlag || statusText.includes('已签') || statusText.includes('已完成')
      ? 1
      : 0

  return {
    sortOrder: firstText(record.sortOrder, record.order, record.index, record.day, record.date),
    day: firstText(record.day, record.dayText, record.name),
    date: firstText(record.date, record.loginDate, record.signDate),
    content: firstText(record.content, record.prizeName, record.remark, record.name),
    iconUrl: firstText(record.iconUrl, record.url, record.src),
    state,
    todayFlag: toBoolean(record.todayFlag ?? record.isToday),
    raw: item
  }
}

function normalizeWPlusProfile(data: Record<string, unknown>, raw: unknown): MemberWPlusProfile {
  const result = asRecord(data.res)
  const member = asRecord(data.member ?? result.member)
  const expireAt = firstText(
    data.plusEndDate,
    data.expireAt,
    data.expireTime,
    data.endTime,
    data.deadline,
    data.payMemberStr,
    data.validityDateShowMsg,
    data.memberExpireTime,
    data.plusExpireTime,
    data.payMemberExpireTime,
    result.plusEndDate,
    result.expireAt,
    result.expireTime,
    result.endTime,
    result.deadline,
    result.payMemberStr,
    member.plusEndDate,
    member.expireAt,
    member.expireTime,
    member.endTime,
    member.payMemberStr
  )
  const hasExpireDate = /(\d{4})[./-年](\d{1,2})[./-月](\d{1,2})|\b\d{8}\b/.test(expireAt)

  return {
    isPayMember: toBoolean(data.isPayMember ?? result.isPayMember ?? member.isPayMember) || hasExpireDate,
    expireAt,
    raw
  }
}

function normalizeWPlusRight(item: unknown, group: Record<string, unknown> = {}): MemberWPlusRight {
  const record = asRecord(item)
  const redirect = isRecord(record.redirect) ? record.redirect : null

  return {
    groupId: firstText(group.groupId, group.id, record.groupId),
    name: firstText(record.name, record.title),
    subtitle: firstText(record.subtitle, record.content, record.desc, record.description),
    tag: firstText(record.tag, record.tagName),
    icon: firstText(record.icon, record.iconUrl, record.url),
    deadline: firstText(record.deadline, record.validityDateShowMsg, record.expireTime, record.endTime),
    receiveStatus: toNumber(record.receiveStatus),
    verifyStatus: toNumber(record.verifyStatus ?? group.verifyStatus),
    orderCode: firstText(record.orderCode, record.orderNo, record.orderId, record.order_code),
    code: firstText(record.code, record.rightCode, record.rightNo, record.rightId, record.equityCode),
    rightType: firstText(record.rightType, record.type, record.right_type),
    redirect,
    raw: item
  }
}

function normalizeWPlusRightGroup(item: unknown): MemberWPlusRightGroup {
  const record = asRecord(item)

  return {
    groupId: firstText(record.groupId, record.id, record.code),
    name: firstText(record.groupName, record.name, record.title),
    iconUrl: firstText(record.iconUrl, record.icon),
    verifyStatus: toNumber(record.verifyStatus),
    rightList: collectList(record, ['rightList', 'rights', 'items']).map((right) => normalizeWPlusRight(right, record)),
    raw: item
  }
}

function normalizeActivity(item: unknown): ActivityGiftRow {
  const record = asRecord(item)

  return {
    id: firstText(record.id, record.activityId, record.code, record.activityCode),
    code: firstText(record.activityCode, record.code, record.id),
    name: firstText(record.name, record.activityName, record.title),
    note: firstText(record.note, record.desc, record.description),
    price: centsToYuan(record.unitPrice ?? record.price ?? record.salePrice ?? record.amount),
    raw: item
  }
}

function normalizeGiftOrder(item: unknown): ActivityGiftOrderRow {
  const record = asRecord(item)
  const order = asRecord(record.order)
  const goods = asRecord(record.goods)
  const activity = asRecord(record.activity)
  const status = firstText(record.statusDesc, record.statusName, record.statusText, record.status)

  return {
    orderId: firstText(record.orderId, record.id, order.orderId, order.id),
    subject: firstText(record.subject, record.orderName, record.goodsName, goods.name, activity.name, '礼包订单'),
    activityCode: firstText(record.activityCode, record.sourceId, activity.activityCode, activity.id),
    quantity: toNumber(record.quantity ?? record.goodsNum ?? record.num, 1),
    totalPrice: centsToYuan(record.totalPrice ?? record.orderAmount ?? record.amount ?? record.payAmount),
    status: status || '未知',
    createdAt: firstText(record.createdAt, record.createTime, record.createdTime, record.orderTime),
    raw: item
  }
}

export async function fetchStoredCardsWithBalance(ck: string, userIdentifier: string): Promise<StoredCardListResult> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CARD,
    WANDA_API_PATHS.CARD_USER_CARD_LIST,
    { category: 1, json: true },
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '储值卡加载失败')
  const result = asRecord(data.res)
  const cards = collectList(data, ['cards', 'cardList', 'itemList', 'items', 'list', 'commendcards'])
    .map(normalizeStoredCard)
    .filter((card) => card.cardNo || card.name)

  return {
    cards,
    balanceInfo: normalizeStoredCardBalanceInfo(result.balanceInfo ?? data.balanceInfo),
    raw: response
  }
}

export async function fetchStoredCards(ck: string, userIdentifier: string): Promise<StoredCardRow[]> {
  return (await fetchStoredCardsWithBalance(ck, userIdentifier)).cards
}

export async function fetchOrderPayCards(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<StoredCardRow[]> {
  assertNotBlank(orderId, '订单号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CARD,
    WANDA_API_PATHS.CARD_PAY_LIST,
    { orderId },
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '订单支付卡加载失败')

  return collectList(data, ['cards', 'cardList', 'itemList', 'items', 'list'])
    .map(normalizeStoredCard)
    .filter((card) => (card.cardNo || card.name) && card.available)
}

export async function transferStoredCard(
  cardNo: string,
  targetMobile: string,
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(cardNo, '储值卡卡号不能为空')
  assertNotBlank(targetMobile, '接收手机号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.CARD_TRANSFER}?verify_code=&verify_context_id=&card_no=${encodeURIComponent(
    cardNo
  )}&gift_mark=&target_user_mobile=${encodeURIComponent(targetMobile)}&order_id=`
  const response = await wandaGet<unknown>(WANDA_HOSTS.CARD, path, {}, ck, userIdentifier)

  ensureSuccess(response, '储值卡赠送失败')
}

export async function createStoredCardOrder(
  salePrice: number,
  ck: string,
  userIdentifier: string
): Promise<StoredCardOrderResult> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    throw new Error('储值卡面值无效')
  }

  const path = `${WANDA_API_PATHS.ORDER_CREATE}?cinemaId=${STORED_CARD_CINEMA_ID}&coverCode=${STORED_CARD_COVER_CODE}&salePrice=${salePrice}&postponeCode=&activityCode=${STORED_CARD_ACTIVITY_CODE}&isGift=2&source=1&json=true`
  const response = await wandaGet<unknown>(WANDA_HOSTS.CARD, path, {}, ck, userIdentifier)
  const data = ensureSuccess(response, '储值卡订单创建失败')
  const result = asRecord(data.res)
  const order = asRecord(result.order ?? data.order)
  const orderId = firstText(data.orderId, data.id, result.orderId, result.id, order.orderId, order.id)

  if (!orderId) {
    throw new Error(firstText(data.bizMsg, data.msg, '储值卡订单创建成功但缺少订单号'))
  }

  return {
    orderId,
    raw: response
  }
}

export async function prepayStoredCardOrder(
  orderId: string,
  ck: string,
  userIdentifier: string
): Promise<StoredCardPaymentResult> {
  assertNotBlank(orderId, '储值卡订单号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.ORDER_PREPAY}?orderId=${encodeURIComponent(
    orderId
  )}&payType=${STORED_CARD_PAY_TYPE}&returnUrl=${encodeURIComponent(STORED_CARD_RETURN_URL)}`
  const response = await wandaGet<unknown>(WANDA_HOSTS.CARD, path, {}, ck, userIdentifier)
  const data = ensureSuccess(response, '储值卡预支付失败')

  return extractStoredCardPayment(data, response, orderId)
}

export async function rechargeStoredCard(
  amount: number,
  cardNo: string,
  ck: string,
  userIdentifier: string
): Promise<StoredCardPaymentResult> {
  assertNotBlank(cardNo, '储值卡卡号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('储值卡充值面值无效')
  }

  const path = `${WANDA_API_PATHS.CARD_RECHARGE}?amount=${amount}&card_no=${encodeURIComponent(
    cardNo
  )}&return_url=${encodeURIComponent(STORED_CARD_RETURN_URL)}&pay_type=${STORED_CARD_PAY_TYPE}&activityCode=${STORED_CARD_ACTIVITY_CODE}`
  const response = await wandaGet<unknown>(WANDA_HOSTS.CARD, path, {}, ck, userIdentifier)
  const data = ensureSuccess(response, '储值卡充值失败')

  return extractStoredCardPayment(data, response)
}

export async function createStoredCardPurchasePayment(
  salePrice: number,
  ck: string,
  userIdentifier: string
): Promise<StoredCardPaymentResult> {
  const order = await createStoredCardOrder(salePrice, ck, userIdentifier)

  return prepayStoredCardOrder(order.orderId, ck, userIdentifier)
}

export async function createStoredCardRechargePayment(
  amount: number,
  cardNo: string,
  ck: string,
  userIdentifier: string
): Promise<StoredCardPaymentResult> {
  return rechargeStoredCard(amount, cardNo, ck, userIdentifier)
}

export async function fetchMemberCoupons(ck: string, userIdentifier: string): Promise<MemberCouponRow[]> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.COUPON,
    WANDA_API_PATHS.COUPON_MEMBER_GROUP_LIST,
    { couponStatus: '', expireStatus: 'N', json: true },
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '兑换券加载失败')
  const groups = collectList(data, ['couponGroups', 'groups', 'groupList', 'list', 'items'])
  const coupons = groups.flatMap((group) => collectList(group, ['couponInfoList', 'coupons', 'items']))

  return (coupons.length > 0 ? coupons : collectList(data, ['couponInfoList', 'coupons', 'items', 'list']))
    .map(normalizeCoupon)
    .filter((coupon) => coupon.couponNo || coupon.voucherNo || coupon.name)
}

export async function bindMemberCoupon(
  voucherNumber: string,
  password: string,
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(voucherNumber, '卡券号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.COUPON,
    WANDA_API_PATHS.COUPON_BIND,
    {
      sale_subject: 'Wanda',
      is_scratch: Boolean(password),
      voucher_number: voucherNumber,
      password,
      json: true
    },
    ck,
    userIdentifier
  )

  ensureSuccess(response, '绑定卡券失败')
}

export function buildCouponNosParam(couponNos: string[]): string {
  const rawCouponNos = couponNos.map((couponNo) => couponNo.trim()).filter(Boolean).join(',')

  assertNotBlank(rawCouponNos, '兑换券 couponNo 不能为空')

  return encodeURIComponent(rawCouponNos).replace(/%[0-9A-F]{2}/g, (value) => value.toLowerCase())
}

function buildCouponPresentPath(action: string, couponNos: string[]): string {
  return `${WANDA_API_PATHS.COUPON_PRESENT}${action}?voucherNos=${buildCouponNosParam(couponNos)}`
}

export async function checkCouponPresentable(
  couponNos: string[],
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.COUPON,
    buildCouponPresentPath('canCouponPresent.api', couponNos),
    {},
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '兑换券可赠送校验失败')
  const bizMsg = firstText(data.bizMsg, data.msg)

  if (bizMsg && !bizMsg.includes('可以转增')) {
    throw new Error(sanitizeWandaErrorMessage(bizMsg) || '兑换券不可赠送')
  }
}

export async function checkCouponPresentIdentity(
  couponNos: string[],
  ck: string,
  userIdentifier: string
): Promise<{ needCheck: boolean; raw: unknown }> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.COUPON,
    buildCouponPresentPath('idverify.api', couponNos),
    {},
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '兑换券赠送身份验证状态获取失败')

  return {
    needCheck: toBoolean(data.needCheck),
    raw: response
  }
}

export async function sendCouponPresentSecurityCode(
  mobile: string,
  ip: string,
  ck: string,
  userIdentifier: string
): Promise<string> {
  assertNotBlank(mobile, '万达账号手机号不能为空')
  assertNotBlank(ip, '本机 IP 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.COUPON_PRESENT}sms/send_security_code.api?mobile=${encodeURIComponent(
    mobile
  )}&imageCode=&businessType=1&ip=${encodeURIComponent(ip)}`
  const response = await wandaGet<unknown>(WANDA_HOSTS.COUPON, path, {}, ck, userIdentifier)
  const data = ensureSuccess(response, '兑换券赠送短信发送失败')
  const result = asRecord(data.res)
  const requestId = firstText(data.requestId, result.requestId)

  if (!requestId) {
    throw new Error('兑换券赠送短信发送成功但缺少 requestId')
  }

  return requestId
}

export async function validateCouponPresentSecurityCode(
  mobile: string,
  requestId: string,
  securityCode: string,
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(mobile, '万达账号手机号不能为空')
  assertNotBlank(requestId, '短信 requestId 不能为空')
  assertNotBlank(securityCode, '短信验证码不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.COUPON_PRESENT}sms/valid_security_code.api?mobile=${encodeURIComponent(
    mobile
  )}&requestId=${encodeURIComponent(requestId)}&securityCode=${encodeURIComponent(securityCode)}`
  const response = await wandaGet<unknown>(WANDA_HOSTS.COUPON, path, {}, ck, userIdentifier)
  const data = ensureSuccess(response, '兑换券赠送短信验证失败')
  const bizMsg = firstText(data.bizMsg, data.msg)

  if (bizMsg) {
    throw new Error(sanitizeWandaErrorMessage(bizMsg) || '兑换券赠送短信验证失败')
  }
}

export async function presentMemberCoupons(
  couponNos: string[],
  targetMobile: string,
  memberPhone: string,
  requestId: string,
  securityCode: string,
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(targetMobile, '接收手机号不能为空')
  assertNotBlank(memberPhone, '赠送账号手机号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const formBody = [
    `voucherNos=${buildCouponNosParam(couponNos)}`,
    'shareMemo=',
    `targetMobile=${encodeURIComponent(targetMobile)}`,
    `requestId=${encodeURIComponent(requestId)}`,
    `securityCode=${encodeURIComponent(securityCode)}`,
    `memberPhone=${encodeURIComponent(memberPhone)}`
  ].join('&')
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.COUPON,
    `${WANDA_API_PATHS.COUPON_PRESENT}present.api`,
    formBody,
    ck,
    userIdentifier
  )

  ensureSuccess(response, '兑换券赠送失败')
}

export async function fetchMemberGradeEquityList(ck: string, userIdentifier: string): Promise<MemberGradeGroup[]> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.GATEWAY,
    `${WANDA_API_PATHS.MEMBER_GRADE}grade_equity_list.api`,
    {},
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, '会员权益加载失败')
  const groups = collectList(data, ['gradeEquityList', 'gradeList', 'grades', 'list', 'items'])
  
  return groups.map(normalizeGradeGroup).filter((group) => group.gradeName)
}

export async function fetchMemberSignInCalendar(ck: string, userIdentifier: string): Promise<MemberSignInCalendar> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const jsonBody = JSON.stringify({ ruleScene: 1 })
  const signatureBody = encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase())
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.SIGN_IN_CALENDAR,
    jsonBody,
    ck,
    userIdentifier,
    { signatureBody, contentType: 'application/json' }
  )
  const data = ensureSuccess(response, '会员签到加载失败')
  const calendar = asRecord(data.data ?? data.res ?? data)
  const dataList = collectList(calendar, ['dataList', 'list', 'items']).map(normalizeSignInDay)

  return {
    consecutiveDays: toNumber(calendar.consecutiveDays),
    signInStreak: toNumber(calendar.signInStreak),
    dataList,
    raw: data
  }
}

export async function submitMemberSignIn(ck: string): Promise<MemberSignInSubmitResult> {
  assertNotBlank(ck, '万达账号 CK 不能为空')

  const jsonBody = JSON.stringify({ signInDate: formatWandaDate(), ruleScene: 1 })
  const validResponse = await wandaSignInPostJson<unknown>(
    WANDA_API_PATHS.SIGN_IN_VALID_SUPPLEMENT,
    jsonBody,
    ck
  )
  const validResult = ensureSignInSubmitSuccess(validResponse, '会员签到校验失败')

  if (isAlreadySignedResult(validResult)) {
    return validResult
  }

  const response = await wandaSignInPostJson<unknown>(
    WANDA_API_PATHS.SIGN_IN_DO,
    jsonBody,
    ck
  )

  return ensureSignInSubmitSuccess(response, '会员签到失败')
}

export async function gainMemberEquity(
  gradeId: string,
  equityId: string,
  ck: string,
  userIdentifier: string
): Promise<void> {
  assertNotBlank(gradeId, '会员等级 ID 不能为空')
  assertNotBlank(equityId, '权益 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.MEMBER_GRADE}gain_equity.api?gradeId=${encodeURIComponent(gradeId)}&equityId=${encodeURIComponent(equityId)}`
  const response = await wandaGet<unknown>(
    WANDA_HOSTS.GATEWAY,
    path,
    {},
    ck,
    userIdentifier
  )

  ensureSuccess(response, '领取会员权益失败')
}

export async function fetchWPlusDetail(ck: string, userIdentifier: string): Promise<MemberEquityRow[]> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.WPLUS_MEMBER_PLUS_DETAIL,
    { json: true },
    ck,
    userIdentifier
  )
  const data = ensureSuccess(response, 'W+会员数据加载失败')

  return collectList(data, ['rights', 'rightList', 'equityList', 'list', 'items'])
    .map((item) => normalizeEquity(item))
    .filter((item) => item.name)
}

async function fetchWPlusDetailPayload(ck: string, userIdentifier: string): Promise<{ raw: unknown; data: Record<string, unknown> }> {
  assertNotBlank(ck, 'W+会员 CK 不能为空')
  assertNotBlank(userIdentifier, 'W+会员用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.WPLUS_MEMBER_PLUS_DETAIL,
    { json: true },
    ck,
    userIdentifier
  )

  return {
    raw: response,
    data: ensureSuccess(response, 'W+会员数据加载失败')
  }
}

export async function fetchWPlusProfile(ck: string, userIdentifier: string): Promise<MemberWPlusProfile> {
  const { raw, data } = await fetchWPlusDetailPayload(ck, userIdentifier)

  return normalizeWPlusProfile(data, raw)
}

export async function fetchWPlusRightGroups(ck: string, userIdentifier: string): Promise<MemberWPlusRightGroup[]> {
  const { data } = await fetchWPlusDetailPayload(ck, userIdentifier)

  return collectList(data, ['rightGroupList', 'groups', 'list', 'items'])
    .map(normalizeWPlusRightGroup)
    .filter((group) => group.name)
}

export async function receiveWPlusRight(
  ck: string,
  userIdentifier: string,
  orderCode: string,
  rightCode: string,
  rightType: string
): Promise<void> {
  // 旧系统接口：/right/plus/order/receive
  assertNotBlank(ck, 'W+会员 CK 不能为空')
  assertNotBlank(userIdentifier, 'W+会员用户标识不能为空')
  assertNotBlank(orderCode, 'W+ orderCode 不能为空')
  assertNotBlank(rightCode, 'W+ rightCode 不能为空')
  assertNotBlank(rightType, 'W+ rightType 不能为空')

  const jsonBody = JSON.stringify({
    orderCode,
    rightCode,
    rightType
  })
  const signatureBody = encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase())
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.WPLUS_RIGHT_RECEIVE,
    jsonBody,
    ck,
    userIdentifier,
    { signatureBody, contentType: 'application/json' }
  )

  ensureSuccess(response, 'W+权益领取失败')
}

export async function activateWPlus(
  ck: string,
  userIdentifier: string,
  exchangeCode: string,
  password: string
): Promise<MemberWPlusExchangeResult> {
  // 旧系统接口：/right/plus/order/sale/get_exchange_info_2023
  assertNotBlank(ck, 'W+会员 CK 不能为空')
  assertNotBlank(userIdentifier, 'W+会员用户标识不能为空')
  assertNotBlank(exchangeCode, 'W+卡号不能为空')
  assertNotBlank(password, 'W+卡密不能为空')

  const jsonBody = JSON.stringify({
    exchangeCode,
    password
  })
  const signatureBody = encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase())
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.WPLUS_EXCHANGE_INFO,
    jsonBody,
    ck,
    userIdentifier,
    { signatureBody, contentType: 'application/json' }
  )
  const data = ensureSuccess(response, 'W+激活兑换失败')

  return {
    bizCode: toNumber(data.bizCode),
    bizMsg: firstText(data.bizMsg, data.msg),
    canOpen: toBoolean(data.canOpen),
    raw: response
  }
}

export async function fetchActivityList(
  cinemaId: string,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftRow[]> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaSeatGet<unknown>(
    `${WANDA_API_PATHS.PACK_ACTIVITY}list.api`,
    { cinemaId, json: true },
    ck,
    userIdentifier,
    WANDA_HOSTS.GATEWAY,
    { useProxy }
  )
  const data = ensureSuccess(response, '活动礼包加载失败')

  return collectList(data, ['activities', 'activityList', 'itemList', 'list', 'items'])
    .map(normalizeActivity)
    .filter((activity) => activity.id || activity.code || activity.name)
}

export async function fetchActivityDetail(
  cinemaId: string,
  activityCode: string,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<unknown> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(activityCode, '活动 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaSeatGet<unknown>(
    `${WANDA_API_PATHS.PACK_ACTIVITY}detail.api`,
    { cinemaId, activityCode, json: true },
    ck,
    userIdentifier,
    WANDA_HOSTS.GATEWAY,
    { useProxy }
  )

  return ensureSuccess(response, '活动详情加载失败')
}

export async function createActivityGiftOrder(
  cinemaId: string,
  activityCode: string,
  goodsNum: number,
  orderAmount: number,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftOrderResult> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(activityCode, '活动 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  if (!Number.isFinite(goodsNum) || goodsNum < 1) {
    throw new Error('礼包数量不能为空')
  }

  if (!Number.isFinite(orderAmount) || orderAmount < 0) {
    throw new Error('礼包订单金额无效')
  }

  const body = {
    cinemaId,
    activityCode,
    goodsNum,
    orderAmount,
    json: true
  }
  const jsonBody = JSON.stringify(body)
  const signatureBody = encodeURIComponent(jsonBody).replace(/%[0-9A-F]{2}/g, (value) => value.toLowerCase())
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.PACK_ACTIVITY_CREATE_ORDER,
    jsonBody,
    ck,
    userIdentifier,
    { signatureBody, contentType: 'application/json', useProxy }
  )
  const data = ensureSuccess(response, '礼包订单创建失败')
  const result = asRecord(data.res)
  const order = asRecord(data.order)
  const orderId = firstText(data.orderId, data.id, result.orderId, result.id, order.orderId, order.id)

  if (!orderId) {
    throw new Error(firstText(data.bizMsg, data.msg, '礼包订单创建成功但缺少订单号'))
  }

  return {
    orderId,
    raw: response
  }
}

export async function fetchGiftOrders(
  pageIndex: number,
  pageSize: number,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftOrderListResult> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaSeatGet<unknown>(
    WANDA_API_PATHS.GIFT_ORDERS,
    { pageIndex, pageSize, json: true },
    ck,
    userIdentifier,
    WANDA_HOSTS.GATEWAY,
    { useProxy }
  )
  const data = ensureSuccess(response, '礼包订单加载失败')
  const records = collectList(data, ['orders', 'orderList', 'items', 'list', 'records']).map(normalizeGiftOrder)

  return {
    records,
    total: toNumber(data.totalCount ?? data.total ?? data.count, records.length),
    raw: response
  }
}

export async function fetchGiftOrderDetail(
  orderId: string,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftOrderDetailResult> {
  assertNotBlank(orderId, '礼包订单号不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.GIFT_ORDER_DETAIL}?id=${encodeURIComponent(orderId)}&json=true`
  const response = await wandaSeatGet<unknown>(path, {}, ck, userIdentifier, WANDA_HOSTS.GATEWAY, { useProxy })
  const data = ensureSuccess(response, '礼包订单详情加载失败')
  const result = asRecord(data.res)
  const order = asRecord(data.order ?? result.order)
  const payId = firstText(order.payId, data.payId, result.payId)

  if (!payId) {
    throw new Error(firstText(data.bizMsg, data.msg, '礼包订单详情缺少 payId'))
  }

  return {
    orderId,
    payId,
    raw: response
  }
}

export async function createGiftTransaction(
  payId: string,
  ck: string,
  userIdentifier: string,
  payMethodId = ACTIVITY_GIFT_PAY_METHOD_ID,
  useProxy = false
): Promise<ActivityGiftTransactionResult> {
  assertNotBlank(payId, '礼包支付 ID 不能为空')
  assertNotBlank(payMethodId, '礼包支付方式不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const formBody = `payId=${encodeURIComponent(payId)}&payMethodId=${encodeURIComponent(payMethodId)}&json=true`
  const response = await wandaPostForm<unknown>(
    WANDA_HOSTS.GATEWAY,
    WANDA_API_PATHS.GIFT_TRANSACTION_CREATE,
    formBody,
    ck,
    userIdentifier,
    { useProxy }
  )
  const data = ensureSuccess(response, '礼包交易创建失败')
  const result = asRecord(data.res)
  const transaction = asRecord(data.transaction ?? result.transaction)
  const transactionId = firstText(data.id, data.transactionId, result.id, result.transactionId, transaction.id)

  if (!transactionId) {
    throw new Error(firstText(data.bizMsg, data.msg, '礼包交易创建成功但缺少交易 ID'))
  }

  return {
    transactionId,
    raw: response
  }
}

export async function fetchGiftTransactionDetail(
  payId: string,
  transactionId: string,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftPaymentResult> {
  assertNotBlank(payId, '礼包支付 ID 不能为空')
  assertNotBlank(transactionId, '礼包交易 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const path = `${WANDA_API_PATHS.GIFT_TRANSACTION_DETAIL}?payId=${encodeURIComponent(payId)}&id=${encodeURIComponent(
    transactionId
  )}&json=true`
  const response = await wandaSeatGet<unknown>(path, {}, ck, userIdentifier, WANDA_HOSTS.GATEWAY, { useProxy })
  const data = ensureSuccess(response, '礼包交易详情加载失败')
  const result = asRecord(data.res)
  const payParams = asRecord(data.payParams ?? result.payParams)
  const payment = asRecord(data.payment ?? result.payment)
  const appPayParam = firstText(payParams.appPayParam, payment.appPayParam, result.appPayParam, data.appPayParam)

  if (!appPayParam) {
    throw new Error(firstText(data.bizMsg, data.msg, '礼包支付参数未就绪'))
  }

  return {
    orderId: '',
    payId,
    transactionId,
    appPayParam,
    raw: response
  }
}

export async function createActivityGiftPayment(
  orderId: string,
  ck: string,
  userIdentifier: string,
  useProxy = false
): Promise<ActivityGiftPaymentResult> {
  const orderDetail = await fetchGiftOrderDetail(orderId, ck, userIdentifier, useProxy)
  const transaction = await createGiftTransaction(orderDetail.payId, ck, userIdentifier, ACTIVITY_GIFT_PAY_METHOD_ID, useProxy)

  for (let index = 0; index < ACTIVITY_GIFT_TRANSACTION_POLL_LIMIT; index += 1) {
    try {
      const result = await fetchGiftTransactionDetail(
        orderDetail.payId,
        transaction.transactionId,
        ck,
        userIdentifier,
        useProxy
      )

      return {
        ...result,
        orderId
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''

      if (!message.includes('未就绪') || index === ACTIVITY_GIFT_TRANSACTION_POLL_LIMIT - 1) {
        throw error
      }

      await wait(ACTIVITY_GIFT_TRANSACTION_POLL_DELAY)
    }
  }

  throw new Error('礼包支付参数未就绪')
}
