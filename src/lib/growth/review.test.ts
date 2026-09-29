import { describe, expect, it } from 'vitest'
import { blankTrade, DEFAULT_SETTINGS } from '../journal'
import { EMPTY_DOCS } from '../growthApi'
import type { Txn } from '../statements'
import { monthFigures, prevMonth, takeaways } from './review'

const t = (date: string, category: string, debit: number, credit = 0, description = category): Txn => ({ id: date + category + debit, statementId: 's', accountKey: 'a', date, description, merchant: category, debit, credit, category })
const base = { tags: {}, snapshots: [], health: [], settings: DEFAULT_SETTINGS, rules: EMPTY_DOCS.guardrails }

describe('monthly review', () => {
  const txns = [
    t('2026-08-03', 'Shopping', 4000), t('2026-08-05', 'Rent', 20000), t('2026-08-01', 'Salary', 0, 90000),
    t('2026-09-03', 'Shopping', 9000), t('2026-09-05', 'Rent', 20000), t('2026-09-10', 'Transfer', 50000), t('2026-09-12', 'Trading', 30000),
  ]
  const trades = [{ ...blankTrade('2026-09-15'), grossPnl: -12000 }]
  const input = { ...base, txns, trades, budgets: { Shopping: 5000, Rent: 25000 }, snapshots: [{ month: '2026-08', net: 100000 }, { month: '2026-09', net: 80000 }] as never }

  const sep = monthFigures('2026-09', input)
  const aug = monthFigures('2026-08', input)

  it('counts real spending only, and finds categories over budget', () => {
    expect(sep.spend).toBe(29000)
    expect(sep.overBudget).toEqual([{ category: 'Shopping', spent: 9000, limit: 5000 }])
    expect(sep.brokerNet).toBe(30000)
    expect(sep.tradingPnl).toBe(-12000)
    expect(aug.income).toBe(90000)
  })

  it('picks the three biggest takeaways', () => {
    const list = takeaways(sep, aug)
    expect(list).toHaveLength(3)
    expect(list.map((x) => x.key)).toEqual(['netWorthDown', 'tradingLoss', 'wantsUp'])
  })

  it('steps back a month across a year boundary', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
  })
})
