import type { Loan } from '../loans'
import type { Statement } from '../statements'

// A month-by-month plan to clear every loan and card balance. Each month every debt gets its minimum; whatever is
// left of the budget (the extra, plus minimums freed by debts already cleared) goes to one target:
//   avalanche — highest interest rate first (least interest overall)
//   snowball  — smallest balance first (quickest wins)
// Compared against paying only the minimums.

export interface Debt {
  id: string
  name: string
  kind: 'loan' | 'card'
  balance: number
  ratePct: number
  minPayment: number
}

export interface PayoffResult {
  months: number | null
  totalInterest: number
  /** Month number (1-based) each debt is cleared, by id. Null when it never clears within the horizon. */
  clearedAt: Record<string, number | null>
  /** Remaining total balance at the end of each month, for the chart. */
  path: number[]
}

export const CARD_RATE_PCT = 42
const HORIZON = 600

/** Loans from the Loans page and the latest balance of each card (from its newest statement). */
export function collectDebts(loans: Loan[], cardStatements: Statement[], cardRatePct = CARD_RATE_PCT): Debt[] {
  const debts: Debt[] = loans
    .filter((l) => l.outstanding > 0)
    .map((l) => ({ id: `loan:${l.accountNo}`, name: l.label, kind: 'loan' as const, balance: l.outstanding, ratePct: l.ratePct, minPayment: l.emi }))
  const latest = new Map<string, Statement>()
  for (const st of cardStatements) {
    const key = st.cardLast4 ?? st.accountKey
    const date = st.statementDate ?? st.periodTo ?? ''
    const prev = latest.get(key)
    if (!prev || date > (prev.statementDate ?? prev.periodTo ?? '')) latest.set(key, st)
  }
  for (const [key, st] of latest) {
    const due = st.totalDue ?? 0
    if (due > 0) {
      debts.push({ id: `card:${key}`, name: `${st.cardName ?? 'Card'} ••${st.cardLast4 ?? ''}`.trim(), kind: 'card', balance: due, ratePct: cardRatePct, minPayment: Math.max(st.minDue ?? 0, Math.min(due, Math.max(200, due * 0.05))) })
    }
  }
  return debts
}

export function simulate(debts: Debt[], extraPerMonth: number, strategy: 'avalanche' | 'snowball' | 'minimum'): PayoffResult {
  const live = debts.map((d) => ({ ...d }))
  const budget = debts.reduce((s, d) => s + d.minPayment, 0) + (strategy === 'minimum' ? 0 : extraPerMonth)
  const clearedAt: Record<string, number | null> = Object.fromEntries(debts.map((d) => [d.id, null]))
  let totalInterest = 0
  const path: number[] = []

  for (let month = 1; month <= HORIZON; month++) {
    const open = live.filter((d) => d.balance > 0.5)
    if (!open.length) return { months: month - 1, totalInterest, clearedAt, path }
    for (const d of open) {
      const interest = (d.balance * d.ratePct) / 1200
      d.balance += interest
      totalInterest += interest
    }
    let left = budget
    // Minimums first (never more than what is owed).
    for (const d of open) {
      const pay = Math.min(d.minPayment, d.balance, left)
      d.balance -= pay
      left -= pay
    }
    if (strategy !== 'minimum') {
      const order = [...open].sort((a, b) => (strategy === 'avalanche' ? b.ratePct - a.ratePct || a.balance - b.balance : a.balance - b.balance || b.ratePct - a.ratePct))
      for (const d of order) {
        if (left <= 0) break
        const pay = Math.min(d.balance, left)
        d.balance -= pay
        left -= pay
      }
    }
    for (const d of open) if (d.balance <= 0.5 && clearedAt[d.id] === null) clearedAt[d.id] = month
    path.push(live.reduce((s, d) => s + Math.max(0, d.balance), 0))
    // Minimums that no longer cover the interest never clear: stop instead of looping to the horizon.
    if (strategy === 'minimum' && month > 1 && path[month - 1] >= path[month - 2]) return { months: null, totalInterest, clearedAt, path }
  }
  return { months: null, totalInterest, clearedAt, path }
}
