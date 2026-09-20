import { clearStoredToken, getStoredToken } from './adminAuth'
import type { Fill } from './optionsAnalytics'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL
const CHUNK = 5000

async function storeFetch(path: string, method = 'GET', body?: unknown) {
  const token = getStoredToken()
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach the trade vault. Please try again.')
  return data
}

const fillsPath = (broker: string) => `/admin/options/fills?broker=${encodeURIComponent(broker)}`

// Brokers that have saved trades in the vault.
export async function fetchStoredBrokers(): Promise<string[]> {
  const data = await storeFetch('/admin/options/brokers')
  return data.brokers.map((b: { broker: string }) => b.broker)
}

export async function fetchStoredFills(broker: string): Promise<Fill[]> {
  const data = await storeFetch(fillsPath(broker))
  return data.fills
}

// The server merges and de-duplicates, so re-sending trades is safe.
export async function saveFills(broker: string, fills: Fill[]): Promise<{ added: number; total: number }> {
  let added = 0
  let total = 0
  for (let i = 0; i < fills.length; i += CHUNK) {
    const result = await storeFetch(fillsPath(broker), 'POST', { fills: fills.slice(i, i + CHUNK) })
    added += result.added
    total = result.total
  }
  return { added, total }
}

export async function clearStoredFills(broker: string): Promise<void> {
  await storeFetch(fillsPath(broker), 'DELETE')
}
