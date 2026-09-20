import { clearStoredToken, getStoredToken } from './adminAuth'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL
const SESSION_KEY = 'kite_session'

export interface KiteHolding {
  tradingsymbol: string
  exchange: string
  quantity: number
  t1_quantity?: number
  average_price: number
  last_price: number
  close_price: number
  day_change?: number
  day_change_percentage?: number
}

export interface KitePosition {
  tradingsymbol: string
  exchange: string
  product: string
  quantity: number
  average_price: number
  last_price: number
  pnl: number
  m2m?: number
}

export interface KiteOrder {
  order_id: string
  tradingsymbol: string
  transaction_type: 'BUY' | 'SELL'
  quantity: number
  filled_quantity?: number
  status: string
  order_type: string
  product: string
  price: number
  average_price: number
  order_timestamp: string
}

interface KiteSegmentMargin {
  net: number
  available: { cash: number; live_balance?: number; opening_balance?: number }
  utilised: { debits: number; span?: number; exposure?: number; option_premium?: number }
}

export interface KiteSnapshot {
  fetchedAt: string
  errors: Record<string, string>
  profile: { user_name?: string; user_id?: string; email?: string } | null
  margins: { equity?: KiteSegmentMargin; commodity?: KiteSegmentMargin } | null
  holdings: KiteHolding[] | null
  positions: { net: KitePosition[]; day: KitePosition[] } | null
  orders: KiteOrder[] | null
}

export interface KiteSession {
  accessToken: string
  userId: string
  userName: string
}

export class KiteTokenExpiredError extends Error {}

export function getKiteSession(): KiteSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as KiteSession) : null
  } catch {
    return null
  }
}

export function storeKiteSession(session: KiteSession) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

export function clearKiteSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

async function kiteFetch(path: string, init: RequestInit = {}) {
  const token = getStoredToken()
  const res = await fetch(`${ADMIN_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (res.status === 401) clearStoredToken()
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (data?.code === 'token_expired') throw new KiteTokenExpiredError(data.error)
    throw new Error(data?.error || 'Something went wrong. Please try again.')
  }
  return data
}

export async function getKiteLoginUrl(): Promise<string> {
  const data = await kiteFetch('/admin/kite/login-url')
  return data.url
}

export async function createKiteSession(requestToken: string): Promise<KiteSession> {
  const data = await kiteFetch('/admin/kite/session', { method: 'POST', body: JSON.stringify({ requestToken }) })
  return { accessToken: data.accessToken, userId: data.userId, userName: data.userName }
}

export async function fetchKiteSnapshot(accessToken: string): Promise<KiteSnapshot> {
  return kiteFetch('/admin/kite/snapshot', { method: 'POST', body: JSON.stringify({ accessToken }) })
}

export async function endKiteSession(accessToken: string) {
  await kiteFetch('/admin/kite/logout', { method: 'POST', body: JSON.stringify({ accessToken }) }).catch(() => {})
}

// ---------- Derived numbers ----------

export interface HoldingRow {
  symbol: string
  exchange: string
  qty: number
  avg: number
  ltp: number
  invested: number
  value: number
  pnl: number
  pnlPct: number
  dayPnl: number
  dayPct: number
}

export function holdingRows(holdings: KiteHolding[] | null): HoldingRow[] {
  return (holdings ?? [])
    .map((h) => {
      const qty = h.quantity + (h.t1_quantity ?? 0)
      const invested = h.average_price * qty
      const value = h.last_price * qty
      const dayChange = h.day_change ?? h.last_price - h.close_price
      const dayBase = h.close_price * qty
      return {
        symbol: h.tradingsymbol,
        exchange: h.exchange,
        qty,
        avg: h.average_price,
        ltp: h.last_price,
        invested,
        value,
        pnl: value - invested,
        pnlPct: invested ? ((value - invested) / invested) * 100 : 0,
        dayPnl: dayChange * qty,
        dayPct: dayBase ? ((dayChange * qty) / dayBase) * 100 : 0,
      }
    })
    .filter((r) => r.qty > 0)
}

export interface PortfolioTotals {
  invested: number
  value: number
  pnl: number
  pnlPct: number
  dayPnl: number
  dayPct: number
}

export function portfolioTotals(rows: HoldingRow[]): PortfolioTotals {
  const invested = rows.reduce((s, r) => s + r.invested, 0)
  const value = rows.reduce((s, r) => s + r.value, 0)
  const dayPnl = rows.reduce((s, r) => s + r.dayPnl, 0)
  const prevValue = value - dayPnl
  return {
    invested,
    value,
    pnl: value - invested,
    pnlPct: invested ? ((value - invested) / invested) * 100 : 0,
    dayPnl,
    dayPct: prevValue ? (dayPnl / prevValue) * 100 : 0,
  }
}

export interface AllocationSlice {
  label: string
  value: number
  pct: number
  isOther: boolean
}

// Top `max` holdings by value, the tail folded into "Other".
export function allocationSlices(rows: HoldingRow[], max = 6): AllocationSlice[] {
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (!total) return []
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, max)
  const rest = sorted.slice(max)
  const slices: AllocationSlice[] = top.map((r) => ({ label: r.symbol, value: r.value, pct: (r.value / total) * 100, isOther: false }))
  if (rest.length) {
    const value = rest.reduce((s, r) => s + r.value, 0)
    slices.push({ label: `Other (${rest.length})`, value, pct: (value / total) * 100, isOther: true })
  }
  return slices
}

export interface MarginSummary {
  available: number
  used: number
  total: number
  usedPct: number
}

export function marginSummary(margins: KiteSnapshot['margins']): MarginSummary | null {
  const eq = margins?.equity
  if (!eq) return null
  const available = eq.available.live_balance ?? eq.available.cash
  const used = eq.utilised.debits
  const total = available + used
  return { available, used, total, usedPct: total ? (used / total) * 100 : 0 }
}

export function positionsPnl(positions: KiteSnapshot['positions']): number {
  return (positions?.net ?? []).reduce((s, p) => s + p.pnl, 0)
}

export function openPositions(positions: KiteSnapshot['positions']): KitePosition[] {
  return (positions?.net ?? []).filter((p) => p.quantity !== 0)
}

// ---------- Formatting ----------

export function formatInr(n: number, decimals = 0) {
  return `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

export function formatSignedInr(n: number, decimals = 0) {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return `${sign}${formatInr(n, decimals)}`
}

export function formatSignedPct(n: number, decimals = 2) {
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(decimals)}%`
}
