// Pulls today's options trades from Zerodha (Kite) and brings the journal up to date.
//
// Kite only returns the current trading day's fills, so the fills are saved into the same vault store Options
// Analytics reads. That keeps one source of truth, and lets a position opened on an earlier day (from a tradebook
// import) still be matched with today's closing fill. Closed round trips are then copied into the journal.

import { clearKiteSession, fetchKiteTrades, getKiteSession, KiteTokenExpiredError, type KiteTrade } from './kite'
import { fetchJournal, importTrades } from './journalStore'
import { loadChargeRates, tradesFromFills } from './journalBackfill'
import { monthOf } from './journal'
import { DEFAULT_CHARGE_RATES, buildRoundTrips, mergeFills, parseOptionSymbol, type Fill } from './optionsAnalytics'
import { fetchStoredFills, saveFills } from './optionsStore'

export const ZERODHA = 'zerodha'
const OPTION_EXCHANGES = new Set(['NFO', 'BFO'])

export class NotConnectedError extends Error {
  constructor() {
    super('Connect Zerodha first — sign in through Kite once each day.')
  }
}

// Kite prints IST wall-clock times ("2026-09-21 09:20:45"). The file import stores wall-clock as if it were UTC, and
// fills from both sources must agree so the same trade is never counted twice.
function parseKiteTime(text: string | undefined): { ts: number; date: string; time: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text ?? '')
  if (!m) return null
  const [, y, mo, d, hh, mm, ss] = m
  return { ts: Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss), date: `${y}-${mo}-${d}`, time: `${hh}:${mm}:${ss}` }
}

/** Option fills only — equity, futures and commodity trades don't belong in the options store. */
export function fillsFromKiteTrades(trades: KiteTrade[]): Fill[] {
  const fills: Fill[] = []
  for (const t of trades) {
    if (!OPTION_EXCHANGES.has(t.exchange) || !parseOptionSymbol(t.tradingsymbol)) continue
    if (t.transaction_type !== 'BUY' && t.transaction_type !== 'SELL') continue
    const when = parseKiteTime(t.fill_timestamp || t.exchange_timestamp || t.order_timestamp)
    if (!when || !(t.quantity > 0) || !(t.average_price >= 0) || !t.trade_id) continue
    fills.push({
      id: String(t.trade_id),
      orderId: String(t.order_id ?? ''),
      symbol: t.tradingsymbol.toUpperCase(),
      side: t.transaction_type,
      qty: t.quantity,
      price: t.average_price,
      ...when,
    })
  }
  return fills.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
}

const FUZZY_MS = 120_000

/**
 * Fills not already stored. Trade ids are exact, so they decide it. Only stored fills that have *no* id (some broker
 * exports omit it) are matched loosely — matching everything loosely would drop real repeats such as an order sliced
 * into identical 1,800-lot pieces.
 */
export function newFillsOnly(existing: Fill[], incoming: Fill[]): Fill[] {
  const ids = new Set(existing.filter((f) => f.id).map((f) => f.id))
  const idless = existing.filter((f) => !f.id)
  const seen = new Set<string>()
  return incoming.filter((f) => {
    if (ids.has(f.id) || seen.has(f.id)) return false
    if (idless.some((e) => e.symbol === f.symbol && e.side === f.side && e.qty === f.qty && e.price === f.price && Math.abs(e.ts - f.ts) <= FUZZY_MS)) return false
    seen.add(f.id)
    return true
  })
}

export interface OpenLeg {
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
}

export interface TodayReport {
  date: string
  closed: number
  wins: number
  losses: number
  gross: number
  fees: number
  net: number
  /** Contracts still held — they join the journal when they close. */
  open: OpenLeg[]
}

export interface SyncResult {
  userName: string
  /** Option fills Kite reported for today. */
  fetched: number
  /** Of those, how many were new to the store. */
  newFills: number
  tradesAdded: number
  tradesSkipped: number
  latestDate: string
  today: TodayReport
}

async function runSync(asOf: string): Promise<SyncResult> {
  const session = getKiteSession()
  if (!session) throw new NotConnectedError()

  let trades: KiteTrade[]
  try {
    trades = (await fetchKiteTrades(session.accessToken)).trades
  } catch (err) {
    if (err instanceof KiteTokenExpiredError) clearKiteSession()
    throw err
  }

  const incoming = fillsFromKiteTrades(trades)
  const existing = await fetchStoredFills(ZERODHA)
  const fresh = newFillsOnly(existing, incoming)
  if (fresh.length) await saveFills(ZERODHA, fresh)
  const all = fresh.length ? mergeFills(existing, fresh) : existing

  const rates = loadChargeRates()[ZERODHA] ?? DEFAULT_CHARGE_RATES
  const computed = tradesFromFills(ZERODHA, all, rates, asOf)

  // Only trades that could have closed in this sync are considered; older history has its own import.
  const windowStart = incoming.length ? incoming.map((f) => f.date).sort()[0] : asOf
  const candidates = computed.filter((t) => t.date >= windowStart)
  const journal = candidates.length ? await fetchJournal(monthOf(windowStart), monthOf(asOf)) : { trades: [] }
  const have = new Set(journal.trades.map((t) => t.id))
  const toAdd = candidates.filter((t) => !have.has(t.id))
  const outcome = toAdd.length ? await importTrades(toAdd) : { added: 0, skipped: 0, invalid: 0 }

  const todays = computed.filter((t) => t.date === asOf)
  const gross = todays.reduce((s, t) => s + t.grossPnl, 0)
  const fees = todays.reduce((s, t) => s + t.fees, 0)

  return {
    userName: session.userName,
    fetched: incoming.length,
    newFills: fresh.length,
    tradesAdded: outcome.added,
    tradesSkipped: outcome.skipped,
    latestDate: toAdd.map((t) => t.date).sort().pop() ?? '',
    today: {
      date: asOf,
      closed: todays.length,
      wins: todays.filter((t) => t.grossPnl - t.fees > 0).length,
      losses: todays.filter((t) => t.grossPnl - t.fees < 0).length,
      gross,
      fees,
      net: gross - fees,
      open: buildRoundTrips(all, asOf).open.map((o) => ({ symbol: o.symbol, side: o.side, qty: o.qty })),
    },
  }
}

// A second call while one is already running (React's dev double-effect, or a fast double click) joins the running
// sync instead of starting another. Two overlapping runs would each report their own numbers, and the later one —
// which finds everything already saved — would wrongly say "nothing was added".
let running: Promise<SyncResult> | null = null

export function syncZerodhaToJournal(asOf: string): Promise<SyncResult> {
  running ??= runSync(asOf).finally(() => {
    running = null
  })
  return running
}

