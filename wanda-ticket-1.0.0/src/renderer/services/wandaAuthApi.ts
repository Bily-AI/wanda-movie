import { WANDA_API_PATHS } from '@shared/wandaCore'
import type { WandaLoginRequestId, WandaLoginResult, WandaLoginStatus } from '@shared/wandaTicketTypes'
import { WANDA_HOSTS, wandaPost } from './wandaRequest'

export async function sendVerifyCode(phone: string): Promise<WandaLoginRequestId> {
  const response = await wandaPost<WandaLoginRequestId>(WANDA_HOSTS.USER, WANDA_API_PATHS.USER_LOGIN_VERIFY_CODE, {
    phone
  })
  const data = response.data

  if (!data?.requestID) {
    throw new Error(response.msg || '验证码发送失败')
  }

  return data
}

export async function loginWithCode(phone: string, code: string, requestId: string): Promise<WandaLoginResult> {
  const response = await wandaPost<WandaLoginResult>(WANDA_HOSTS.USER, WANDA_API_PATHS.USER_LOGIN, {
    cinemaId: '',
    userPlat: '6',
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
