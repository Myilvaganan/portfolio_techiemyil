import { describe, expect, it } from 'vitest'
import type { ChargeItem, RoundTrip } from './optionsAnalytics'
import { fyList, fyOf, fyReportDoc, fySummary, fyTradesCsv } from './fyReport'

const trip = (closeDate: string, pnl: number) => ({ id: closeDate + pnl, symbol: 'NIFTY', closeDate, openDate: closeDate, pnl, closeTs: Date.parse(closeDate), direction: 'LONG', qty: 75, entryPrice: 100, exitPrice: 110 }) as unknown as RoundTrip
const charge = (date: string, total: number, actual = true): ChargeItem => ({ date, underlying: 'NIFTY', brokerage: total, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0, total, actual })

describe('fyReport', () => {
  it('maps dates to Indian financial years', () => {
    expect(fyOf('2026-03-31')).toBe('FY 2025-26')
    expect(fyOf('2026-04-01')).toBe('FY 2026-27')
    expect(fyList([trip('2026-03-10', 1), trip('2026-09-10', 1)])).toEqual(['FY 2026-27', 'FY 2025-26'])
  })

  it('sums the year with ICAI turnover and charges as expenses', () => {
    const s = fySummary([trip('2026-04-10', 1000), trip('2026-05-02', -400), trip('2026-03-30', 999)], [charge('2026-04-10', 50), charge('2026-05-02', 30, false)], 'FY 2026-27')
    expect(s).toMatchObject({ trades: 2, wins: 1, losses: 1, grossProfit: 1000, grossLoss: -400, gross: 600, charges: 80, net: 520, turnover: 1400, chargesEstimated: true })
    expect(s.months.map((m) => [m.month, m.net])).toEqual([['2026-04', 950], ['2026-05', -430]])
    expect(fyReportDoc(s).sections[0].kpis![0].value).toBe('₹1,400')
    expect(fyTradesCsv([trip('2026-04-10', -5)], 'FY 2026-27').rows[0].slice(-2)).toEqual([-5, 5])
  })
})
