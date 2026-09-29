import { describe, expect, it } from 'vitest'
import type { Txn } from '../statements'
import { runwayInputs, scenarios } from './runway'

const t = (date: string, category: string, debit: number, credit = 0): Txn => ({ id: date + category + debit + credit, statementId: 's', accountKey: 'a', date, description: category, merchant: category, debit, credit, category })

describe('runway', () => {
  const txns = [
    t('2026-06-05', 'Rent', 20000), t('2026-06-09', 'Shopping', 10000), t('2026-06-01', 'Salary', 0, 90000),
    t('2026-07-05', 'Rent', 20000), t('2026-07-09', 'Shopping', 10000), t('2026-07-01', 'Salary', 0, 90000),
    t('2026-08-05', 'Rent', 20000), t('2026-08-09', 'Shopping', 10000), t('2026-08-01', 'Salary', 0, 90000),
    t('2026-09-05', 'Rent', 99999), t('2026-09-10', 'Trading', 50000),
  ]
  const snapshots = [{ month: '2026-09', assets: { portfolio: 100000, bank: 50000, other: 0 }, liabilities: { loans: 0, cards: 0 }, net: 150000, takenAt: '' }]
  const lending = [{ id: 'l1', name: 'A', phone: '', amount: 30000, date: '2026-01-01', dueDate: '', interestRatePct: 0, note: '', repayments: [], passThrough: null }] as never
  const r = runwayInputs({ txns, tags: {}, snapshots, lending, today: '2026-09-29' })

  it('averages the last three complete months and ignores the current one', () => {
    expect(r.monthsUsed).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(r.monthlyOutflow).toBe(30000)
    expect(r.wantsShare).toBeCloseTo(1 / 3)
    expect(r.monthlyIncome).toBe(90000)
    expect(r.owedToYou).toBe(30000)
  })

  it('works out months of runway per scenario', () => {
    const s = Object.fromEntries(scenarios(r).map((x) => [x.key, x.months]))
    expect(s.jobLoss).toBe(5)
    expect(s.marketDrop).toBeCloseTo(130000 / 30000)
    expect(s.cutWants).toBe(6)
    expect(s.repaid).toBe(6)
  })
})
