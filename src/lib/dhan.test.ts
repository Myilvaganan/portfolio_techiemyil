import { describe, expect, it } from 'vitest'
import dhanCsv from './fixtures/dhanGlobalTransaction.csv?raw'
import { analyseRows, csvToRows } from './tradeImport'
import { analyze, buildInsights, buildRoundTrips, estimateCharges, parseOptionSymbol } from './optionsAnalytics'

// Dhan "Global transaction report": one row per contract per day with buy/sell totals and the day's charges.
// The report's own footer says: Gross P&L -278,409.5245 · Total charges 11,653.5355 · Net P&L -290,063.06.
describe('Dhan global transaction report', () => {
  const a = analyseRows(csvToRows(dhanCsv))

  it('finds the header below the personal-details block and the summary columns', () => {
    expect(a.problems).toEqual([])
    expect(a.headerIdx).toBe(5)
    expect(a.mapping).toMatchObject({ date: 0, symbol: 1, buyQty: 4, buyValue: 5, sellQty: 6, sellValue: 7, chgBrokerage: 8, chgGst: 9, chgStt: 10, chgSebi: 11, chgStamp: 12, chgExchange: 13 })
    expect(a.mapping.side).toBeUndefined()
  })

  it('turns every contract-day into buy and sell fills with the average price', () => {
    const r = a.result!
    expect(r.notes[0]).toMatch(/daily summary/i)
    expect(r.ignoredRows).toBe(2) // the totals line and the download note
    const first = r.fills.filter((f) => f.date === '2026-04-28')
    expect(first.map((f) => [f.symbol, f.side, f.qty, f.price])).toEqual([
      ['NIFTY2642824000PE', 'BUY', 1040, 17108 / 1040],
      ['NIFTY2642824000PE', 'SELL', 1040, 25584 / 1040],
    ])
    expect(parseOptionSymbol(first[0].symbol)).toMatchObject({ underlying: 'NIFTY', strike: 24000, type: 'PE', expiry: '2026-04-28' })
    // buy-only and sell-only days produce a single fill
    expect(r.fills.filter((f) => f.date === '2026-05-06' && f.symbol.startsWith('NIFTY')).map((f) => f.side)).toEqual(['BUY'])
    expect(r.fills.filter((f) => f.date === '2026-05-07').map((f) => f.side)).toEqual(['SELL'])
  })

  it('reproduces the totals printed at the bottom of the report', () => {
    const fills = a.result!.fills
    const { trips, open } = buildRoundTrips(fills, '2026-09-20')
    expect(open).toEqual([])
    const stats = analyze(trips, estimateCharges(fills))
    expect(stats.gross).toBeCloseTo(-278409.5245, 0)
    expect(stats.charges).toBeCloseTo(11653.5355, 0)
    expect(stats.net).toBeCloseTo(-290063.06, 0)
    expect(stats.chargesSource).toBe('actual')
    expect(stats.chargeParts.brokerage).toBeCloseTo(6860, 2)
  })

  it('carries positions across days (buy on one day, sell on a later one)', () => {
    const { trips } = buildRoundTrips(a.result!.fills, '2026-09-20')
    const sensex = trips.find((t) => t.symbol.startsWith('SENSEX2650780000CE'))!
    expect(sensex).toMatchObject({ openDate: '2026-05-06', closeDate: '2026-05-07', qty: 40 })
    expect(sensex.pnl).toBeCloseTo(28 - 480)
    // 2,470 sold on 11 May closes 520 bought on 6 May plus 1,950 bought on 8 May
    const carried = trips.find((t) => t.symbol.startsWith('NIFTY2651224950CE'))!
    expect(carried).toMatchObject({ qty: 2470, openDate: '2026-05-06', closeDate: '2026-05-11' })
    expect(carried.pnl).toBeCloseTo(5310.62 - (16454.78 + 14820))
  })

  it('does not invent hold times or entry hours for a report without times', () => {
    const { trips } = buildRoundTrips(a.result!.fills, '2026-09-20')
    const stats = analyze(trips, estimateCharges(a.result!.fills))
    expect(stats.breakdowns.hold.map((h) => h.key)).not.toContain('Under 5 min')
    expect(stats.breakdowns.hold.map((h) => h.key)).toContain('Same day (no times)')
    expect(buildInsights(stats).some((i) => i.text.includes('00:00'))).toBe(false)
  })
})
