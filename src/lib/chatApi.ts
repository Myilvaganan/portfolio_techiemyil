import { clearStoredToken, getStoredToken } from './adminAuth'

const API = import.meta.env.VITE_ADMIN_API_URL

async function call(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  if (res.status === 404) throw new Error('The chat service is not on the server yet. It may still be updating, please try again in a minute.')
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach the assistant. Please try again.')
  return data
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatReply {
  answer: string
  sources: string[]
  followUps: string[]
  inScope: boolean
  queries: string[]
}

export interface Coverage {
  source: string
  detail: string
}

export const askVault = (messages: ChatMessage[]): Promise<ChatReply> => call('/admin/chat', 'POST', { messages })
export const fetchCoverage = async (): Promise<Coverage[]> => (await call('/admin/chat/sources')).coverage
