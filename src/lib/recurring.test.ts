import { describe, expect, it } from 'vitest'
import { detectRecurring } from './recurring'
import type { Txn } from './statements'

let n = 0
const tx = (date: string, merchant: string, debit: number, category = 'Subscriptions', extra: Partial<Txn> = {}): Txn => ({
  id: `t${++n}`,
  statementId: 's1',
  accountKey: 'icici:1234',
  date,
  description: merchant,
  merchant,
  debit,
  credit: 0,
  category,
  ...extra,
})

describe('detectRecurring', () => {
  it('finds a steady monthly subscription and predicts the next due date', () => {
    const txns = [tx('2026-06-03', 'Netflix', 649), tx('2026-07-03', 'Netflix', 649), tx('2026-08-03', 'Netflix', 649)]
    const [r] = detectRecurring(txns)
    expect(r.merchant).toBe('Netflix')
    expect(r.count).toBe(3)
    expect(r.avgAmount).toBe(649)
    expect(r.amountChanged).toBe(false)
    expect(r.nextDueDate).toBe('2026-09-02')
  })

  it('flags a price increase on the latest charge', () => {
    const txns = [tx('2026-06-03', 'Netflix', 649), tx('2026-07-03', 'Netflix', 649), tx('2026-08-03', 'Netflix', 799)]
    const [r] = detectRecurring(txns)
    expect(r.amountChanged).toBe(true)
    expect(r.changePct).toBeCloseTo(23.11, 1)
  })

  it('ignores merchants with too few occurrences', () => {
    const txns = [tx('2026-06-03', 'Netflix', 649), tx('2026-07-03', 'Netflix', 649)]
    expect(detectRecurring(txns)).toEqual([])
  })

  it('ignores charges that are not roughly monthly', () => {
    const txns = [tx('2026-06-01', 'Coffee', 200), tx('2026-06-03', 'Coffee', 200), tx('2026-06-05', 'Coffee', 200)]
    expect(detectRecurring(txns)).toEqual([])
  })

  it('excludes transfers and card payments even if they repeat', () => {
    const txns = [tx('2026-06-03', 'Self', 5000, 'Transfer'), tx('2026-07-03', 'Self', 5000, 'Transfer'), tx('2026-08-03', 'Self', 5000, 'Transfer')]
    expect(detectRecurring(txns)).toEqual([])
  })

  it('finds recurring charges across both bank and card style transactions together', () => {
    const bankRent = [tx('2026-06-01', 'Landlord', 20000, 'Rent'), tx('2026-07-01', 'Landlord', 20000, 'Rent'), tx('2026-08-01', 'Landlord', 20000, 'Rent')]
    const cardCharge = [tx('2026-06-05', 'Spotify', 119, 'Subscriptions'), tx('2026-07-05', 'Spotify', 119, 'Subscriptions'), tx('2026-08-05', 'Spotify', 119, 'Subscriptions')]
    const merchants = detectRecurring([...bankRent, ...cardCharge]).map((r) => r.merchant)
    expect(merchants).toEqual(expect.arrayContaining(['Landlord', 'Spotify']))
  })
})
