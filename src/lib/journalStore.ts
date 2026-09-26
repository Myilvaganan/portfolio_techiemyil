import { clearStoredToken, getStoredToken } from './adminAuth'
import { ALL_ACCOUNTS, DEFAULT_SETTINGS, type DayNote, type JournalSettings, type Trade } from './journal'
import type { Mt5AccountMeta } from './mt5'

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL

async function call(path: string, method = 'GET', body?: unknown) {
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
  if (res.status === 404) throw new Error('The trading journal service isn’t available on the server yet. It may still be updating — please try again in a minute.')
  if (!res.ok) throw new Error(data?.error || 'Could not reach the trading journal. Please try again.')
  return data
}

export interface JournalData {
  trades: Trade[]
  days: Record<string, DayNote>
  /** Every month that has data, so the UI can tell what exists without loading it. */
  months: string[]
}

/**
 * Trades and day notes for the months from..to (YYYY-MM, inclusive); omit both for everything. `account` picks which
 * journal: '' is the main (options) journal, an MT5 account number is that account's own Forex calendar. The two never
 * mix — each is returned on its own, with day notes keyed by plain date.
 */
export async function fetchJournal(from?: string, to?: string, account = ''): Promise<JournalData> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const qs = params.toString()
  const data = await call(`/admin/journal/data${qs ? `?${qs}` : ''}`)

  // Trades saved before a field existed come back without it; fill the gaps so the UI can rely on the shape.
  const trades = (data.trades as Trade[])
    .map((t) => ({ ...t, source: t.source ?? '', account: t.account ?? '', tags: t.tags ?? [], holdMinutes: t.holdMinutes ?? 0 }))
    .filter((t) => account === ALL_ACCOUNTS || t.account === account)

  // A note for an account is stored as "<date>#<account>"; the main journal's are plain dates.
  const days: Record<string, DayNote> = {}
  for (const [key, note] of Object.entries((data.days ?? {}) as Record<string, DayNote>)) {
    const [date, owner = ''] = key.split('#')
    if (account === ALL_ACCOUNTS) days[key] = { ...note, account: owner }
    else if (owner === account) days[date] = { ...note, account: owner }
  }
  return { ...data, trades, days }
}

/** Creates or updates a trade. Pass the old date when it changed so the server moves it between months. */
export async function saveTrade(trade: Trade, previousDate?: string): Promise<Trade> {
  const data = await call('/admin/journal/trade', 'POST', { trade, previousDate })
  return data.trade
}

export async function deleteTrade(trade: Pick<Trade, 'id' | 'date'>): Promise<void> {
  await call(`/admin/journal/trade?date=${encodeURIComponent(trade.date)}&id=${encodeURIComponent(trade.id)}`, 'DELETE')
}

/** Saves a day's notes; an empty note deletes the entry and resolves null. Set `day.account` for a Forex account. */
export async function saveDayNote(day: DayNote): Promise<DayNote | null> {
  const data = await call('/admin/journal/day', 'POST', { day })
  return data.day
}

export async function fetchSettings(): Promise<JournalSettings> {
  const data = await call('/admin/journal/settings')
  return { ...DEFAULT_SETTINGS, ...data.settings }
}

export async function saveSettings(settings: JournalSettings): Promise<JournalSettings> {
  const data = await call('/admin/journal/settings', 'POST', { settings })
  return { ...DEFAULT_SETTINGS, ...data.settings }
}

const IMPORT_CHUNK = 500

export interface ImportResult {
  added: number
  /** Already in the journal, so left untouched. */
  skipped: number
  invalid: number
}

/**
 * Backfills trades from another module. The server keeps existing trades as they are, so this is safe to repeat and
 * never overwrites edits. Sent in chunks to stay well inside the request size limit.
 */
export async function importTrades(trades: Trade[]): Promise<ImportResult> {
  const total: ImportResult = { added: 0, skipped: 0, invalid: 0 }
  for (let i = 0; i < trades.length; i += IMPORT_CHUNK) {
    const r = await call('/admin/journal/trades/import', 'POST', { trades: trades.slice(i, i + IMPORT_CHUNK) })
    total.added += r.added
    total.skipped += r.skipped
    total.invalid += r.invalid
  }
  return total
}

/** An MT5 account and what its uploaded reports said about it (balance, deposits, the broker's own summary). */
export type Mt5Account = Mt5AccountMeta

export async function fetchAccounts(): Promise<Mt5Account[]> {
  const data = await call('/admin/journal/accounts')
  return data.accounts as Mt5Account[]
}

/**
 * Saves an account's details from an uploaded report, along with the report file itself for reference. Safe to repeat:
 * the server merges deposits and never lets an older report overwrite a newer one's balance.
 */
export async function saveAccount(account: Mt5AccountMeta, html?: string): Promise<Mt5Account> {
  const data = await call('/admin/journal/accounts', 'POST', { account, html })
  return data.account as Mt5Account
}

