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
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not reach the server. Please try again.')
  return data
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  message: string
  read: boolean
  createdAt: string
}

export interface SiteAnalytics {
  month: string
  total: number
  byDay: { date: string; views: number }[]
  pages: { path: string; views: number }[]
  referrers: { host: string; views: number }[]
}

export interface Backup {
  generatedAt: string
  files: Record<string, unknown>
  documents: { key: string; size: number; lastModified: string | null }[]
  skipped: string[]
}

export const fetchBackup = (): Promise<Backup> => call('/admin/backup')
export const fetchMessages = async (): Promise<ContactMessage[]> => (await call('/admin/contact')).messages
export const markMessage = (id: string, read: boolean) => call('/admin/contact/read', 'POST', { id, read })
export const deleteMessage = (id: string) => call(`/admin/contact?id=${encodeURIComponent(id)}`, 'DELETE')
export const fetchAnalytics = (month?: string): Promise<SiteAnalytics> => call(`/admin/analytics${month ? `?month=${month}` : ''}`)

/** Public: no token. Throws with the server's message so the form can show it. */
export async function sendContact(form: { name: string; email: string; message: string; website: string }) {
  if (!API) throw new Error('The contact form is not configured.')
  const res = await fetch(`${API}/public/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || 'Could not send your message. Please email me instead.')
}

/** Public, fire-and-forget page view. Sends only the path and the referring site. */
export function recordHit(path: string) {
  if (!API || typeof navigator === 'undefined' || navigator.webdriver) return
  const body = JSON.stringify({ path, referrer: document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '' })
  try {
    fetch(`${API}/public/hit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch {
    // Analytics must never break the page.
  }
}

/** Downloads everything the admin stores as one JSON file. */
export async function downloadBackup() {
  const backup = await fetchBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `techiemyil-admin-backup-${backup.generatedAt.slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return backup
}
