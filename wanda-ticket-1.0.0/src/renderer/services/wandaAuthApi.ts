import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { WandaLoginRequestId, WandaLoginResult, WandaLoginStatus } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, wandaLoginPost, wandaPost } from './wandaRequest'

function assertNotBlank(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message)
  }
}

export async function sendVerifyCode(phone: string): Promise<WandaLoginRequestId> {
  assertNotBlank(phone, '手机号不能为空')

  const response = await wandaLoginPost<WandaLoginRequestId>(WANDA_API_PATHS.USER_LOGIN_VERIFY_CODE, {
    phone
  })
  const data = response.data

  if (!data?.requestID) {
    throw new Error(response.msg || '验证码发送失败')
  }

  return data
}

export async function loginWithCode(phone: string, code: string, requestId: string): Promise<WandaLoginResult> {
  assertNotBlank(phone, '手机号不能为空')
  assertNotBlank(code, '验证码不能为空')
  assertNotBlank(requestId, '登录请求 ID 不能为空')

  const response = await wandaLoginPost<WandaLoginResult>(WANDA_API_PATHS.USER_LOGIN, {
    cinemaId: '7115',
    userPlat: 'oppo',
    phone,
    vcode: code,
    requestId
  })
  const data = response.data

  if (response.code !== 0 || !data?.userToken) {
    throw new Error(response.msg || '万达账号登录失败')
  }

  return data
}

export async function checkLoginStatus(ck: string, userIdentifier: string): Promise<WandaLoginStatus> {
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaPost<WandaLoginStatus>(
    WANDA_HOSTS.USER,
    WANDA_API_PATHS.USER_IS_LOGIN,
    { json: true },
    ck,
    userIdentifier
  )
  const data = response.data

  if (!data?.success) {
    throw new Error(response.msg || '万达账号登录已失效')
  }

  return data
}
