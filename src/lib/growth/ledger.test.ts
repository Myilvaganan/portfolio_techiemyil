import { describe, expect, it } from 'vitest'
import { blankTrade } from '../journal'
import type { Txn } from '../statements'
import type { Loan } from '../loans'
import { buildLedger } from './ledger'

const txn = (date: string, debit: number, credit = 0): Txn => ({ id: `${date}${debit}${credit}`, statementId: 's', accountKey: 'a', date, description: 'ZERODHA BROKING', merchant: 'Zerodha', debit, credit, category: 'Trading' })
const loan = (label: string, ratePct: number, emi: number, outstanding: number) => ({ label, ratePct, emi, outstanding }) as Loan

describe('buildLedger', () => {
  const ledger = buildLedger({
    txns: [txn('2026-08-02', 50000), txn('2026-08-20', 0, 10000), txn('2026-09-05', 30000)],
    trades: [{ ...blankTrade('2026-08-10'), grossPnl: -20000, fees: 500 }],
    tags: {},
    budgets: { Rent: 25000 },
    goals: [{ id: 'g1', name: 'Home', targetAmount: 700000, targetDate: '2030-01-01', kind: 'house', monthlyContribution: 10000 }],
    loans: [loan('Car', 9, 15000, 300000), loan('Personal', 14, 10000, 200000)],
    today: '2026-09-29',
  })

  it('nets money sent to and returned from brokers per month', () => {
    expect(ledger.months).toEqual([
      { month: '2026-08', sent: 50000, back: 10000, net: 40000, pnl: -20500 },
      { month: '2026-09', sent: 30000, back: 0, net: 30000, pnl: 0 },
    ])
    expect(ledger.totalNet).toBe(70000)
    expect(ledger.last12Net).toBe(70000)
  })

  it('expresses the outflow in rent, EMIs and goals', () => {
    expect(ledger.rentMonths).toBeCloseTo(2.8)
    expect(ledger.monthlyEmi).toBe(25000)
    expect(ledger.emiMonths).toBeCloseTo(2.8)
    expect(ledger.goals[0]).toMatchObject({ name: 'Home', pct: 10, months: 7 })
  })

  it('prices a prepayment of the costliest loan', () => {
    expect(ledger.prepay).toEqual({ loan: 'Personal', ratePct: 14, yearlyInterest: 9800 })
  })
})
