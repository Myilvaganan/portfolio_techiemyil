import { describe, expect, it } from 'vitest'
import { computeNetWorth } from './netWorth'
import { bestWorst, hasSnapshotData, monthChanges, snapshotFrom, type WealthSnapshot } from './netWorthHistory'

const s = (month: string, net: number): WealthSnapshot => ({ month, assets: { portfolio: 0, bank: 0, other: 0 }, liabilities: { loans: 0, cards: 0 }, net, takenAt: '' })

describe('netWorthHistory', () => {
  it('builds a snapshot from a summary', () => {
    const summary = computeNetWorth({ portfolioValue: 1000, bankBalances: [{ label: 'a', balance: 500 }], loanOutstanding: [{ label: 'l', outstanding: 300 }], cardDues: [{ label: 'c', due: 50 }] })
    const snap = snapshotFrom(summary, '2026-09')
    expect(snap).toEqual({ month: '2026-09', assets: { portfolio: 1000, bank: 500, other: 0 }, liabilities: { loans: 300, cards: 50 } })
    expect(hasSnapshotData(snap)).toBe(true)
    expect(hasSnapshotData(snapshotFrom(computeNetWorth({ portfolioValue: 0, bankBalances: [], loanOutstanding: [], cardDues: [] })))).toBe(false)
  })

  it('computes changes and best/worst', () => {
    const ch = monthChanges([s('2026-08', 200), s('2026-06', 100), s('2026-07', 50)])
    expect(ch.map((c) => c.change)).toEqual([-50, 150])
    expect(ch[1].pct).toBe(300)
    const { best, worst } = bestWorst(ch)
    expect(best?.month).toBe('2026-08')
    expect(worst?.month).toBe('2026-07')
    expect(bestWorst([])).toEqual({ best: null, worst: null })
  })
})
