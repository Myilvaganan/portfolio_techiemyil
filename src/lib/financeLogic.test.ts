import { describe, expect, it } from 'vitest'
import type { Txn } from './statements'
import { applyRules, reviewQueue, ruleMatches } from './rules'
import { budgetNotices, budgetStatus, countsAsSpend, spentByCategory, tagKeyForMerchant } from './budget'
import { cashFlow, latestBalance, monthlyFlow } from './cashflow'
import { spendAlerts } from './anomalies'

let n = 0
const t = (date: string, merchant: string, debit: number, category = 'Shopping', extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`, statementId: 's', accountKey: 'a', date, description: merchant, merchant, debit, credit: 0, category, ...extra,
})
const cr = (date: string, credit: number, category = 'Salary', balance?: number): Txn => ({ ...t(date, 'Employer', 0, category), credit, balance })

describe('rules', () => {
  it('matches text and regex safely', () => {
    expect(ruleMatches('zomato', t('2026-09-01', 'ZOMATO ORDER', 10))).toBe(true)
    expect(ruleMatches('/swig+y/', t('2026-09-01', 'Swiggy', 10))).toBe(true)
    expect(ruleMatches('/(/', t('2026-09-01', 'Swiggy', 10))).toBe(false)
  })
  it('applies rules but never re-files transfers', () => {
    const out = applyRules([t('2026-09-01', 'Zomato', 100, 'Other'), t('2026-09-01', 'Zomato', 100, 'Transfer')], [{ id: '1', match: 'zomato', category: 'Food & Dining' }])
    expect(out.map((x) => x.category)).toEqual(['Food & Dining', 'Transfer'])
  })
  it('queues the biggest Other debits', () => {
    const q = reviewQueue([t('2026-09-01', 'A', 10, 'Other'), t('2026-09-01', 'B', 500, 'Other'), t('2026-09-01', 'C', 900, 'Food')], 5)
    expect(q.map((x) => x.merchant)).toEqual(['B', 'A'])
  })
})

describe('budget', () => {
  it('excludes transfers, card bills and tagged items', () => {
    expect(countsAsSpend(t('2026-09-01', 'X', 10, 'Transfer'))).toBe(false)
    expect(countsAsSpend(t('2026-09-01', 'ICICI', 10, 'Bills & Utilities', { description: 'BIL/ICICI BANK CREDIT CA' }))).toBe(false)
    const a = t('2026-09-01', 'Amma', 5000, 'Transfer')
    expect(countsAsSpend(a, { [tagKeyForMerchant(a)]: 'household' })).toBe(true)
    const b = t('2026-09-01', 'Cousin', 5000, 'Shopping')
    expect(countsAsSpend(b, { [tagKeyForMerchant(b)]: 'family' })).toBe(false)
  })
  it('computes usage, days left and projection', () => {
    const spent = spentByCategory([t('2026-09-05', 'A', 3000, 'Food'), t('2026-09-10', 'B', 2000, 'Food'), t('2026-08-10', 'C', 999, 'Food')], '2026-09')
    expect(spent).toEqual({ Food: 5000 })
    const [row] = budgetStatus({ Food: 8000 }, spent, '2026-09', '2026-09-10')
    expect(row.pct).toBeCloseTo(62.5)
    expect(row.daysLeft).toBe(20)
    expect(row.projected).toBe(15000)
    expect(row.projectedOver).toBe(true)
    expect(row.over).toBe(false)
  })
  it('raises over and near notices', () => {
    const txns = [t('2026-09-02', 'A', 1200, 'Food'), t('2026-09-02', 'B', 900, 'Fuel')]
    const ids = budgetNotices({ Food: 1000, Fuel: 1000 }, txns, '2026-09-10').map((x) => x.id)
    expect(ids).toEqual(['budget-over-2026-09-Food', 'budget-near-2026-09-Fuel'])
  })
})

describe('cashflow', () => {
  const bank = [cr('2026-07-01', 100000), cr('2026-08-01', 100000, 'Salary', 250000), t('2026-07-10', 'Shop', 40000), t('2026-08-10', 'Shop', 60000), t('2026-08-12', 'Card', 9999, 'Card Payment')]
  it('sums income, spend and savings rate', () => {
    const [jul, aug] = monthlyFlow(bank, ['2026-07', '2026-08'])
    expect(jul).toMatchObject({ income: 100000, spend: 40000, net: 60000, savingsRate: 60 })
    expect(aug.spend).toBe(60000)
  })
  it('takes the latest balance and projects runway', () => {
    expect(latestBalance(bank)).toBe(250000)
    const c = cashFlow(bank, [], ['2026-07', '2026-08', '2026-09'], '2026-09-15')
    expect(c.avgBurn).toBe(50000)
    expect(c.runwayMonths).toBe(5)
    expect(c.projection).toHaveLength(3)
    expect(c.projection[0].balance).toBe(250000 + 100000 - 50000)
  })
})

describe('anomalies', () => {
  it('flags a large spend, a double debit and a subscription hike', () => {
    const txns = [
      ...['2026-08-01', '2026-08-06', '2026-08-15', '2026-09-01'].map((d) => t(d, 'Cafe', 300)),
      t('2026-09-20', 'Cafe', 5000),
      t('2026-09-22', 'Shop', 799),
      t('2026-09-22', 'Shop', 799),
      ...['2026-06-05', '2026-07-05', '2026-08-05'].map((d) => t(d, 'Netflix', 500, 'Subscriptions')),
      t('2026-09-05', 'Netflix', 800, 'Subscriptions'),
    ]
    const titles = spendAlerts(txns, '2026-09-25').map((a) => a.title)
    expect(titles).toContain('Unusually large spend at Cafe')
    expect(titles).toContain('Possible double debit at Shop')
    expect(titles).toContain('Netflix costs more now')
  })
})
