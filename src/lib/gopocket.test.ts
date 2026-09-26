import { describe, expect, it } from 'vitest'
import registerHtml from './fixtures/gopocket-traderegister.htm?raw'
import { analyseRows, htmlToRows } from './tradeImport'
import { analyze, buildRoundTrips, estimateCharges } from './optionsAnalytics'

// GoPocket back-office "Date-wise, Party wise Trade Register" (01/09/26 – 26/09/26): dates sit on their own
// "Trade Date : 15/09/26" lines, purchase and sale quantity are separate columns, and only brokerage is printed.
describe('GoPocket trade register (.htm)', () => {
  const rows = htmlToRows(registerHtml)
  const a = analyseRows(rows)
  const fills = a.result!.fills

  it('reads the date lines and drops the party header and totals rows', () => {
    expect(rows[0]).toEqual(['Trade Date', 'Instrument', 'Buy/Sell', 'Quantity', 'Price', 'Brokerage'])
    expect(rows).toHaveLength(17) // header + 16 trades
    expect(a.problems).toEqual([])
    expect(a.result!.ignoredRows).toBe(0)
    expect(fills).toHaveLength(16)
  })

  it('maps instruments, sides, quantities and prices', () => {
    expect(fills[0]).toMatchObject({ date: '2026-09-15', symbol: 'NIFTY2691523300PE', side: 'BUY', qty: 260, price: 33.15 })
    expect(fills[1]).toMatchObject({ date: '2026-09-15', symbol: 'NIFTY2691523300PE', side: 'SELL', qty: 260, price: 38.65 })
    const last = fills[fills.length - 1]
    expect(last).toMatchObject({ date: '2026-09-18', symbol: 'NIFTY2692223250PE', side: 'SELL', qty: 650, price: 60.62 })
    expect(new Set(fills.map((f) => f.date))).toEqual(new Set(['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']))
  })

  it('keeps the real brokerage and estimates the rest, with a note', () => {
    const brokerage = fills.reduce((s, f) => s + (f.chg?.brokerage ?? 0), 0)
    expect(brokerage).toBe(500) // the register's grand total
    expect(fills.every((f) => f.chg && f.chg.total > f.chg.brokerage)).toBe(true)
    expect(a.result!.notes.join(' ')).toMatch(/only brokerage/i)
    const sell = fills[1].chg!
    expect(sell.stt).toBeCloseTo(0.001 * 260 * 38.65, 1)
    expect(sell.stamp).toBe(0)
  })

  it('pairs every purchase with its sale, matching the register amounts', () => {
    const { trips, open } = buildRoundTrips(fills, '2026-09-26')
    expect(open).toHaveLength(0)
    expect(trips).toHaveLength(8)
    // The register's Amount column (signed cash flow) adds up to the gross P&L.
    const charges = estimateCharges(fills)
    const result = analyze(trips, charges)
    expect(result.gross).toBeCloseTo(4894.53, 2)
    expect(charges.every((c) => c.actual)).toBe(true)
    expect(charges.reduce((s, c) => s + c.brokerage, 0)).toBe(500)
  })
})
