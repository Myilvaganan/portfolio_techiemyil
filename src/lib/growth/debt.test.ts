import { describe, expect, it } from 'vitest'
import { simulate, type Debt } from './debt'

const debts: Debt[] = [
  { id: 'card', name: 'Card', kind: 'card', balance: 50000, ratePct: 42, minPayment: 2500 },
  { id: 'loan', name: 'Loan', kind: 'loan', balance: 200000, ratePct: 12, minPayment: 8000 },
]

describe('debt payoff', () => {
  it('clears everything and costs less interest with extra money', () => {
    const base = simulate(debts, 0, 'minimum')
    const av = simulate(debts, 10000, 'avalanche')
    expect(av.months).not.toBeNull()
    expect(av.totalInterest).toBeLessThan(base.totalInterest)
    expect(base.months === null || av.months! < base.months).toBe(true)
  })

  it('avalanche pays less interest than snowball when the costlier debt is larger', () => {
    const d: Debt[] = [
      { id: 'a', name: 'Small cheap', kind: 'loan', balance: 20000, ratePct: 8, minPayment: 1000 },
      { id: 'b', name: 'Big costly', kind: 'card', balance: 90000, ratePct: 36, minPayment: 3000 },
    ]
    const av = simulate(d, 8000, 'avalanche')
    const sn = simulate(d, 8000, 'snowball')
    expect(av.totalInterest).toBeLessThan(sn.totalInterest)
    // Snowball clears the small debt first.
    expect(sn.clearedAt.a!).toBeLessThan(av.clearedAt.a!)
  })

  it('reports never when minimums do not cover the interest', () => {
    const r = simulate([{ id: 'x', name: 'x', kind: 'card', balance: 100000, ratePct: 42, minPayment: 1000 }], 0, 'minimum')
    expect(r.months).toBeNull()
  })
})
