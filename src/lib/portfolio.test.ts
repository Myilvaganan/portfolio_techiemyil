import { describe, expect, it } from 'vitest'
import { HOLDINGS, dailyReturnPct, defaultTargets, pctOf, rebalance, totalValue } from './portfolio'

describe('portfolio', () => {
  it('totals the snapshot holdings', () => {
    expect(totalValue(HOLDINGS)).toBe(104277)
  })

  it('computes gold and silver concentration', () => {
    const total = totalValue(HOLDINGS)
    const gold = HOLDINGS.find((h) => h.symbol === 'GOLDBEES')!.value
    const silver = HOLDINGS.find((h) => h.symbol === 'SILVERBEES')!.value
    expect(pctOf(gold, total)).toBeCloseTo(31.05, 1)
    expect(pctOf(gold + silver, total)).toBeCloseTo(51.7, 1)
  })

  it('rebalance deltas net to zero when targets sum to 100', () => {
    const rows = rebalance(HOLDINGS, defaultTargets())
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBeCloseTo(0, 6)
    expect(rows.find((r) => r.id === 'gold')!.delta).toBeCloseTo(10427.7 - 32378, 1)
    expect(rows.find((r) => r.id === 'midcap')!.delta).toBeCloseTo(15641.55, 1)
  })

  it('shows ₹2,000/day is about 1.92% of the portfolio', () => {
    expect(dailyReturnPct(104277)).toBeCloseTo(1.92, 2)
  })
})
