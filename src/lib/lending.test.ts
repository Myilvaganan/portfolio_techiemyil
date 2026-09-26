import { describe, expect, it } from 'vitest'
import { blankEntry, lendingNotices, owedOn, passThrough, summarize, type LendingEntry } from './lending'

const entry = (over: Partial<LendingEntry> = {}): LendingEntry => ({ ...blankEntry('2025-01-01'), id: 'a1', name: 'Ravi', amount: 100000, createdAt: '', updatedAt: '', ...over })

describe('ledger', () => {
  it('subtracts repayments and reports settled, open and overdue', () => {
    const e = entry({ repayments: [{ id: 'r', date: '2025-03-01', amount: 40000, note: '' }], dueDate: '2025-06-01' })
    expect(owedOn(e, '2025-05-01')).toMatchObject({ received: 40000, outstanding: 60000, status: 'open' })
    expect(owedOn(e, '2025-07-01')).toMatchObject({ outstanding: 60000, status: 'overdue', overdueDays: 30 })
    expect(owedOn({ ...e, repayments: [{ id: 'r', date: '2025-03-01', amount: 100000, note: '' }] }, '2025-07-01').status).toBe('settled')
  })

  it('adds simple interest from the date lent when a rate was agreed', () => {
    const o = owedOn(entry({ interestRatePct: 12 }), '2026-01-01')
    expect(o.interest).toBe(12000)
    expect(o.outstanding).toBe(112000)
  })

  it('totals what is owed and flags late payers for the bell', () => {
    const list = [entry(), entry({ id: 'b2', name: 'Meena', amount: 50000, dueDate: '2025-02-01' }), entry({ id: 'c3', name: 'Done', amount: 10000, repayments: [{ id: 'x', date: '2025-01-02', amount: 10000, note: '' }] })]
    const s = summarize(list, '2025-03-01')
    expect(s).toMatchObject({ totalLent: 160000, totalReceived: 10000, totalOwed: 150000, openCount: 2, overdueCount: 1, overdueAmount: 50000 })
    expect(lendingNotices(list, '2025-03-01', (n) => `₹${n}`)[0]).toMatchObject({ title: 'Meena is 28 days late', detail: '₹50000 was due on 2025-02-01.' })
  })
})

describe('pass-through calculator', () => {
  // ₹15 lakh borrowed at 9.99% for 6 years; ₹6.5 lakh of it went to someone else.
  const loan = { loanAmount: 1500000, ratePct: 9.99, tenureMonths: 72, firstEmiDate: '2024-06-05' }

  it("works out the EMI and the person's share of it", () => {
    const r = passThrough(loan, 650000, 0, '2024-05-01')
    expect(r.emi).toBeGreaterThan(27700)
    expect(r.emi).toBeLessThan(27900)
    expect(r.share).toBeCloseTo(650000 / 1500000, 6)
    expect(r.theirMonthlyEmi + r.myMonthlyEmi).toBeCloseTo(r.emi, 1)
    expect(r.theirMonthlyEmi).toBeCloseTo(r.emi * (13 / 30), 0)
    expect(r.instalmentsDue).toBe(0)
    expect(r.next?.date).toBe('2024-06-05')
    expect(r.endDate).toBe('2030-05-05')
  })

  it('their whole share is repaid exactly by the end and the loan clears to zero', () => {
    const r = passThrough(loan, 650000, 0, '2031-01-01')
    expect(r.instalmentsDue).toBe(72)
    expect(r.rows[71].theirBalance).toBe(0)
    expect(r.theirPrincipalPaid).toBeCloseTo(650000, 0)
    expect(r.totalOverTenure).toBeCloseTo(r.theirPrincipalPaid + r.theirInterestPaid, 0)
    expect(r.next).toBeNull()
  })

  it('shows what they owe today: EMIs due so far minus what they paid, plus the settle-today figure', () => {
    const r = passThrough(loan, 650000, 60000, '2025-06-10')
    expect(r.instalmentsDue).toBe(13)
    expect(r.dueSoFar).toBeCloseTo(r.theirMonthlyEmi * 13, 0)
    expect(r.arrears).toBeCloseTo(r.dueSoFar - 60000, 1)
    expect(r.ahead).toBe(0)
    expect(r.monthsBehind).toBe(Math.floor(r.arrears / r.theirMonthlyEmi))
    expect(r.theirOutstandingPrincipal).toBeLessThan(650000)
    expect(r.settleToday).toBeCloseTo(r.arrears + r.theirOutstandingPrincipal, 1)
  })

  it('reports paying ahead instead of a negative balance', () => {
    const r = passThrough(loan, 650000, 400000, '2025-06-10')
    expect(r.arrears).toBe(0)
    expect(r.ahead).toBeGreaterThan(0)
  })

  it('handles a loan with no interest and a share above the loan', () => {
    const free = passThrough({ loanAmount: 120000, ratePct: 0, tenureMonths: 12, firstEmiDate: '2025-01-10' }, 60000, 0, '2025-03-15')
    expect(free.emi).toBe(10000)
    expect(free.theirMonthlyEmi).toBe(5000)
    expect(free.dueSoFar).toBe(15000)
    expect(passThrough({ ...loan, loanAmount: 100000 }, 500000, 0, '2025-01-01').share).toBe(1)
  })
})
