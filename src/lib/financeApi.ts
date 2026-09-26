import { clearStoredToken, getStoredToken } from './adminAuth'
import type { TxnTag } from './budget'
import type { CategoryRule } from './rules'

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
  if (!res.ok) throw new Error(data?.error || 'Could not reach the server. Please try again.')
  return data
}

export interface FinanceSettings {
  budgets: Record<string, number>
  rules: CategoryRule[]
  tags: Record<string, TxnTag>
}

export async function fetchFinance(): Promise<FinanceSettings> {
  const [b, r, t] = await Promise.all([call('/admin/finance/budgets'), call('/admin/finance/rules'), call('/admin/finance/tags')])
  return { budgets: b?.budgets ?? {}, rules: r?.rules ?? [], tags: t?.tags ?? {} }
}

export const setBudget = async (category: string, limit: number): Promise<Record<string, number>> => (await call('/admin/finance/budgets', 'POST', { category, limit })).budgets
export const addRule = async (match: string, category: string): Promise<CategoryRule[]> => (await call('/admin/finance/rules', 'POST', { add: { match, category } })).rules
export const removeRule = async (id: string): Promise<CategoryRule[]> => (await call('/admin/finance/rules', 'POST', { remove: id })).rules
export const setTag = async (key: string, tag: TxnTag | null): Promise<Record<string, TxnTag>> => (await call('/admin/finance/tags', 'POST', { key, tag })).tags
