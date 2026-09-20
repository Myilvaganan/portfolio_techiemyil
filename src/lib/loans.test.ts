import { describe, expect, it } from 'vitest'
import s1 from './fixtures/loans/schedule1.txt?raw'
import s2 from './fixtures/loans/schedule2.txt?raw'
import st1 from './fixtures/loans/statement1.txt?raw'
import st2 from './fixtures/loans/statement2.txt?raw'
import { parseLoanDocument } from './loanParser'
import {
  addMonths,
  baseline,
  bestLumpTarget,
  buildAdvice,
  buildLoans,
  closeByDate,
  extraEmiImpact,
  foreclosure,
  foreclosureTimeline,
  loanAiContext,
  pmt,
  prepayImpact,
  simulate,
  simulatePortfolio,
  totals,
  xirr,
  type LoanDoc,
} from './loans'

let n = 0
const doc = (text: string, name: string): LoanDoc => {
  const r = parseLoanDocument(text.split('\n'))
  if (!r.ok) throw new Error(r.error)
  return { id: `d${++n}`, kind: 'loan', docType: r.doc.docType, accountNo: r.doc.accountNo, filename: name, uploadedAt: `2026-09-20T10:0${n}:00Z`, pages: 2, fileKey: 'k', parsed: r.doc }
}
const docs = [doc(s1, 's1'), doc(st1, 'st1'), doc(s2, 's2'), doc(st2, 'st2')]
const [a, b] = buildLoans(docs, '2026-09-20')

describe('building loans from documents', () => {
  it('merges each loan’s schedule and statement', () => {
    expect(a.accountNo).toBe('LPBNG00000000001')
    expect(b.accountNo).toBe('LPBNG00000000002')
    expect(a).toMatchObject({ hasSchedule: true, hasStatement: true, principal: 1500000, ratePct: 9.99, tenure: 72, emi: 27905, paidCount: 11, outstanding: 1330407, accrued: 5538, endDate: '2031-10-05', bounces: 1, processingFee: 10618.82 })
    expect(b).toMatchObject({ paidCount: 4, outstanding: 1437200, emi: 27782, endDate: '2032-05-05', bounces: 0 })
    expect(a.label).toBe('Personal Loan ••0001')
  })

  it('marks paid, next-due and upcoming instalments', () => {
    expect(a.schedule.filter((r) => r.status === 'paid')).toHaveLength(11)
    expect(a.schedule[10].status).toBe('paid')
    expect(a.schedule[11]).toMatchObject({ status: 'due', no: 12, date: '2026-10-05' })
    expect(a.schedule[12].status).toBe('upcoming')
    expect(a.nextDue?.no).toBe(12)
    expect(a.daysToNextDue).toBe(15)
    expect(b.schedule.filter((r) => r.status === 'paid')).toHaveLength(4)
  })

  it('totals interest and principal correctly', () => {
    expect(a.paidPrincipal + a.schedule.filter((r) => r.status !== 'paid').reduce((s, r) => s + r.principal, 0)).toBe(1500000)
    expect(a.paidInterest + a.remainingInterest).toBeCloseTo(a.totalInterest, 2)
    expect(a.remainingPayable).toBeCloseTo(1702061 - 0, -3)
    expect(a.penalties).toBeCloseTo(590 + 12 + 31, 2)
  })

  it('finds the real annual cost once the processing fee is included', () => {
    expect(a.effectiveRatePct).toBeGreaterThan(9.99)
    expect(a.effectiveRatePct).toBeLessThan(11.5)
  })

  it('falls back to a rebuilt schedule when only the statement was uploaded', () => {
    const [only] = buildLoans([docs[1]], '2026-09-20')
    expect(only.hasSchedule).toBe(false)
    expect(only.scheduleEstimated).toBe(true)
    expect(only.schedule.length).toBeGreaterThan(60)
    expect(only.schedule.filter((r) => r.status === 'paid')).toHaveLength(11)
  })

  it('works from the schedule alone using dates', () => {
    const [only] = buildLoans([docs[0]], '2026-09-20')
    expect(only.hasStatement).toBe(false)
    expect(only.paidCount).toBe(11)
    expect(only.outstanding).toBe(1330407)
  })
})

describe('amortization simulator', () => {
  it('reproduces the bank’s remaining schedule closely', () => {
    const base = baseline(a)
    expect(base.months).toBe(61)
    expect(base.endDate).toBe('2031-10-05')
    expect(Math.abs(base.totalInterest - a.remainingInterest)).toBeLessThan(a.remainingInterest * 0.005)
    expect(base.rows[0].interest).toBeCloseTo(11076, 0)
  })

  it('pmt and addMonths behave', () => {
    expect(pmt(1500000, 9.99, 72)).toBeCloseTo(27782, -1)
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-10-05', 3)).toBe('2027-01-05')
  })

  it('flags an EMI that cannot repay the loan', () => {
    const sim = simulate({ balance: 1000000, ratePct: 12, emi: 5000, firstDue: '2026-10-05' })
    expect(sim.feasible).toBe(false)
  })

  it('xirr recovers a known rate', () => {
    const flows = [{ date: '2026-01-01', amount: 1000 }, { date: '2027-01-01', amount: -1100 }]
    expect(xirr(flows)).toBeCloseTo(10, 1)
  })
})

describe('calculators', () => {
  it('a lump sum that keeps the EMI ends the loan sooner and saves interest', () => {
    const r = prepayImpact(a, 100000, 'tenure')
    expect(r.fee).toBeCloseTo(100000 * 0.04 * 1.18, 2)
    expect(r.monthsSaved).toBeGreaterThanOrEqual(3)
    expect(r.interestSaved).toBeGreaterThan(20000)
    expect(r.netSaving).toBeCloseTo(r.interestSaved - r.fee, 2)
    expect(r.after.months).toBe(r.base.months - r.monthsSaved)
  })

  it('a lump sum that lowers the EMI keeps the end date', () => {
    const r = prepayImpact(a, 100000, 'emi')
    expect(r.newEmi).toBeLessThan(a.emi)
    expect(r.after.months).toBe(r.base.months)
    expect(r.interestSaved).toBeGreaterThan(0)
  })

  it('shortening the tenure saves more interest than lowering the EMI for the same amount', () => {
    expect(prepayImpact(a, 100000, 'tenure').interestSaved).toBeGreaterThan(prepayImpact(a, 100000, 'emi').interestSaved)
  })

  it('caps a lump sum at the outstanding balance', () => {
    const r = prepayImpact(a, 99999999, 'tenure')
    expect(r.after.months).toBe(0)
    expect(r.interestSaved).toBeCloseTo(r.base.totalInterest, 2)
  })

  it('extra EMI shortens the loan', () => {
    const r = extraEmiImpact(a, 5000)
    expect(r.monthsSaved).toBeGreaterThan(5)
    expect(r.interestSaved).toBeGreaterThan(30000)
    expect(extraEmiImpact(a, 0).monthsSaved).toBe(0)
  })

  it('foreclosure uses the statement’s own receivable and the future instalments', () => {
    const f = foreclosure(a, { feePct: 4, gstPct: 18 })
    expect(f.outstanding + f.accrued).toBe(1335945)
    expect(f.remainingIfContinue).toBe(1702061)
    expect(f.fee).toBeCloseTo(1330407 * 0.04 * 1.18, 2)
    expect(f.total).toBeCloseTo(1335945 + f.fee, 2)
    expect(f.netSaving).toBeCloseTo(1702061 - f.total, 2)
    expect(foreclosure(a, { feePct: 0, gstPct: 0 }).netSaving).toBeGreaterThan(f.netSaving)
  })

  it('closing later saves less (the interest left to avoid shrinks)', () => {
    const t = foreclosureTimeline(a)
    expect(t[0].netSaving).toBeGreaterThan(t[20].netSaving)
    expect(t[20].netSaving).toBeGreaterThan(t[50].netSaving)
    expect(t[0].k).toBe(0)
  })

  it('works out what it takes to be debt-free by a date', () => {
    const r = closeByDate(a, '2029-10-05')
    expect(r.extraMonthly).not.toBeNull()
    expect(r.extraMonthly!).toBeGreaterThan(0)
    const check = simulate({ balance: a.outstanding, ratePct: a.ratePct, emi: a.emi, firstDue: '2026-10-05', extra: r.extraMonthly! })
    expect(check.months).toBeLessThanOrEqual(r.months)
    expect(r.lumpNow).not.toBeNull()
    expect(closeByDate(a, '2031-10-05').extraMonthly).toBe(0)
  })

  it('ranks where a lump sum saves the most: the loan with more months left', () => {
    const [best, other] = bestLumpTarget([a, b], 200000)
    expect(best.loan.accountNo).toBe(b.accountNo)
    expect(best.impact.netSaving).toBeGreaterThan(other.impact.netSaving)
  })

  it('rolling freed EMIs into the next loan finishes sooner and cheaper', () => {
    const none = simulatePortfolio([a, b], 0, 'none')
    const roll = simulatePortfolio([a, b], 5000, 'rate')
    expect(roll.months).toBeLessThan(none.months)
    expect(roll.totalInterest).toBeLessThan(none.totalInterest)
    expect(none.closed).toHaveLength(2)
    expect(none.endDate).toBe('2032-05-05')
    const rollOnly = simulatePortfolio([a, b], 0, 'balance')
    expect(rollOnly.months).toBeLessThan(none.months)
  })
})

describe('advice and AI context', () => {
  it('produces numbers-backed advice for two loans', () => {
    const advice = buildAdvice([a, b])
    const text = advice.map((x) => `${x.title} ${x.detail}`).join('\n')
    expect(advice.length).toBeGreaterThanOrEqual(5)
    expect(text).toMatch(/Personal Loan ••0002 first/)
    expect(text).toMatch(/bounce/i)
    expect(text).toMatch(/pre-closure/i)
    expect(advice.every((x) => x.detail.length > 30)).toBe(true)
  })

  it('totals both loans', () => {
    const t = totals([a, b])
    expect(t.outstanding).toBe(1330407 + 1437200)
    expect(t.emi).toBe(27905 + 27782)
    expect(t.debtFreeDate).toBe('2032-05-05')
  })

  it('builds a compact AI context without identifiers', () => {
    const ctx = JSON.stringify(loanAiContext([a, b]))
    expect(ctx.length).toBeLessThan(6000)
    expect(ctx).not.toMatch(/LPBNG|PAN|@/)
    expect(ctx).toContain('closeNow')
  })
})
