import { WANDA_API_PATHS } from '@shared/wandaCore'
import { WANDA_HOSTS, wandaGet } from './wandaRequest'

function assertNotBlank(value: string, message: string): void {
  if (!value.trim()) {
    throw new Error(message)
  }
}

export async function fetchCinemaShowtime(cinemaId: string, ck: string, userIdentifier: string): Promise<unknown> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CINEMA,
    WANDA_API_PATHS.SHOWTIME_BY_CINEMA,
    { cinemaId, showType: 0, json: true },
    ck,
    userIdentifier
  )

  if (response.code !== 0 && response.success !== true) {
    throw new Error(response.msg || '影院场次加载失败')
  }

  return response.data
}

export async function fetchCinemaDetail(cinemaId: string, ck: string, userIdentifier: string): Promise<unknown> {
  assertNotBlank(cinemaId, '影院 ID 不能为空')
  assertNotBlank(ck, '万达账号 CK 不能为空')
  assertNotBlank(userIdentifier, '万达账号用户标识不能为空')

  const response = await wandaGet<unknown>(
    WANDA_HOSTS.CINEMA,
    WANDA_API_PATHS.CINEMA_BY_CINEMA_ID,
    { cinemaid: cinemaId },
    ck,
    userIdentifier
  )

  if (response.code !== 0 && response.success !== true) {
    throw new Error(response.msg || '影院详情加载失败')
  }

  return response.data
}
