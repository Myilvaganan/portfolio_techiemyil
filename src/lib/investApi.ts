import { clearStoredToken, getStoredToken } from './adminAuth'
import type { CustomReminder } from './reminders'
import type { FySummary } from './capitalGains'

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

export type SavedFySummary = FySummary & { updatedAt?: string }

export const fetchCapitalGains = async (): Promise<Record<string, SavedFySummary>> => (await call('/admin/invest/capital-gains')).years
export const saveCapitalGains = (summary: FySummary) => call('/admin/invest/capital-gains', 'POST', { fy: summary.fy, summary })
export const fetchReminders = async (): Promise<CustomReminder[]> => (await call('/admin/invest/reminders')).reminders
export const addReminder = async (r: { title: string; date: string; note?: string }): Promise<CustomReminder> => (await call('/admin/invest/reminders', 'POST', r)).reminder
export const deleteReminder = (id: string) => call(`/admin/invest/reminders?id=${encodeURIComponent(id)}`, 'DELETE')
