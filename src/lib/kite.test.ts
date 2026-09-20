import { describe, expect, it } from 'vitest'
import {
  allocationSlices,
  formatInr,
  formatSignedInr,
  holdingRows,
  marginSummary,
  openPositions,
  portfolioTotals,
} from './kite'
import { demoSnapshot } from './kiteDemo'

describe('kite calculations', () => {
  const rows = holdingRows(demoSnapshot().holdings)

  it('derives value, pnl and day change per holding', () => {
    const gold = rows.find((r) => r.symbol === 'GOLDBEES')!
    expect(gold.value).toBeCloseTo(420 * 77.1, 2)
    expect(gold.pnl).toBeCloseTo(420 * (77.1 - 62.4), 2)
    expect(gold.dayPnl).toBeCloseTo(420 * 0.7, 2)
  })

  it('totals the portfolio consistently', () => {
    const t = portfolioTotals(rows)
    expect(t.value - t.invested).toBeCloseTo(t.pnl, 6)
    expect(t.pnlPct).toBeCloseTo((t.pnl / t.invested) * 100, 6)
  })

  it('counts T+1 quantity and drops empty holdings', () => {
    const r = holdingRows([
      { tradingsymbol: 'A', exchange: 'NSE', quantity: 0, t1_quantity: 5, average_price: 10, last_price: 12, close_price: 11 },
      { tradingsymbol: 'B', exchange: 'NSE', quantity: 0, average_price: 10, last_price: 12, close_price: 11 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].value).toBe(60)
    expect(holdingRows(null)).toEqual([])
  })

  it('folds the tail of the allocation into Other and sums to 100%', () => {
    const slices = allocationSlices(rows, 6)
    expect(slices).toHaveLength(7)
    expect(slices[6]).toMatchObject({ label: 'Other (3)', isOther: true })
    expect(slices.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(100, 6)
    expect(allocationSlices([])).toEqual([])
  })

  it('summarises margin and open positions', () => {
    const m = marginSummary(demoSnapshot().margins)!
    expect(m.available).toBe(48250)
    expect(m.total).toBe(70000)
    expect(m.usedPct).toBeCloseTo(31.07, 1)
    expect(marginSummary(null)).toBeNull()
    expect(openPositions({ net: [{ quantity: 0 } as never, { quantity: 5 } as never], day: [] })).toHaveLength(1)
  })

  it('formats rupees in Indian grouping with explicit signs', () => {
    expect(formatInr(104277)).toBe('₹1,04,277')
    expect(formatSignedInr(-2098)).toBe('-₹2,098')
    expect(formatSignedInr(0)).toBe('₹0')
  })
})
