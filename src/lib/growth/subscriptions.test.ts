import { describe, expect, it } from 'vitest'
import type { Txn } from '../statements'
import { buildSubscriptions } from './subscriptions'

const t = (date: string, merchant: string, debit: number, category = 'Subscriptions'): Txn => ({ id: date + merchant, statementId: 's', accountKey: 'a', date, description: merchant, merchant, debit, credit: 0, category })
const EMPTY = { cancelled: [], ignored: [] }

const txns = [
  t('2026-06-05', 'Netflix', 499), t('2026-07-05', 'Netflix', 499), t('2026-08-05', 'Netflix', 499), t('2026-09-05', 'Netflix', 649),
  t('2026-03-10', 'Spotify', 119), t('2026-04-10', 'Spotify', 119), t('2026-05-10', 'Spotify', 119),
  t('2026-07-01', 'Grocer', 900, 'Groceries'), t('2026-08-01', 'Grocer', 900, 'Groceries'), t('2026-09-01', 'Grocer', 900, 'Groceries'),
  t('2025-01-15', 'Star Health', 18000, 'Insurance'), t('2026-01-14', 'Star Health', 18500, 'Insurance'),
]

describe('buildSubscriptions', () => {
  const r = buildSubscriptions(txns, EMPTY, '2026-09-29')

  it('finds monthly and yearly charges with their yearly cost', () => {
    const byName = Object.fromEntries(r.subscriptions.map((s) => [s.merchant, s]))
    expect(byName.Netflix.cadence).toBe('monthly')
    expect(byName.Netflix.yearlyCost).toBeGreaterThan(6000)
    expect(byName['Star Health'].cadence).toBe('yearly')
    expect(byName.Grocer).toBeUndefined()
    expect(Math.round(byName['Star Health'].yearlyCost)).toBe(18300)
  })

  it('marks a charge that has stopped and leaves it out of the totals', () => {
    expect(r.subscriptions.find((s) => s.merchant === 'Spotify')!.status).toBe('stopped')
    expect(r.activeCount).toBe(2)
    expect(r.priceRises).toBe(1)
  })

  it('applies hide and cancel choices and adds up the savings', () => {
    const r2 = buildSubscriptions(txns, { cancelled: [{ key: 'netflix', date: '2026-09-20', yearly: 7788 }], ignored: ['star health'] }, '2026-09-29')
    expect(r2.subscriptions.map((s) => s.merchant)).toEqual(['Spotify'])
    expect(r2.savedPerYear).toBe(7788)
  })
})
