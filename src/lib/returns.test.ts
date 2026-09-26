import { describe, expect, it } from 'vitest'
import { compareBenchmark, returnTotals, rowsFromKite, rowsFromStatic, xirrOf } from './returns'
import type { HoldingRow } from './kite'

const kr = (o: Partial<HoldingRow>): HoldingRow => ({ symbol: 'A', exchange: 'NSE', qty: 1, avg: 100, ltp: 110, invested: 100, value: 110, pnl: 10, pnlPct: 10, dayPnl: 2, dayPct: 1.9, ...o })

describe('returns', () => {
  it('totals live holdings', () => {
    const t = returnTotals(rowsFromKite([kr({}), kr({ symbol: 'B', invested: 200, value: 180, pnl: -20, dayPnl: -3 })]))
    expect(t.invested).toBe(300)
    expect(t.gain).toBe(-10)
    expect(t.gainPct).toBeCloseTo(-3.33, 1)
    expect(t.dayPnl).toBe(-1)
  })
  it('does not invent a cost basis for the static snapshot', () => {
    const t = returnTotals(rowsFromStatic([{ symbol: 'X', role: '', value: 500, bucket: 'gold', action: 'core' }]), { pnl: 20, pct: 2 })
    expect(t.invested).toBeNull()
    expect(t.gain).toBeNull()
    expect(t.value).toBe(500)
    expect(t.dayPnl).toBe(20)
  })
  it('computes xirr only with dated flows', () => {
    const r = xirrOf([{ date: '2025-01-01', amount: -1000 }], 1100, '2026-01-01')
    expect(r).toBeCloseTo(10, 0)
    expect(xirrOf([], 1000, '2026-01-01')).toBeNull()
    expect(xirrOf([{ date: '2025-01-01', amount: -1000 }], 0, '2026-01-01')).toBeNull()
  })
  it('marks the benchmark unavailable rather than guessing', () => {
    expect(compareBenchmark(12, null).available).toBe(false)
    expect(compareBenchmark(12, 9).edge).toBe(3)
  })
})
