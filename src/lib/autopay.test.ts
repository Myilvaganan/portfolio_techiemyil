import { describe, expect, it } from 'vitest'
import { checkAutopay } from './autopay'
import type { Loan } from './loans'
import type { Txn } from './statements'

const loan = { label: 'Personal Loan', short: 'PL', schedule: [{ date: '2026-09-05', installment: 27905, status: 'paid' }, { date: '2026-08-05', installment: 27905, status: 'paid' }, { date: '2026-10-05', installment: 27905, status: 'due' }] } as unknown as Loan
const debit = (date: string, amount: number) => ({ date, debit: amount, credit: 0 }) as Txn

describe('autopay check', () => {
  it('matches debits near the due date and flags missing ones once statements cover them', () => {
    const r = checkAutopay([loan], [debit('2026-09-06', 27905), debit('2026-09-20', 100)], '2026-10-01')
    // August is outside the five-week window; October isn't due yet.
    expect(r).toEqual([{ loan: 'Personal Loan', date: '2026-09-05', amount: 27905, status: 'paid', paidOn: '2026-09-06' }])
    expect(checkAutopay([loan], [debit('2026-09-20', 100)], '2026-10-01')[0].status).toBe('missing')
  })
  it('waits when no statement covers the date yet', () => {
    expect(checkAutopay([loan], [debit('2026-09-01', 50)], '2026-10-01')[0].status).toBe('waiting')
  })
})
