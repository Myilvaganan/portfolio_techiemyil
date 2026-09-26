import { describe, expect, it } from 'vitest'
import { parseCapitalGains, realisedXirr, summarizeByFy, taxableGains } from './capitalGains'
import type { Cell } from './tradeImport'

const rows: Cell[][] = [
  ['Tradewise Exits from 2025-04-01 to 2026-03-31'],
  [],
  ['Symbol', 'ISIN', 'Entry Date', 'Exit Date', 'Quantity', 'Buy Value', 'Sell Value', 'Profit', 'Period of Holding'],
  ['Equity - Intraday'],
  ['TCS', 'X', '2025-06-10', '2025-06-10', 5, 15000, 15500, 500, 0],
  ['Equity - Long Term'],
  ['NIFTYBEES', 'X', '2023-01-10', '2025-08-12', 100, 20000, 300000, 280000, 945],
  ['INFY', 'X', '03-02-2026', '20-03-2026', 10, 15000, 14000, -1000, 45],
  ['Parag Parikh Flexi Cap Fund Direct Growth', 'X', new Date('2024-01-01'), new Date('2025-09-01'), 50, 30000, 40000, 10000, 609],
  ['Total', '', '', '', '', '', '', 289500],
  ['F&O'],
  ['NIFTY25JUL', 'X', '2025-07-01', '2025-07-02', 50, 1, 2, 999, 1],
]

describe('capital gains', () => {
  const p = parseCapitalGains(rows)
  it('parses and classifies by holding period', () => {
    expect(p.problems).toEqual([])
    expect(p.rows.map((r) => r.cls)).toEqual(['intraday', 'ltcg', 'stcg', 'ltcg'])
    expect(p.rows[3].kind).toBe('mf')
    expect(p.skipped).toBe(1)
  })
  it('summarises per FY and taxes above the exemption', () => {
    const [s] = summarizeByFy(p.rows)
    expect(s.fy).toBe('2025-26')
    expect(s.ltcg).toBe(290000)
    expect(s.stcg).toBe(-1000)
    expect(s.intraday).toBe(500)
    const t = taxableGains(s)
    expect(t.ltcgAfterSetOff).toBe(289000)
    expect(t.ltcgTaxable).toBe(164000)
    expect(t.ltcgTax).toBe(20500)
    expect(t.stcgTax).toBe(0)
  })
  it('taxes STCG at the flat rate and reports xirr', () => {
    expect(taxableGains({ intraday: 0, stcg: 10000, ltcg: 100000 }).stcgTax).toBe(2000)
    expect(realisedXirr(p.rows)).toBeGreaterThan(0)
  })
  it('explains an unreadable file', () => {
    expect(parseCapitalGains([['a', 'b']]).problems[0]).toMatch(/Symbol/)
  })
})
