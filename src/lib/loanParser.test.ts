import { describe, expect, it } from 'vitest'
import s1 from './fixtures/loans/schedule1.txt?raw'
import s2 from './fixtures/loans/schedule2.txt?raw'
import st1 from './fixtures/loans/statement1.txt?raw'
import st2 from './fixtures/loans/statement2.txt?raw'
import { parseLoanDocument } from './loanParser'
import type { ParsedSchedule, ParsedStatement } from './loanTypes'

const lines = (t: string) => t.split('\n')
const ok = (t: string) => {
  const r = parseLoanDocument(lines(t))
  if (!r.ok) throw new Error(r.error)
  return r.doc
}

describe('loan amortization schedule', () => {
  it('reads all 72 instalments and the account number', () => {
    const doc = ok(s1) as ParsedSchedule
    expect(doc.docType).toBe('schedule')
    expect(doc.accountNo).toBe('LPBNG00000000001')
    expect(doc.rows).toHaveLength(72)
    expect(doc.rows[0]).toEqual({ no: 1, date: '2025-11-05', opening: 1500000, principal: 8757, installment: 27905, ratePct: 0, interest: 19148, charges: 0, closing: 1491243 })
    expect(doc.rows[71]).toMatchObject({ no: 72, date: '2031-10-05', closing: 0, installment: 27761 })
  })

  it('is internally consistent: principal totals the loan and each balance carries over', () => {
    for (const t of [s1, s2]) {
      const rows = (ok(t) as ParsedSchedule).rows
      expect(rows.reduce((s, r) => s + r.principal, 0)).toBe(1500000)
      for (let i = 1; i < rows.length; i++) expect(rows[i].opening).toBe(rows[i - 1].closing)
      for (const r of rows) expect(Math.abs(r.opening - r.principal - r.closing)).toBeLessThanOrEqual(1)
    }
    expect((ok(s2) as ParsedSchedule).accountNo).toBe('LPBNG00000000002')
  })

  it('tolerates pipe-separated cells from the PDF text extractor', () => {
    const piped = lines(s1).map((l) => l.replace(/^(\d+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+)$/, '$1 | $2 | $3 | $4 | $5 | $6 | $7 | $8 | $9'))
    const r = parseLoanDocument(piped)
    expect(r.ok && (r.doc as ParsedSchedule).rows.length).toBe(72)
  })
})

describe('loan account statement', () => {
  const doc = ok(st1) as ParsedStatement

  it('reads the loan terms', () => {
    expect(doc.accountNo).toBe('LPBNG00000000001')
    expect(doc.details).toMatchObject({
      asOf: '2026-09-20',
      sanctionDate: '2025-09-19',
      amount: 1500000,
      ratePct: 9.99,
      penalPct: 5,
      paidCount: 11,
      paidAmount: 306955,
      pendingCount: 0,
      futureCount: 61,
      futureAmount: 1702061,
      tenure: 72,
      emi: 27905,
      product: 'PERSONAL LOAN',
      rateType: 'Fixed',
      status: 'Active',
      repayment: 'AUTO DEBIT',
    })
  })

  it('reads the finance summary', () => {
    expect(doc.summary).toMatchObject({ debitPrincipal: 169593, debitInterest: 137362, debitOverdueInterest: 31, debitBounce: 590, debitOther: 10630.82, debitTotal: 318206.82, accruedInterest: 5538, futurePrincipal: 1330407, totalReceivable: 1335945 })
  })

  it('reads payments, fees and the bounced EMI', () => {
    const by = (t: string) => doc.events.filter((e) => e.type === t)
    expect(by('emi_due')).toHaveLength(11)
    expect(by('receipt').length).toBeGreaterThanOrEqual(11)
    expect(by('processing_fee')).toEqual([{ date: '2025-09-19', type: 'processing_fee', amount: 10618.82, note: 'Pf Recd Frm Cust-nirr-nded' }])
    expect(by('disbursement')[0]).toMatchObject({ amount: 1500000, date: '2025-09-19' })
    expect(by('bounce')).toEqual([{ date: '2026-05-06', type: 'bounce', amount: 27905 }])
    expect(by('bounce_charge')[0]).toMatchObject({ amount: 590, date: '2026-05-06' })
    expect(by('penal')[0]).toMatchObject({ amount: 12 })
    expect(by('overdue_interest')[0]).toMatchObject({ amount: 31, instNo: 7 })
    expect(by('emi_due').map((e) => e.instNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('reads the second loan and has no bounce', () => {
    const d2 = ok(st2) as ParsedStatement
    expect(d2.accountNo).toBe('LPBNG00000000002')
    expect(d2.details).toMatchObject({ amount: 1500000, paidCount: 4, futureCount: 68, emi: 27782, sanctionDate: '2026-05-07' })
    expect(d2.summary?.futurePrincipal).toBe(1437200)
    expect(d2.events.filter((e) => e.type === 'bounce')).toHaveLength(0)
  })

  it('never returns personal details', () => {
    const json = JSON.stringify(ok(st1)) + JSON.stringify(ok(st2))
    expect(json).not.toMatch(/PAN|@|Mob|Tel|Test User|Bangalore|Address/i)
  })
})

describe('unrecognised files', () => {
  it('says what is wrong', () => {
    expect(parseLoanDocument(['hello world'])).toMatchObject({ ok: false })
    expect(parseLoanDocument(['Loan Account Statement for LPBNG00000000009', 'nothing else'])).toMatchObject({ ok: false })
  })
})
