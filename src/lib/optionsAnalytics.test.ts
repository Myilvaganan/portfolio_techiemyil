import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHARGE_RATES,
  analyze,
  buildInsights,
  buildRoundTrips,
  estimateCharges,
  mergeFills,
  parseOptionSymbol,
  parseTradebookCsv,
  type Fill,
} from './optionsAnalytics'
import { demoFills } from './optionsDemo'

let seq = 0
const fill = (symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, date: string, time = '10:00:00', orderId?: string): Fill => {
  seq++
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss] = time.split(':').map(Number)
  return { id: `t${seq}`, orderId: orderId ?? `o${seq}`, symbol, side, qty, price, date, time, ts: Date.UTC(y, m - 1, d, hh, mm, ss) }
}

describe('parseOptionSymbol', () => {
  it('reads weekly symbols with the exact expiry', () => {
    expect(parseOptionSymbol('NIFTY2592324500CE')).toEqual({ underlying: 'NIFTY', type: 'CE', strike: 24500, expiry: '2025-09-23', exactExpiry: true })
    expect(parseOptionSymbol('BANKNIFTY26O1352000PE')).toMatchObject({ underlying: 'BANKNIFTY', expiry: '2026-10-13', strike: 52000 })
  })

  it('reads monthly symbols using the last day of the month', () => {
    expect(parseOptionSymbol('NIFTY26SEP24500CE')).toEqual({ underlying: 'NIFTY', type: 'CE', strike: 24500, expiry: '2026-09-30', exactExpiry: false })
  })

  it('rejects futures and equities', () => {
    expect(parseOptionSymbol('NIFTY26SEPFUT')).toBeNull()
    expect(parseOptionSymbol('RELIANCE')).toBeNull()
  })
})

describe('parseTradebookCsv', () => {
  const csv = [
    'symbol,isin,trade_date,exchange,segment,series,trade_type,auto_square,quantity,price,trade_id,order_id,order_execution_time',
    'NIFTY2592324500CE,,2025-09-22,NSE,FO,,buy,false,75,100.5,1001,9001,2025-09-22T09:31:10',
    'NIFTY2592324500CE,,2025-09-22,NSE,FO,,sell,false,75,130,1002,9002,2025-09-22T10:05:00',
    'RELIANCE,INE002A01018,2025-09-22,NSE,EQ,EQ,buy,false,5,2900,1003,9003,2025-09-22T10:00:00',
  ].join('\n')

  it('keeps option rows and ignores the rest', () => {
    const r = parseTradebookCsv(csv)
    expect(r.fills).toHaveLength(2)
    expect(r.ignoredRows).toBe(1)
    expect(r.fills[0]).toMatchObject({ side: 'BUY', qty: 75, price: 100.5, date: '2025-09-22', time: '09:31:10', orderId: '9001' })
  })

  it('reports files that are not a tradebook', () => {
    expect(parseTradebookCsv('a,b\n1,2').error).toMatch(/doesn’t look like/)
    expect(parseTradebookCsv('').error).toBeTruthy()
  })

  it('dedupes when the same file is imported twice', () => {
    const fills = parseTradebookCsv(csv).fills
    expect(mergeFills(fills, fills)).toHaveLength(2)
  })
})

describe('buildRoundTrips', () => {
  const sym = 'NIFTY2592324500CE'

  it('computes a long winner and a short winner', () => {
    const { trips } = buildRoundTrips(
      [
        fill(sym, 'BUY', 75, 100, '2025-09-22'),
        fill(sym, 'SELL', 75, 120, '2025-09-22', '10:30:00'),
        fill(sym, 'SELL', 75, 80, '2025-09-22', '11:00:00'),
        fill(sym, 'BUY', 75, 60, '2025-09-22', '11:20:00'),
      ],
      '2025-09-30',
    )
    expect(trips.map((t) => [t.direction, t.pnl])).toEqual([['LONG', 1500], ['SHORT', 1500]])
    expect(trips[0].holdMin).toBe(30)
  })

  it('treats scaling in and out as one trade using FIFO', () => {
    const { trips } = buildRoundTrips(
      [
        fill(sym, 'BUY', 50, 100, '2025-09-22', '09:30:00'),
        fill(sym, 'BUY', 50, 110, '2025-09-22', '09:40:00'),
        fill(sym, 'SELL', 75, 120, '2025-09-22', '10:00:00'),
        fill(sym, 'SELL', 25, 90, '2025-09-22', '10:10:00'),
      ],
      '2025-09-30',
    )
    expect(trips).toHaveLength(1)
    expect(trips[0].qty).toBe(100)
    expect(trips[0].pnl).toBe(50 * 20 + 25 * 10 + 25 * -20)
    expect(trips[0].entryPrice).toBeCloseTo(105)
  })

  it('splits a fill that flips the position', () => {
    const { trips, open } = buildRoundTrips([fill(sym, 'BUY', 50, 100, '2025-09-22'), fill(sym, 'SELL', 80, 110, '2025-09-22', '10:30:00')], '2025-09-22')
    expect(trips).toHaveLength(1)
    expect(trips[0].pnl).toBe(500)
    expect(open).toEqual([{ symbol: sym, side: 'SELL', qty: 30, avgPrice: 110 }])
  })

  it('expires worthless positions after expiry and leaves live ones open', () => {
    const bought = fill(sym, 'BUY', 75, 40, '2025-09-22')
    const expired = buildRoundTrips([bought], '2025-09-24')
    expect(expired.trips[0]).toMatchObject({ pnl: -3000, expired: true, closeDate: '2025-09-23' })
    expect(expired.open).toEqual([])
    const live = buildRoundTrips([bought], '2025-09-23')
    expect(live.trips).toEqual([])
    expect(live.open).toHaveLength(1)
  })

  it('a short that expires worthless keeps the full premium', () => {
    const { trips } = buildRoundTrips([fill(sym, 'SELL', 75, 20, '2025-09-22')], '2025-10-01')
    expect(trips[0].pnl).toBe(1500)
  })
})

describe('estimateCharges', () => {
  it('charges brokerage per order, capped at 0.03% of turnover', () => {
    const [big] = estimateCharges([fill('NIFTY2592324500CE', 'BUY', 1000, 200, '2025-09-22', '10:00:00', 'A')])
    expect(big.brokerage).toBe(20)
    const [small] = estimateCharges([fill('NIFTY2592324500CE', 'BUY', 75, 2, '2025-09-22', '10:00:00', 'B')])
    expect(small.brokerage).toBeCloseTo(0.045)
  })

  it('applies STT on sells only and stamp duty on buys only', () => {
    const [buy] = estimateCharges([fill('NIFTY2592324500CE', 'BUY', 100, 100, '2025-09-22', '10:00:00', 'C')])
    const [sell] = estimateCharges([fill('NIFTY2592324500CE', 'SELL', 100, 100, '2025-09-22', '10:00:00', 'D')])
    expect(buy.stt).toBe(0)
    expect(sell.stt).toBeCloseTo(10)
    expect(buy.stamp).toBeCloseTo(0.3)
    expect(sell.stamp).toBe(0)
    expect(sell.gst).toBeCloseTo((sell.brokerage + sell.exchange + sell.sebi) * 0.18)
  })

  it('groups fills of one order together', () => {
    const items = estimateCharges([
      fill('NIFTY2592324500CE', 'BUY', 1000, 200, '2025-09-22', '10:00:00', 'X'),
      fill('NIFTY2592324500CE', 'BUY', 1000, 200, '2025-09-22', '10:00:01', 'X'),
    ])
    expect(items).toHaveLength(1)
    expect(items[0].brokerage).toBe(20)
    expect(DEFAULT_CHARGE_RATES.brokeragePerOrder).toBe(20)
  })
})

describe('analyze', () => {
  const fills = demoFills()
  const { trips } = buildRoundTrips(fills, '2027-01-01')
  const charges = estimateCharges(fills)
  const a = analyze(trips, charges)

  it('is internally consistent', () => {
    expect(a.trades).toBe(trips.length)
    expect(a.wins + a.losses).toBeLessThanOrEqual(a.trades)
    expect(a.net).toBeCloseTo(a.gross - a.charges, 6)
    expect(a.days.reduce((s, d) => s + d.net, 0)).toBeCloseTo(a.net, 6)
    expect(a.equity.at(-1)!.cum).toBeCloseTo(a.net, 6)
    expect(a.maxDrawdown.amount).toBeGreaterThanOrEqual(0)
    for (const slices of Object.values(a.breakdowns)) {
      expect(slices.reduce((s, x) => s + x.trades, 0)).toBe(a.trades)
      expect(slices.reduce((s, x) => s + x.pnl, 0)).toBeCloseTo(a.gross, 6)
    }
  })

  it('computes headline ratios on a known set', () => {
    const sym = 'NIFTY2592324500CE'
    const known = buildRoundTrips(
      [
        fill(sym, 'BUY', 10, 100, '2025-09-22', '09:30:00'), fill(sym, 'SELL', 10, 130, '2025-09-22', '09:40:00'),
        fill(sym, 'BUY', 10, 100, '2025-09-22', '10:30:00'), fill(sym, 'SELL', 10, 90, '2025-09-22', '10:40:00'),
        fill(sym, 'BUY', 10, 100, '2025-09-22', '11:30:00'), fill(sym, 'SELL', 10, 90, '2025-09-22', '11:40:00'),
      ],
      '2025-09-30',
    ).trips
    const k = analyze(known, [])
    expect(k.gross).toBe(100)
    expect(k.winRate).toBeCloseTo(33.33, 1)
    expect(k.profitFactor).toBeCloseTo(300 / 200)
    expect(k.payoff).toBeCloseTo(300 / 100)
    expect(k.maxLossStreak).toBe(2)
    expect(k.largestWin?.pnl).toBe(300)
  })

  it('finds a drawdown', () => {
    const sym = 'NIFTY2592324500CE'
    const t = buildRoundTrips(
      [
        fill(sym, 'BUY', 1, 100, '2025-09-15'), fill(sym, 'SELL', 1, 200, '2025-09-15', '10:30:00'),
        fill(sym, 'BUY', 1, 100, '2025-09-16'), fill(sym, 'SELL', 1, 40, '2025-09-16', '10:30:00'),
        fill(sym, 'BUY', 1, 100, '2025-09-17'), fill(sym, 'SELL', 1, 70, '2025-09-17', '10:30:00'),
      ],
      '2025-09-30',
    ).trips
    expect(analyze(t, []).maxDrawdown).toEqual({ amount: 90, from: '2025-09-15', to: '2025-09-17' })
  })

  it('handles no trades', () => {
    const empty = analyze([], [])
    expect(empty).toMatchObject({ trades: 0, net: 0, winRate: 0, profitFactor: null })
    expect(buildInsights(empty)).toEqual([])
  })

  it('produces insights with a leak, an edge and charges', () => {
    const insights = buildInsights(a)
    expect(insights.some((i) => i.text.startsWith('Estimated charges'))).toBe(true)
    expect(insights.length).toBeGreaterThan(1)
  })
})
