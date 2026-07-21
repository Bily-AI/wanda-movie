import axios from 'axios'
import { AUTH_SERVER_BASE_URL } from '@renderer/config/authServer'

export interface FeedbackMessage {
  id: number
  sender: 'user' | 'admin'
  adminUsername: string | null
  content: string
  createdAt: string
}

export interface FeedbackItem {
  id: number
  type: string
  category: string
  content: string
  contact: string | null
  images: string[]
  status: string
  createdAt: string
  messages: FeedbackMessage[]
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

// 用户对自己的工单追问(追加一条 user 消息)
export async function replyFeedback(
  token: string,
  id: number,
  content: string
): Promise<{ ok: boolean; code?: string }> {
  const { data } = await http.post(`/feedback/${id}/reply`, { content }, auth(token))
  return data
}
