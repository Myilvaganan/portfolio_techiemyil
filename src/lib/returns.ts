// Portfolio returns from holdings (live Kite snapshot or the static snapshot). Kite's holdings carry no buy dates,
// so XIRR is only computed where dated cash flows exist (see xirrOf); the benchmark is only compared when a Nifty
// figure for the same period is supplied. Nothing here invents either.

import type { HoldingRow } from './kite'
import type { Holding } from './portfolio'
import { xirr } from './loans'

export interface ReturnRow {
  symbol: string
  value: number
  /** Null when the source has no cost basis (the static snapshot). */
  invested: number | null
  gain: number | null
  gainPct: number | null
  dayPnl: number | null
  dayPct: number | null
}

export interface ReturnTotals {
  value: number
  invested: number | null
  gain: number | null
  gainPct: number | null
  dayPnl: number | null
  dayPct: number | null
  /** Holdings that carry a cost basis, out of the total. */
  costKnown: number
  count: number
}

export const rowsFromKite = (rows: HoldingRow[]): ReturnRow[] =>
  rows.map((r) => ({ symbol: r.symbol, value: r.value, invested: r.invested, gain: r.pnl, gainPct: r.pnlPct, dayPnl: r.dayPnl, dayPct: r.dayPct }))

export const rowsFromStatic = (holdings: Holding[]): ReturnRow[] =>
  holdings.map((h) => ({ symbol: h.symbol, value: h.value, invested: null, gain: null, gainPct: null, dayPnl: null, dayPct: null }))

export function returnTotals(rows: ReturnRow[], staticDay?: { pnl: number; pct: number }): ReturnTotals {
  const value = rows.reduce((s, r) => s + r.value, 0)
  const withCost = rows.filter((r) => r.invested !== null)
  const complete = rows.length > 0 && withCost.length === rows.length
  const invested = complete ? withCost.reduce((s, r) => s + (r.invested ?? 0), 0) : null
  const gain = invested === null ? null : value - invested
  const withDay = rows.filter((r) => r.dayPnl !== null)
  const dayKnown = rows.length > 0 && withDay.length === rows.length
  const dayPnl = dayKnown ? withDay.reduce((s, r) => s + (r.dayPnl ?? 0), 0) : (staticDay?.pnl ?? null)
  const prev = dayPnl === null ? 0 : value - dayPnl
  return {
    value,
    invested,
    gain,
    gainPct: invested ? ((gain ?? 0) / invested) * 100 : null,
    dayPnl,
    dayPct: dayKnown ? (prev ? ((dayPnl ?? 0) / prev) * 100 : 0) : (staticDay?.pct ?? null),
    costKnown: withCost.length,
    count: rows.length,
  }
}

export interface DatedFlow {
  date: string
  /** Negative = money put in, positive = money taken out. */
  amount: number
}

/** XIRR in percent from dated flows plus today's value as the closing inflow; null unless there is a sign change. */
export function xirrOf(flows: DatedFlow[], value: number, asOf: string): number | null {
  const sorted = [...flows].filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date))
  if (!sorted.length) return null
  const all = value > 0 ? [...sorted, { date: asOf, amount: value }] : sorted
  if (!all.some((f) => f.amount < 0) || !all.some((f) => f.amount > 0)) return null
  const r = xirr(all)
  return r === null || !Number.isFinite(r) ? null : r
}

export interface BenchmarkResult {
  available: boolean
  portfolioPct: number | null
  benchmarkPct: number | null
  /** Portfolio minus benchmark, in percentage points. */
  edge: number | null
}

/** Compares returns over the same period; unavailable unless both figures exist. */
export function compareBenchmark(portfolioPct: number | null, benchmarkPct: number | null | undefined): BenchmarkResult {
  if (portfolioPct === null || benchmarkPct === null || benchmarkPct === undefined || !Number.isFinite(benchmarkPct))
    return { available: false, portfolioPct, benchmarkPct: benchmarkPct ?? null, edge: null }
  return { available: true, portfolioPct, benchmarkPct, edge: portfolioPct - benchmarkPct }
}
