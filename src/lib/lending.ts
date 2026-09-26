import { addMonths, daysBetween, pmt } from './loans'

export interface Repayment {
  id: string
  date: string
  amount: number
  note: string
}

/** The loan I took out to lend this money. Their share of each EMI follows from the part of it I passed on. */
export interface PassThroughLoan {
  loanAmount: number
  ratePct: number
  tenureMonths: number
  firstEmiDate: string
}

export interface LendingEntry {
  id: string
  name: string
  phone: string
  amount: number
  date: string
  dueDate: string
  /** Simple interest per year agreed with them, 0 for none. */
  interestRatePct: number
  note: string
  repayments: Repayment[]
  passThrough: PassThroughLoan | null
  createdAt: string
  updatedAt: string
}

export type EntryDraft = Omit<LendingEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export const blankEntry = (date: string): EntryDraft => ({ name: '', phone: '', amount: 0, date, dueDate: '', interestRatePct: 0, note: '', repayments: [], passThrough: null })

// ---------- The ledger ----------

export interface Owed {
  principal: number
  /** Simple interest on the amount lent, from the date lent until today (or until it is settled). */
  interest: number
  received: number
  /** What they still owe today; 0 once settled. */
  outstanding: number
  status: 'settled' | 'overdue' | 'open'
  overdueDays: number
  lastRepayment: Repayment | null
}

export function owedOn(e: Pick<LendingEntry, 'amount' | 'date' | 'dueDate' | 'interestRatePct' | 'repayments'>, today: string): Owed {
  const received = round2(sum(e.repayments.map((r) => r.amount)))
  const days = Math.max(0, daysBetween(e.date, today))
  const interest = round2(e.amount * (e.interestRatePct / 100) * (days / 365))
  const outstanding = Math.max(0, round2(e.amount + interest - received))
  const settled = outstanding < 0.5
  const overdueDays = !settled && e.dueDate && e.dueDate < today ? daysBetween(e.dueDate, today) : 0
  const last = [...e.repayments].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null
  return { principal: e.amount, interest, received, outstanding: settled ? 0 : outstanding, status: settled ? 'settled' : overdueDays > 0 ? 'overdue' : 'open', overdueDays, lastRepayment: last }
}

export interface LendingSummary {
  people: number
  openCount: number
  totalLent: number
  totalReceived: number
  totalOwed: number
  overdueCount: number
  overdueAmount: number
}

export function summarize(entries: LendingEntry[], today: string): LendingSummary {
  const rows = entries.map((e) => ({ e, o: owedOn(e, today) }))
  const open = rows.filter((r) => r.o.status !== 'settled')
  return {
    people: new Set(entries.map((e) => e.name.trim().toLowerCase())).size,
    openCount: open.length,
    totalLent: round2(sum(entries.map((e) => e.amount))),
    totalReceived: round2(sum(rows.map((r) => r.o.received))),
    totalOwed: round2(sum(open.map((r) => r.o.outstanding))),
    overdueCount: rows.filter((r) => r.o.status === 'overdue').length,
    overdueAmount: round2(sum(rows.filter((r) => r.o.status === 'overdue').map((r) => r.o.outstanding))),
  }
}

/** Notices for the bell: money past its due date. */
export function lendingNotices(entries: LendingEntry[], today: string, fmt: (n: number) => string) {
  return entries
    .map((e) => ({ e, o: owedOn(e, today) }))
    .filter((r) => r.o.status === 'overdue')
    .map(({ e, o }) => ({ id: `lend-${e.id}-${e.dueDate}`, title: `${e.name} is ${o.overdueDays} day${o.overdueDays === 1 ? '' : 's'} late`, detail: `${fmt(o.outstanding)} was due on ${e.dueDate}.` }))
}

// ---------- The pass-through calculator ----------

export interface ShareRow {
  no: number
  date: string
  /** The whole EMI on my loan, and their share of it. */
  emi: number
  theirEmi: number
  theirInterest: number
  theirPrincipal: number
  /** Their share of the loan still outstanding after this instalment. */
  theirBalance: number
  due: boolean
}

export interface PassThroughResult {
  /** The part of my loan that went to them (0 to 1). */
  share: number
  emi: number
  theirMonthlyEmi: number
  myMonthlyEmi: number
  instalmentsDue: number
  tenure: number
  /** What they should have paid by today, and what they have actually paid. */
  dueSoFar: number
  paid: number
  /** Positive: they are behind by this much. */
  arrears: number
  /** Positive: they have paid ahead by this much. */
  ahead: number
  monthsBehind: number
  theirPrincipalPaid: number
  theirInterestPaid: number
  /** Their share of my loan's principal that is still outstanding. */
  theirOutstandingPrincipal: number
  /** To close it all today: arrears plus the remaining principal (no further interest). */
  settleToday: number
  totalOverTenure: number
  totalInterest: number
  next: { date: string; amount: number } | null
  endDate: string
  rows: ShareRow[]
  loanTotalInterest: number
}

/**
 * Splits my loan between me and the person I passed part of it to. They pay their proportion of every EMI, so what they
 * owe today is that proportion of the EMIs due so far, less what they have already paid.
 */
export function passThrough(loan: PassThroughLoan, given: number, paid: number, today: string): PassThroughResult {
  const share = loan.loanAmount > 0 ? Math.min(1, Math.max(0, given / loan.loanAmount)) : 0
  const n = loan.tenureMonths
  const r = loan.ratePct / 1200
  const emi = round2(pmt(loan.loanAmount, loan.ratePct, n))

  const rows: ShareRow[] = []
  let balance = loan.loanAmount
  let totalInterest = 0
  for (let i = 1; i <= n; i++) {
    const date = addMonths(loan.firstEmiDate, i - 1)
    const interest = balance * r
    // The last instalment clears whatever is left, so rounding never leaves a stray balance.
    const principal = i === n ? balance : Math.min(balance, emi - interest)
    const instalment = i === n ? principal + interest : emi
    balance = Math.max(0, balance - principal)
    totalInterest += interest
    rows.push({ no: i, date, emi: round2(instalment), theirEmi: round2(instalment * share), theirInterest: round2(interest * share), theirPrincipal: round2(principal * share), theirBalance: round2(balance * share), due: date <= today })
  }

  const dueRows = rows.filter((x) => x.due)
  const dueSoFar = round2(sum(dueRows.map((x) => x.theirEmi)))
  const arrearsRaw = dueSoFar - paid
  const arrears = Math.max(0, round2(arrearsRaw))
  const theirOutstandingPrincipal = dueRows.length ? dueRows[dueRows.length - 1].theirBalance : round2(given)
  const theirMonthlyEmi = round2(emi * share)
  const nextRow = rows.find((x) => !x.due)
  return {
    share,
    emi,
    theirMonthlyEmi,
    myMonthlyEmi: round2(emi - theirMonthlyEmi),
    instalmentsDue: dueRows.length,
    tenure: n,
    dueSoFar,
    paid: round2(paid),
    arrears,
    ahead: Math.max(0, round2(-arrearsRaw)),
    monthsBehind: theirMonthlyEmi > 0 ? Math.floor(arrears / theirMonthlyEmi) : 0,
    theirPrincipalPaid: round2(sum(dueRows.map((x) => x.theirPrincipal))),
    theirInterestPaid: round2(sum(dueRows.map((x) => x.theirInterest))),
    theirOutstandingPrincipal,
    settleToday: round2(arrears + theirOutstandingPrincipal),
    totalOverTenure: round2(sum(rows.map((x) => x.theirEmi))),
    totalInterest: round2(sum(rows.map((x) => x.theirInterest))),
    next: nextRow ? { date: nextRow.date, amount: nextRow.theirEmi } : null,
    endDate: rows[rows.length - 1].date,
    rows,
    loanTotalInterest: round2(totalInterest),
  }
}
