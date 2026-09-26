import { clearStoredToken, getStoredToken } from './adminAuth'
import type { EntryDraft, LendingEntry } from './lending'

const API = import.meta.env.VITE_ADMIN_API_URL

async function call(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach your lending records. Please try again.')
  return data
}

export const fetchLending = async (): Promise<LendingEntry[]> => (await call('/admin/lending')).entries
export const saveLending = async (entry: EntryDraft | LendingEntry): Promise<LendingEntry[]> => (await call('/admin/lending', 'POST', { entry })).entries
export const deleteLending = async (id: string): Promise<LendingEntry[]> => (await call(`/admin/lending?id=${encodeURIComponent(id)}`, 'DELETE')).entries
