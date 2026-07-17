import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface FeedbackItem {
  id: number
  type: string
  category: string
  content: string
  status: string
  reply: string | null
  createdAt: string
  repliedAt: string | null
}

const http = axios.create({ baseURL: AUTH_SERVER_BASE_URL, timeout: 15000 })
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true })

export async function submitFeedback(
  token: string,
  body: { type: string; category: string; content: string; contact?: string; images?: string[] }
): Promise<{ ok: boolean; id?: number; code?: string }> {
  const { data } = await http.post('/feedback', body, auth(token))
  return data
}

export async function myFeedback(token: string): Promise<{ ok: boolean; items?: FeedbackItem[] }> {
  const { data } = await http.get('/feedback/mine', auth(token))
  return data
}
