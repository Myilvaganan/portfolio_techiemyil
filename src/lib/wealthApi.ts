import { clearStoredToken, getStoredToken } from './adminAuth'
import type { Goal } from './goals'
import type { WealthSnapshot } from './netWorthHistory'

const API = import.meta.env.VITE_ADMIN_API_URL

async function call(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach the server. Please try again.')
  return data
}

export const fetchSnapshots = async (): Promise<WealthSnapshot[]> => (await call('/admin/wealth/snapshots')).snapshots
export const saveSnapshot = async (s: Omit<WealthSnapshot, 'net' | 'takenAt'>): Promise<WealthSnapshot[]> => (await call('/admin/wealth/snapshots', 'POST', s)).snapshots
export const fetchGoals = async (): Promise<Goal[]> => (await call('/admin/wealth/goals')).goals
export const saveGoal = async (g: Omit<Goal, 'id'> & { id?: string }): Promise<Goal[]> => (await call('/admin/wealth/goals', 'POST', g)).goals
export const deleteGoal = async (id: string): Promise<Goal[]> => (await call(`/admin/wealth/goals?id=${encodeURIComponent(id)}`, 'DELETE')).goals
