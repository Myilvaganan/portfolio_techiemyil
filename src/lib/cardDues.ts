// Per-card due dates, utilisation and interest paid, derived from stored statements. Older statements that never
// captured a due date fall back to an estimate from the statement period (flagged `estimated`).

import type { Statement, Txn } from './statements'

const ESTIMATE_DAYS_AFTER_PERIOD = 18
const DAY = 86_400_000

export interface CardDue {
  key: string
  label: string
  dueDate: string | null
  estimated: boolean
  daysLeft: number | null
  totalDue: number | null
  minDue: number | null
  limit: number | null
  utilisation: number | null
  interestPaid: number
  feesPaid: number
  settled: boolean
  overdue: boolean
}

const round = (n: number) => Math.round(n * 100) / 100
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
}

export function estimateDueDate(periodTo: string | null): string | null {
  return periodTo ? iso(Date.parse(`${periodTo}T00:00:00Z`) + ESTIMATE_DAYS_AFTER_PERIOD * DAY) : null
}

export const utilisationPct = (used: number | null, limit: number | null) => (used !== null && limit && limit > 0 ? Math.max(0, (used / limit) * 100) : null)

export function buildCardDues(txns: Txn[], statements: Statement[], today: string): CardDue[] {
  const keys = new Set(statements.map((s) => s.accountKey))
  const out: CardDue[] = []
  for (const key of keys) {
    const st = statements.filter((s) => s.accountKey === key).sort((a, b) => (a.periodTo ?? a.uploadedAt).localeCompare(b.periodTo ?? b.uploadedAt))
    const latest = st.at(-1)!
    const mine = txns.filter((t) => t.accountKey === key)
    const actual = latest.dueDate ?? null
    const dueDate = actual ?? estimateDueDate(latest.periodTo ?? latest.statementDate ?? null)
    const totalDue = latest.totalDue ?? null
    const cutoff = latest.periodTo ?? latest.statementDate ?? ''
    const paidSince = mine.filter((t) => t.type === 'payment' && t.date > cutoff).reduce((s, t) => s + t.credit, 0)
    const settled = totalDue !== null ? totalDue <= 0 || paidSince >= totalDue - 1 : false
    const daysLeft = dueDate ? daysBetween(today, dueDate) : null
    const last4 = latest.cardLast4 ?? key.split(':')[1] ?? ''
    const name = latest.cardName ?? 'ICICI card'
    const limit = latest.creditLimit ?? null
    const used = latest.availableLimit != null && limit ? limit - latest.availableLimit : totalDue
    out.push({
      key,
      label: last4 ? `${name} ••${last4}` : name,
      dueDate,
      estimated: !actual && !!dueDate,
      daysLeft,
      totalDue,
      minDue: latest.minDue ?? null,
      limit,
      utilisation: utilisationPct(used, limit),
      interestPaid: round(mine.filter((t) => t.type === 'interest').reduce((s, t) => s + t.debit, 0)),
      feesPaid: round(mine.filter((t) => t.type === 'fee').reduce((s, t) => s + t.debit, 0)),
      settled,
      overdue: !settled && daysLeft !== null && daysLeft < 0 && (totalDue ?? 0) > 0,
    })
  }
  return out.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999))
}

export interface CardNotice {
  id: string
  title: string
  detail: string
}

export function cardDueNotices(cards: CardDue[], today: string): CardNotice[] {
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
  const out: CardNotice[] = []
  for (const c of cards) {
    const due = c.totalDue !== null && c.totalDue > 0 ? ` — ${inr(c.totalDue)} due` : ''
    if (!c.settled && c.daysLeft !== null && (c.totalDue ?? 0) > 0) {
      if (c.overdue) out.push({ id: `card-overdue-${c.key}-${c.dueDate}`, title: `${c.label} payment overdue`, detail: `Was due ${c.dueDate} (${-c.daysLeft} day${c.daysLeft === -1 ? '' : 's'} ago)${due}` })
      else if (c.daysLeft <= 5) out.push({ id: `card-due-${c.key}-${c.dueDate}`, title: `${c.label} due ${c.daysLeft === 0 ? 'today' : `in ${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'}`}`, detail: `${c.dueDate}${due}${c.estimated ? ' (estimated)' : ''}` })
    }
    if (c.utilisation !== null && c.utilisation > 70) out.push({ id: `card-util-${c.key}-${today.slice(0, 7)}`, title: `${c.label} utilisation ${Math.round(c.utilisation)}%`, detail: 'Above 70% of the credit limit can hurt your credit score.' })
  }
  return out
}
