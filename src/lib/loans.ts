// Loan analytics: merges the schedule + statement PDFs of each loan and answers "what if I pay it off sooner?".

import type { AiInsights } from './statements'
import type { LoanEvent, LoanSummary, ParsedLoanDoc, ScheduleRow, StatementDetails } from './loanTypes'

export interface LoanDoc {
  id: string
  kind: 'loan'
  docType: 'schedule' | 'statement'
  accountNo: string
  filename: string
  uploadedAt: string
  pages: number
  fileKey: string
  parsed: ParsedLoanDoc
}

export interface LoanData {
  statements: LoanDoc[]
  insights: AiInsights | null
}

export type InstallmentStatus = 'paid' | 'due' | 'overdue' | 'upcoming'

export interface ScheduleLine extends ScheduleRow {
  status: InstallmentStatus
}

export interface Loan {
  accountNo: string
  short: string
  label: string
  asOf: string
  docIds: string[]
  hasSchedule: boolean
  hasStatement: boolean
  scheduleEstimated: boolean
  details: StatementDetails | null
  summary: LoanSummary | null
  events: LoanEvent[]
  schedule: ScheduleLine[]
  principal: number
  ratePct: number
  tenure: number
  emi: number
  sanctionDate: string
  paidCount: number
  outstanding: number
  accrued: number
  nextDue: ScheduleLine | null
  daysToNextDue: number | null
  endDate: string
  totalInterest: number
  totalPayable: number
  paidInterest: number
  paidPrincipal: number
  remainingInterest: number
  remainingPayable: number
  processingFee: number
  penalties: number
  bounces: number
  effectiveRatePct: number | null
}

// ---------- Dates & money helpers ----------

const p2 = (n: number) => String(n).padStart(2, '0')
export const today = () => new Date().toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(Math.min(d, last))}`
}

export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
export const monthsBetween = (a: string, b: string) => {
  const [y1, m1] = a.split('-').map(Number)
  const [y2, m2] = b.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

// ---------- Amortization ----------

export interface SimRow {
  no: number
  date: string
  opening: number
  interest: number
  principal: number
  payment: number
  closing: number
}

export interface Sim {
  rows: SimRow[]
  months: number
  totalInterest: number
  totalPaid: number
  endDate: string | null
  feasible: boolean
}

export function pmt(balance: number, ratePct: number, months: number): number {
  const r = ratePct / 1200
  if (months <= 0) return balance
  if (r === 0) return balance / months
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

// Month by month on a reducing balance at rate/12 — the way ICICI's schedule works after the first (broken-period) EMI.
export function simulate(o: { balance: number; ratePct: number; emi: number; firstDue: string; extra?: number; lump?: number; maxMonths?: number }): Sim {
  const r = o.ratePct / 1200
  const max = o.maxMonths ?? 600
  let balance = Math.max(0, o.balance - (o.lump ?? 0))
  const pay = o.emi + (o.extra ?? 0)
  const rows: SimRow[] = []
  let totalInterest = 0
  let totalPaid = 0
  if (balance <= 0.005) return { rows, months: 0, totalInterest: 0, totalPaid: 0, endDate: null, feasible: true }
  if (pay <= balance * r + 0.005) return { rows, months: Infinity, totalInterest: Infinity, totalPaid: Infinity, endDate: null, feasible: false }
  for (let i = 0; i < max && balance > 0.005; i++) {
    const interest = round2(balance * r)
    const payment = Math.min(balance + interest, pay)
    const principal = round2(payment - interest)
    const closing = round2(Math.max(0, balance - principal))
    rows.push({ no: i + 1, date: addMonths(o.firstDue, i), opening: balance, interest, principal, payment, closing })
    totalInterest += interest
    totalPaid += payment
    balance = closing
  }
  return { rows, months: rows.length, totalInterest: round2(totalInterest), totalPaid: round2(totalPaid), endDate: rows.at(-1)?.date ?? null, feasible: balance <= 0.005 }
}

// XIRR: the annual rate that makes the cash flows net to zero (Actual/365).
export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null
  const t0 = flows[0].date
  const npv = (rate: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, daysBetween(t0, f.date) / 365), 0)
  let lo = -0.9
  let hi = 5
  if (npv(lo) * npv(hi) > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (npv(lo) * npv(mid) <= 0) hi = mid
    else lo = mid
  }
  return ((lo + hi) / 2) * 100
}

// ---------- Building a loan from its documents ----------

const latest = <T extends { uploadedAt: string }>(xs: T[]) => [...xs].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)).at(-1)

export function buildLoans(docs: LoanDoc[], now = today()): Loan[] {
  const accounts = [...new Set(docs.map((d) => d.accountNo))]
  return accounts.map((accountNo) => buildLoan(accountNo, docs.filter((d) => d.accountNo === accountNo), now)).sort((a, b) => a.sanctionDate.localeCompare(b.sanctionDate))
}

function buildLoan(accountNo: string, docs: LoanDoc[], now: string): Loan {
  const sched = latest(docs.filter((d) => d.docType === 'schedule'))
  const stmt = latest(docs.filter((d) => d.docType === 'statement'))
  const rawRows = sched && sched.parsed.docType === 'schedule' ? sched.parsed.rows : []
  const details = stmt && stmt.parsed.docType === 'statement' ? stmt.parsed.details : null
  const summary = stmt && stmt.parsed.docType === 'statement' ? stmt.parsed.summary : null
  const events = stmt && stmt.parsed.docType === 'statement' ? stmt.parsed.events : []

  const asOf = details?.asOf ?? now
  const principal = details?.amount ?? rawRows[0]?.opening ?? 0
  const emi = details?.emi ?? rawRows[1]?.installment ?? rawRows[0]?.installment ?? 0
  const ratePct = details?.ratePct ?? (rawRows[1] ? round2((rawRows[1].interest / rawRows[1].opening) * 1200) : 0)
  const tenure = details?.tenure ?? rawRows.length
  const sanctionDate = details?.sanctionDate ?? (rawRows[0] ? addMonths(rawRows[0].date, -1) : asOf)

  let rows: ScheduleRow[] = rawRows
  let scheduleEstimated = false
  if (!rows.length && details && tenure && emi) {
    // No schedule uploaded: rebuild an approximate one from the loan terms.
    const firstDue = events.find((e) => e.type === 'emi_due')?.date ?? addMonths(sanctionDate, 1)
    const sim = simulate({ balance: principal, ratePct, emi, firstDue })
    rows = sim.rows.map((x) => ({ no: x.no, date: x.date, opening: x.opening, principal: x.principal, installment: x.payment, ratePct: 0, interest: x.interest, charges: 0, closing: x.closing }))
    scheduleEstimated = true
  }

  const paidCount = details ? details.paidCount : rows.filter((r) => r.date <= asOf).length
  const overdueCount = details?.pendingCount ?? 0
  const schedule: ScheduleLine[] = rows.map((r, i) => ({
    ...r,
    status: i < paidCount ? 'paid' : i < paidCount + overdueCount ? 'overdue' : i === paidCount + overdueCount ? 'due' : 'upcoming',
  }))
  const nextDue = schedule.find((r) => r.status !== 'paid') ?? null
  const paidRows = schedule.filter((r) => r.status === 'paid')
  const unpaid = schedule.filter((r) => r.status !== 'paid')
  const outstanding = summary?.futurePrincipal ?? (paidRows.length ? paidRows[paidRows.length - 1].closing : principal)
  const lastPaidDate = paidRows.at(-1)?.date ?? sanctionDate
  const accrued = summary?.accruedInterest ?? round2((outstanding * ratePct) / 100 / 360 * Math.min(30, Math.max(0, daysBetween(lastPaidDate, asOf))))

  const processingFee = sum(events.filter((e) => e.type === 'processing_fee').map((e) => e.amount))
  const penalties = sum(events.filter((e) => e.type === 'bounce_charge' || e.type === 'penal' || e.type === 'overdue_interest').map((e) => e.amount))
  const bounces = events.filter((e) => e.type === 'bounce').length

  const flows =
    rows.length > 0
      ? [{ date: sanctionDate, amount: principal - processingFee }, ...rows.map((r) => ({ date: r.date, amount: -r.installment }))]
      : []

  const short = accountNo.slice(-4)
  return {
    accountNo,
    short,
    label: `${details?.product ? titleCase(details.product) : 'Loan'} ••${short}`,
    asOf,
    docIds: docs.map((d) => d.id),
    hasSchedule: rawRows.length > 0,
    hasStatement: Boolean(details),
    scheduleEstimated,
    details,
    summary,
    events,
    schedule,
    principal,
    ratePct,
    tenure,
    emi,
    sanctionDate,
    paidCount,
    outstanding,
    accrued,
    nextDue,
    daysToNextDue: nextDue ? daysBetween(asOf, nextDue.date) : null,
    endDate: rows.at(-1)?.date ?? '',
    totalInterest: round2(sum(rows.map((r) => r.interest))),
    totalPayable: round2(sum(rows.map((r) => r.installment))),
    paidInterest: round2(sum(paidRows.map((r) => r.interest))),
    paidPrincipal: round2(sum(paidRows.map((r) => r.principal))),
    remainingInterest: round2(sum(unpaid.map((r) => r.interest))),
    remainingPayable: round2(sum(unpaid.map((r) => r.installment))),
    processingFee: round2(processingFee),
    penalties: round2(penalties),
    bounces,
    effectiveRatePct: flows.length ? xirr(flows) : null,
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

export const remainingMonths = (l: Loan) => l.schedule.filter((r) => r.status !== 'paid').length
export const progressPct = (l: Loan) => (l.principal ? (l.paidPrincipal / l.principal) * 100 : 0)
export const timePct = (l: Loan) => (l.tenure ? (l.paidCount / l.tenure) * 100 : 0)

// ---------- What-if calculators ----------

export interface FeeAssumption {
  feePct: number
  gstPct: number
}

export const DEFAULT_FEE: FeeAssumption = { feePct: 4, gstPct: 18 }

const feeOn = (amount: number, f: FeeAssumption) => round2(amount * (f.feePct / 100) * (1 + f.gstPct / 100))

function firstDueOf(l: Loan) {
  return l.nextDue?.date ?? addMonths(l.asOf, 1)
}

export function baseline(l: Loan): Sim {
  return simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: l.emi, firstDue: firstDueOf(l) })
}

export interface Impact {
  fee: number
  base: Sim
  after: Sim
  newEmi: number
  monthsSaved: number
  interestSaved: number
  netSaving: number
  outflowNow: number
}

// A one-time part-payment now. `tenure` keeps the EMI and finishes sooner; `emi` keeps the end date and lowers the EMI.
export function prepayImpact(l: Loan, lump: number, mode: 'tenure' | 'emi', fee: FeeAssumption = DEFAULT_FEE): Impact {
  const amount = Math.min(Math.max(lump, 0), l.outstanding)
  const base = baseline(l)
  const charge = feeOn(amount, fee)
  let newEmi = l.emi
  let after: Sim
  if (mode === 'emi') {
    const left = base.months
    newEmi = Math.ceil(pmt(l.outstanding - amount, l.ratePct, left))
    after = simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: newEmi, firstDue: firstDueOf(l), lump: amount })
  } else {
    after = simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: l.emi, firstDue: firstDueOf(l), lump: amount })
  }
  const interestSaved = round2(base.totalInterest - after.totalInterest)
  return { fee: charge, base, after, newEmi, monthsSaved: base.months - after.months, interestSaved, netSaving: round2(interestSaved - charge), outflowNow: round2(amount + charge) }
}

export function extraEmiImpact(l: Loan, extra: number): Impact {
  const base = baseline(l)
  const after = simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: l.emi, firstDue: firstDueOf(l), extra: Math.max(extra, 0) })
  const interestSaved = round2(base.totalInterest - after.totalInterest)
  return { fee: 0, base, after, newEmi: l.emi + extra, monthsSaved: base.months - after.months, interestSaved, netSaving: interestSaved, outflowNow: 0 }
}

export interface Foreclosure {
  outstanding: number
  accrued: number
  fee: number
  total: number
  remainingIfContinue: number
  interestIfContinue: number
  netSaving: number
  feePctOfSaving: number
}

export function foreclosure(l: Loan, fee: FeeAssumption = DEFAULT_FEE): Foreclosure {
  const fees = feeOn(l.outstanding, fee)
  const total = round2(l.outstanding + l.accrued + fees)
  const remaining = l.details?.futureAmount ?? l.remainingPayable
  const saving = round2(remaining - total)
  return { outstanding: l.outstanding, accrued: l.accrued, fee: fees, total, remainingIfContinue: remaining, interestIfContinue: round2(remaining - l.outstanding), netSaving: saving, feePctOfSaving: saving + fees > 0 ? (fees / (saving + fees)) * 100 : 0 }
}

// Net saving if you pay k more EMIs and then close (fee is a fixed % of what's still owed).
export function foreclosureTimeline(l: Loan, fee: FeeAssumption = DEFAULT_FEE, maxPoints = 60) {
  const unpaid = l.schedule.filter((r) => r.status !== 'paid')
  const out: { k: number; date: string; outstanding: number; fee: number; netSaving: number }[] = []
  const remainingTotal = sum(unpaid.map((r) => r.installment))
  for (let k = 0; k < Math.min(unpaid.length, maxPoints); k++) {
    const owed = k === 0 ? l.outstanding : unpaid[k - 1].closing
    const chargeFee = feeOn(owed, fee)
    const futureAfter = sum(unpaid.slice(k).map((r) => r.installment))
    const paidExtra = sum(unpaid.slice(0, k).map((r) => r.installment))
    void paidExtra
    out.push({ k, date: k === 0 ? l.asOf : unpaid[k - 1].date, outstanding: owed, fee: chargeFee, netSaving: round2(futureAfter - owed - chargeFee) })
  }
  void remainingTotal
  return out
}

export interface CloseBy {
  targetDate: string
  months: number
  extraMonthly: number | null
  lumpNow: number | null
  extraImpact: Impact | null
  lumpImpact: Impact | null
}

// How much extra per month (or as a lump sum today) is needed to be debt-free by a target date?
export function closeByDate(l: Loan, targetDate: string, fee: FeeAssumption = DEFAULT_FEE): CloseBy {
  const first = firstDueOf(l)
  const months = Math.max(1, monthsBetween(first, targetDate) + 1)
  const fits = (sim: Sim) => sim.feasible && sim.months <= months
  const search = (build: (x: number) => Sim, hi: number) => {
    if (fits(build(0))) return 0
    if (!fits(build(hi))) return null
    let lo = 0
    let top = hi
    for (let i = 0; i < 60; i++) {
      const mid = (lo + top) / 2
      if (fits(build(mid))) top = mid
      else lo = mid
    }
    return Math.ceil(top / 10) * 10
  }
  const extra = search((x) => simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: l.emi, firstDue: first, extra: x }), l.outstanding)
  const lump = search((x) => simulate({ balance: l.outstanding, ratePct: l.ratePct, emi: l.emi, firstDue: first, lump: x }), l.outstanding)
  return {
    targetDate,
    months,
    extraMonthly: extra,
    lumpNow: lump,
    extraImpact: extra === null ? null : extraEmiImpact(l, extra),
    lumpImpact: lump === null ? null : prepayImpact(l, lump, 'tenure', fee),
  }
}

// ---------- Several loans together ----------

export interface Portfolio {
  months: number
  totalInterest: number
  endDate: string | null
  closed: { account: string; label: string; date: string }[]
}

export type PayoffOrder = 'none' | 'rate' | 'balance' | 'longest'

// Everyone pays their EMI; an extra monthly budget (plus the EMIs of loans that have closed) goes to one loan at a time.
export function simulatePortfolio(loans: Loan[], extraMonthly: number, order: PayoffOrder): Portfolio {
  const state = loans.map((l) => ({ l, balance: l.outstanding, r: l.ratePct / 1200, done: false }))
  const start = loans.map((l) => firstDueOf(l)).sort()[0] ?? today()
  const closed: Portfolio['closed'] = []
  let interest = 0
  let months = 0
  const rank = (a: (typeof state)[number], b: (typeof state)[number]) =>
    order === 'rate' ? b.l.ratePct - a.l.ratePct || a.balance - b.balance : order === 'balance' ? a.balance - b.balance : order === 'longest' ? remainingMonths(b.l) - remainingMonths(a.l) : 0
  for (let m = 0; m < 720 && state.some((s) => !s.done); m++) {
    let pool = extraMonthly
    for (const s of state) {
      if (s.done) {
        pool += s.l.emi
        continue
      }
      const i = round2(s.balance * s.r)
      const pay = Math.min(s.balance + i, s.l.emi)
      s.balance = round2(s.balance + i - pay)
      interest += i
    }
    if (order !== 'none') {
      for (const s of state.filter((x) => !x.done && x.balance > 0.005).sort(rank)) {
        if (pool <= 0) break
        const use = Math.min(pool, s.balance)
        s.balance = round2(s.balance - use)
        pool -= use
      }
    }
    months = m + 1
    for (const s of state) {
      if (!s.done && s.balance <= 0.005) {
        s.done = true
        closed.push({ account: s.l.accountNo, label: s.l.label, date: addMonths(start, m) })
      }
    }
  }
  return { months, totalInterest: round2(interest), endDate: months ? addMonths(start, months - 1) : null, closed }
}

export interface LumpChoice {
  loan: Loan
  impact: Impact
  perRupee: number
}

// Where does a lump sum save the most? (Same rate → the loan with more months left wins.)
export function bestLumpTarget(loans: Loan[], lump: number, fee: FeeAssumption = DEFAULT_FEE): LumpChoice[] {
  return loans
    .map((loan) => {
      const impact = prepayImpact(loan, lump, 'tenure', fee)
      const used = Math.min(lump, loan.outstanding)
      return { loan, impact, perRupee: used > 0 ? impact.netSaving / used : 0 }
    })
    .sort((a, b) => b.impact.netSaving - a.impact.netSaving)
}

// ---------- Portfolio totals & advice ----------

export interface Totals {
  outstanding: number
  emi: number
  remainingInterest: number
  totalInterest: number
  paidPrincipal: number
  principal: number
  penalties: number
  fees: number
  debtFreeDate: string
  monthlyInterestNow: number
}

export function totals(loans: Loan[]): Totals {
  return {
    outstanding: round2(sum(loans.map((l) => l.outstanding))),
    emi: round2(sum(loans.map((l) => l.emi))),
    remainingInterest: round2(sum(loans.map((l) => l.remainingInterest))),
    totalInterest: round2(sum(loans.map((l) => l.totalInterest))),
    paidPrincipal: round2(sum(loans.map((l) => l.paidPrincipal))),
    principal: round2(sum(loans.map((l) => l.principal))),
    penalties: round2(sum(loans.map((l) => l.penalties))),
    fees: round2(sum(loans.map((l) => l.processingFee))),
    debtFreeDate: loans.map((l) => l.endDate).filter(Boolean).sort().at(-1) ?? '',
    monthlyInterestNow: round2(sum(loans.map((l) => (l.outstanding * l.ratePct) / 1200))),
  }
}

export interface AdviceItem {
  title: string
  detail: string
  tone: 'good' | 'warn' | 'bad' | 'info'
  impact?: string
}

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`
const monthYear = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const span = (months: number) => `${Math.floor(months / 12) ? `${Math.floor(months / 12)} yr ` : ''}${months % 12 ? `${months % 12} mo` : ''}`.trim() || '0 mo'
const niceDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
export { inr as loanInr, monthYear, span as monthsSpan }

// A ranked playbook computed from the numbers (no AI involved), so every claim can be traced to a calculation.
export function buildAdvice(loans: Loan[], fee: FeeAssumption = DEFAULT_FEE): AdviceItem[] {
  if (!loans.length) return []
  const out: AdviceItem[] = []
  const t = totals(loans)
  const sameRate = new Set(loans.map((l) => l.ratePct)).size === 1

  const sample = Math.max(50000, Math.round((t.emi * 2) / 10000) * 10000)
  if (loans.length > 1) {
    const choice = bestLumpTarget(loans, sample, fee)
    const [best, other] = choice
    out.push({
      title: `Put lump sums into ${best.loan.label} first`,
      detail: `${sameRate ? `Both loans cost ${best.loan.ratePct}%, so the one with more months left saves more. ` : ''}${inr(sample)} on ${best.loan.label} saves ${inr(best.impact.netSaving)} net of fees (${best.impact.monthsSaved} months sooner), versus ${inr(other.impact.netSaving)} on ${other.loan.label}.`,
      tone: 'good',
      impact: `${inr(best.impact.netSaving - other.impact.netSaving)} more saved`,
    })
    const none = simulatePortfolio(loans, 0, 'none')
    const roll = simulatePortfolio(loans, 5000, 'rate')
    out.push({
      title: 'Roll every freed EMI into the next loan',
      detail: `Adding just ₹5,000 a month and re-using each EMI as soon as a loan closes clears everything by ${roll.endDate ? monthYear(roll.endDate) : '—'} instead of ${none.endDate ? monthYear(none.endDate) : '—'}, saving ${inr(none.totalInterest - roll.totalInterest)} in interest.`,
      tone: 'good',
      impact: `${none.months - roll.months} months sooner`,
    })
  } else {
    const extra = extraEmiImpact(loans[0], 5000)
    out.push({ title: 'Add ₹5,000 to every EMI', detail: `It ends the loan ${extra.monthsSaved} months sooner and saves ${inr(extra.interestSaved)} in interest.`, tone: 'good', impact: `${monthsSaved(extra.monthsSaved)} sooner` })
  }

  const fc = foreclosure(loans[0], fee)
  out.push({
    title: 'Check the pre-closure charge before paying anything',
    detail: `Your statement says pre-closure charges apply but doesn't state the rate. At the ${fee.feePct}% (+${fee.gstPct}% GST) assumed here, closing ${loans[0].label} today costs ${inr(fc.fee)} in charges — still leaving a net saving of ${inr(fc.netSaving)}. Ask ICICI for the exact rate and whether part-prepayment is allowed and free after some EMIs; a fee waiver or a lower slab changes the maths.`,
    tone: 'warn',
  })

  const bounced = loans.filter((l) => l.bounces > 0)
  if (bounced.length) {
    const cost = sum(bounced.map((l) => l.penalties))
    out.push({
      title: 'Keep a buffer for the auto-debit',
      detail: `A ${inr(bounced[0].events.find((e) => e.type === 'bounce')?.amount ?? 0)} EMI bounced on ${niceDate(bounced[0].events.find((e) => e.type === 'bounce')?.date ?? bounced[0].asOf)}, costing ${inr(cost)} in bounce, penal and overdue charges — and a bounce can be reported to credit bureaus. Keep at least one extra EMI in the debit account on the 3rd–4th of each month.`,
      tone: 'bad',
      impact: `${inr(cost)} avoidable`,
    })
  }

  const fees = loans.filter((l) => l.processingFee > 0)
  if (fees.length) {
    const l = fees[0]
    out.push({
      title: 'Negotiate the processing fee next time',
      detail: `${loans.length > 1 ? 'Each loan' : 'The loan'} carried a ${inr(l.processingFee)} processing fee (${((l.processingFee / l.principal) * 100).toFixed(2)}% of the amount, GST included). Together with it the real annual cost of ${l.label} is ${l.effectiveRatePct?.toFixed(2) ?? '—'}%, not ${l.ratePct}%.`,
      tone: 'info',
    })
  }

  out.push({
    title: 'Prepaying is a guaranteed return',
    detail: `Every rupee you prepay earns ${loans[0].ratePct}% risk-free (more, once fees are counted). Prefer prepaying over parking money in a savings account or a low-yield deposit — but keep 6 months of expenses liquid first, and don't raid investments that reliably beat ${loans[0].ratePct}% after tax.`,
    tone: 'info',
  })

  out.push({
    title: 'Your interest bill is front-loaded',
    detail: `${inr(t.monthlyInterestNow)} of your combined EMIs each month is interest, and ${inr(t.remainingInterest)} is still to come. Early prepayments cut the most interest — the earlier the extra money goes in, the more it saves.`,
    tone: 'warn',
  })
  return out
}

const monthsSaved = (n: number) => `${n} months`

// ---------- Compact numbers for the AI (no personal details) ----------

export function loanAiContext(loans: Loan[], fee: FeeAssumption = DEFAULT_FEE) {
  const t = totals(loans)
  const none = simulatePortfolio(loans, 0, 'none')
  const roll = simulatePortfolio(loans, 5000, 'rate')
  return {
    currency: 'INR',
    asOf: loans[0]?.asOf,
    assumedPreClosureFee: { percent: fee.feePct, gstPercent: fee.gstPct, note: 'assumption — not stated on the statement' },
    totals: { outstanding: t.outstanding, monthlyEmi: t.emi, interestStillToPay: t.remainingInterest, monthlyInterestNow: t.monthlyInterestNow, debtFreeDate: t.debtFreeDate, penaltiesPaid: t.penalties, processingFees: t.fees },
    loans: loans.map((l) => {
      const fc = foreclosure(l, fee)
      const ex = extraEmiImpact(l, 5000)
      const lump = prepayImpact(l, 100000, 'tenure', fee)
      return {
        loan: l.label,
        amount: l.principal,
        ratePct: l.ratePct,
        effectiveRatePct: l.effectiveRatePct === null ? null : Math.round(l.effectiveRatePct * 100) / 100,
        tenureMonths: l.tenure,
        emi: l.emi,
        paidInstalments: l.paidCount,
        remainingInstalments: remainingMonths(l),
        outstanding: l.outstanding,
        interestPaid: l.paidInterest,
        interestRemaining: l.remainingInterest,
        endDate: l.endDate,
        nextDue: l.nextDue ? { date: l.nextDue.date, amount: l.nextDue.installment } : null,
        bouncedEmis: l.bounces,
        penaltiesPaid: l.penalties,
        processingFee: l.processingFee,
        closeNow: { total: fc.total, netSaving: fc.netSaving },
        extra5000PerMonth: { monthsSaved: ex.monthsSaved, interestSaved: ex.interestSaved },
        lump100000: { monthsSaved: lump.monthsSaved, netSaving: lump.netSaving },
      }
    }),
    strategy: { noExtra: { endDate: none.endDate, interest: none.totalInterest }, extra5000AndRollEmis: { endDate: roll.endDate, interest: roll.totalInterest } },
  }
}

// Short and stable: the server stores this next to the saved insights, so it must survive a round trip unchanged.
export function loanFingerprint(docs: LoanDoc[]): string {
  const text = docs
    .map((d) => `${d.accountNo}:${d.docType}:${d.uploadedAt}`)
    .sort()
    .join('|')
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${docs.length}-${(h >>> 0).toString(16).padStart(8, '0')}`
}
