// Trading journal: data model and the pure maths behind it (P&L, tax, calendar).
// Statistics and insights live in journalAnalytics.ts; storage in journalStore.ts.

import { INSTRUMENTS as CALC_INSTRUMENTS } from './margin'

export type Direction = 'BUY' | 'SELL'
export type Currency = 'INR' | 'USD'
/** 'per-trade': every winning trade is taxed, losses can't offset it. 'net': tax only the net profit of the period. */
export type TaxMode = 'per-trade' | 'net'

export interface Trade {
  id: string
  date: string // YYYY-MM-DD
  time: string // HH:mm or ''
  instrument: string
  symbol: string
  direction: Direction
  currency: Currency
  /** INR per 1 USD when the trade was taken; always 1 for INR trades. */
  fxRate: number
  qty: number
  contractSize: number
  entry: number | null
  exit: number | null
  stopLoss: number | null
  target: number | null
  /** True when P&L was typed in rather than calculated from entry/exit. */
  manualPnl: boolean
  /** P&L before fees, in the trade's own currency. */
  grossPnl: number
  fees: number
  strategy: string
  emotion: string
  mistakes: string[]
  followedPlan: boolean | null
  rating: number // 0 = unrated, 1–5
  notes: string
  /** Where the trade came from, e.g. "options-analytics:zerodha"; empty when typed in by hand. */
  source: string
  /**
   * Which journal this trade belongs to: '' for the main (options) journal, or a MetaTrader 5 account number for that
   * account's own Forex calendar. Keeps the two calendars separate while sharing one store.
   */
  account: string
  createdAt: string
  updatedAt: string
}

export interface DayNote {
  date: string
  bias: string
  plan: string
  review: string
  lessons: string
  mood: number // 0 = unset, 1–5
  discipline: number // 0 = unset, 1–5
  /** '' (or absent) = the main journal; otherwise the MT5 account this note belongs to. */
  account?: string
}

/** A tax rate and method for one instrument, overriding the journal-wide default. */
export interface TaxRule {
  instrument: string
  rate: number // percent
  mode: TaxMode
}

export interface JournalSettings {
  /** Default rate for any instrument without its own rule. */
  taxRate: number // percent
  taxMode: TaxMode
  /** Per-instrument overrides — options, crypto and gold are commonly taxed differently. */
  taxRules: TaxRule[]
  startingCapital: number // INR, 0 = unknown
  dailyLossLimit: number // INR, 0 = off
  maxTradesPerDay: number // 0 = off
}

/**
 * Only Bitcoin is taxed by default (30% on each winning trade, no loss offset). Options Analytics already accounts
 * for its own tax and charges, so nothing more is added on top of options — or anything else — unless a rule says so.
 */
export const DEFAULT_TAX_RULES: TaxRule[] = [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }]

export const DEFAULT_SETTINGS: JournalSettings = {
  taxRate: 0,
  taxMode: 'per-trade',
  taxRules: DEFAULT_TAX_RULES.map((r) => ({ ...r })),
  startingCapital: 0,
  dailyLossLimit: 0,
  maxTradesPerDay: 0,
}

// ---------- Presets (free text is always allowed; these are just suggestions) ----------

export interface InstrumentPreset {
  name: string
  currency: Currency
  contractSize: number
}

export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  { name: 'Options', currency: 'INR', contractSize: 1 },
  { name: 'Futures', currency: 'INR', contractSize: 1 },
  { name: 'Stocks', currency: 'INR', contractSize: 1 },
  { name: 'Bitcoin', currency: 'USD', contractSize: CALC_INSTRUMENTS.BITCOIN.contractSize },
  { name: 'XAUUSD', currency: 'USD', contractSize: CALC_INSTRUMENTS.XAUUSD.contractSize },
  { name: 'US30', currency: 'USD', contractSize: CALC_INSTRUMENTS.US30.contractSize },
  { name: 'Forex', currency: 'USD', contractSize: 100000 },
]

export const STRATEGIES = [
  'Breakout',
  'Trend following',
  'Pullback',
  'Reversal',
  'Range / mean reversion',
  'Scalp',
  'Swing',
  'News / event',
  'Expiry day',
]

export const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'FOMO', 'Fearful', 'Greedy', 'Revenge', 'Bored', 'Tired', 'Overexcited']

export const MISTAKES = [
  'FOMO entry',
  'No stop loss',
  'Moved stop loss',
  'Over-sized',
  'Revenge trade',
  'Overtrading',
  'Exited too early',
  'Held too long',
  'Ignored plan',
  'Chased price',
]

export const BIASES = ['Bullish', 'Bearish', 'Neutral', 'Choppy']

// ---------- Per-trade maths ----------

const round2 = (n: number) => Math.round(n * 100) / 100

/** P&L implied by entry/exit prices, or null when they (or the quantity) are missing. */
export function grossFromPrices(t: Pick<Trade, 'direction' | 'entry' | 'exit' | 'qty' | 'contractSize'>): number | null {
  if (t.entry === null || t.exit === null || !(t.qty > 0)) return null
  const dir = t.direction === 'BUY' ? 1 : -1
  return round2((t.exit - t.entry) * t.qty * t.contractSize * dir)
}

/** Pass as the `account` when loading to get every trade from every journal (options and all MT5 accounts). */
export const ALL_ACCOUNTS = '*'

export const fxOf = (t: Pick<Trade, 'currency' | 'fxRate'>) => (t.currency === 'USD' ? t.fxRate : 1)
export const grossInr = (t: Trade) => t.grossPnl * fxOf(t)
export const feesInr = (t: Trade) => t.fees * fxOf(t)
/** Net P&L in INR: the number every total is built from. */
export const netInr = (t: Trade) => (t.grossPnl - t.fees) * fxOf(t)

/** Money risked between entry and stop, in INR; 0 when either is missing. */
export function riskInr(t: Trade): number {
  if (t.entry === null || t.stopLoss === null || !(t.qty > 0)) return 0
  return Math.abs(t.entry - t.stopLoss) * t.qty * t.contractSize * fxOf(t)
}

/** Net P&L as a multiple of the amount risked (R), or null when there was no stop loss. */
export function rMultiple(t: Trade): number | null {
  const risk = riskInr(t)
  return risk > 0 ? netInr(t) / risk : null
}

// ---------- Tax ----------

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export const instrumentKey = (name: string) => name.trim().toLowerCase()

type TaxSettings = Pick<JournalSettings, 'taxRate' | 'taxMode'> & { taxRules?: TaxRule[] }

/** The rate and method that apply to an instrument: its own rule if there is one, else the journal default. */
export function taxRuleFor(settings: TaxSettings, instrument: string): { rate: number; mode: TaxMode } {
  const key = instrumentKey(instrument)
  const rule = settings.taxRules?.find((r) => instrumentKey(r.instrument) === key)
  return rule ? { rate: rule.rate, mode: rule.mode } : { rate: settings.taxRate, mode: settings.taxMode }
}

/** Short heading for tax figures: "Tax 30%" for one flat rate, "Tax · by instrument" once instruments differ. */
export function taxHeading(settings: TaxSettings): string {
  if (settings.taxRules && settings.taxRules.length > 0) return 'Tax · by instrument'
  return settings.taxRate > 0 ? `Tax ${settings.taxRate}%` : 'Tax'
}

/** "Bitcoin 30% · other instruments untaxed", or "30% default · Bitcoin 20%", or "30%" / "No tax". */
export function taxSummary(settings: TaxSettings): string {
  const rules = settings.taxRules ?? []
  const named = rules.map((r) => `${r.instrument} ${r.rate}%`).join(' · ')
  if (rules.length === 0) return settings.taxRate > 0 ? `${settings.taxRate}%` : 'No tax'
  return settings.taxRate > 0 ? `${settings.taxRate}% default · ${named}` : `${named} · other instruments untaxed`
}

/** The one-line explanation shown under tax figures. */
export function taxCaption(settings: TaxSettings): string {
  if ((settings.taxRules ?? []).length > 0) return taxSummary(settings)
  if (settings.taxRate <= 0) return 'No tax applied'
  return usesNetTax(settings) ? 'On net profit — losses offset gains' : 'On each winning trade — no loss offset'
}

/** True when any instrument (or the default) taxes the period's net profit, so group tax figures won't sum. */
export const usesNetTax = (settings: TaxSettings) => settings.taxMode === 'net' || (settings.taxRules ?? []).some((r) => r.mode === 'net')

/**
 * Tax on a set of trades. Trades are grouped by instrument and each group is taxed by its own rule. Within a group,
 * 'per-trade' mode taxes every winner and lets losses offset nothing (additive), while 'net' mode taxes the group's
 * net profit, so its tax won't equal the sum of its parts.
 */
export function taxOn(trades: Trade[], settings: TaxSettings): number {
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const key = instrumentKey(t.instrument)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  let total = 0
  for (const list of groups.values()) {
    const { rate, mode } = taxRuleFor(settings, list[0].instrument)
    const taxable = mode === 'net' ? Math.max(0, sum(list.map(netInr))) : sum(list.map((t) => Math.max(0, netInr(t))))
    total += (taxable * rate) / 100
  }
  return total
}

export interface Totals {
  trades: number
  wins: number
  losses: number
  gross: number
  fees: number
  /** Net P&L before tax (after fees). */
  net: number
  tax: number
  afterTax: number
}

export function totalsOf(trades: Trade[], settings: JournalSettings): Totals {
  const net = sum(trades.map(netInr))
  const tax = taxOn(trades, settings)
  return {
    trades: trades.length,
    wins: trades.filter((t) => netInr(t) > 0).length,
    losses: trades.filter((t) => netInr(t) < 0).length,
    gross: sum(trades.map(grossInr)),
    fees: sum(trades.map(feesInr)),
    net,
    tax,
    afterTax: net - tax,
  }
}

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date in the browser's timezone as YYYY-MM-DD. */
export function todayStr(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const monthOf = (date: string) => date.slice(0, 7)

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export type Range = 'month' | '3m' | '6m' | 'ytd' | '1y' | 'all'

export const RANGES: { id: Range; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: '3m', label: '3 months' },
  { id: '6m', label: '6 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All time' },
]

/**
 * The month span (YYYY-MM, inclusive) a dashboard range covers. `month` is the month being viewed; the rolling
 * ranges count back from the current month. Undefined bounds mean "no limit".
 */
export function rangeFor(range: Range, viewedMonth: string, today: string): { from?: string; to?: string } {
  const current = monthOf(today)
  switch (range) {
    case 'month':
      return { from: viewedMonth, to: viewedMonth }
    case '3m':
      return { from: shiftMonth(current, -2), to: current }
    case '6m':
      return { from: shiftMonth(current, -5), to: current }
    case '1y':
      return { from: shiftMonth(current, -11), to: current }
    case 'ytd':
      return { from: `${current.slice(0, 4)}-01`, to: current }
    default:
      return {}
  }
}

export interface CalendarCell {
  date: string
  day: number
  inMonth: boolean
}

/** The month as Monday-first weeks, padded with the neighbouring months' days so every row has 7 cells. */
export function monthGrid(month: string): CalendarCell[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const weeks = Math.ceil((lead + daysInMonth) / 7)
  const rows: CalendarCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const row: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(Date.UTC(y, m - 1, 1 - lead + w * 7 + d))
      row.push({
        date: `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`,
        day: cell.getUTCDate(),
        inMonth: cell.getUTCMonth() === m - 1,
      })
    }
    rows.push(row)
  }
  return rows
}

export function groupByDate(trades: Trade[]): Map<string, Trade[]> {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    const list = map.get(t.date)
    if (list) list.push(t)
    else map.set(t.date, [t])
  }
  return map
}

/** Chronological order: date, then time, then id, so same-second trades keep a stable order. */
export const byWhen = (a: Trade, b: Trade) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id)

export function newTradeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function blankTrade(date: string, account = ''): Trade {
  return {
    id: newTradeId(),
    date,
    time: '',
    instrument: '',
    symbol: '',
    direction: 'BUY',
    currency: 'INR',
    fxRate: 1,
    qty: 0,
    contractSize: 1,
    entry: null,
    exit: null,
    stopLoss: null,
    target: null,
    manualPnl: false,
    grossPnl: 0,
    fees: 0,
    strategy: '',
    emotion: '',
    mistakes: [],
    followedPlan: null,
    rating: 0,
    notes: '',
    source: '',
    account,
    createdAt: '',
    updatedAt: '',
  }
}
