import { describe, expect, it } from 'vitest'
import { buildReminders, dueReminders, insuranceRenewals, taxReminders } from './reminders'
import type { Txn } from './statements'

const t = (date: string, description: string, debit: number, category = 'Insurance'): Txn => ({ id: date + description, statementId: 's', accountKey: 'a', date, description, merchant: description, debit, credit: 0, category })

describe('reminders', () => {
  it('predicts a yearly insurance renewal and skips monthly premiums', () => {
    const r = insuranceRenewals([t('2025-10-05', 'STAR HEALTH', 18000), t('2026-01-01', 'LIC MONTHLY', 2000), t('2026-02-01', 'LIC MONTHLY', 2000)], '2026-09-26')
    expect(r).toHaveLength(1)
    expect(r[0].date).toBe('2026-10-05')
  })
  it('gives ITR and the four advance-tax dates', () => {
    const r = taxReminders('2026-09-26')
    expect(r.find((x) => x.kind === 'itr')!.date).toBe('2027-07-31')
    expect(r.filter((x) => x.kind === 'advance-tax').map((x) => x.date).sort()).toEqual(['2026-12-15', '2027-03-15', '2027-06-15', '2027-09-15'])
  })
  it('lists what is due soon for the bell', () => {
    const all = buildReminders([], '2026-12-10', [{ id: '1', title: 'FD matures', date: '2026-12-12' }])
    const due = dueReminders(all, '2026-12-10', 7)
    expect(due.map((d) => d.title)).toEqual(['FD matures', 'Advance-tax instalment'])
    expect(due[0].detail).toMatch(/^In 2 days/)
    expect(dueReminders(all, '2026-12-10', 1)).toEqual([])
  })
})
