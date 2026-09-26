import type { Txn } from './statements'
import { formatInr } from './kite'

export type TxnTag = 'family' | 'household' | 'ignore'
export type TagMap = Record<string, TxnTag>

const NOT_SPEND = new Set(['Transfer', 'Card Payment', 'Salary', 'Interest', 'Other Income', 'Refund', 'Cashback & Rewards'])

export const tagKeyForTxn = (t: Pick<Txn, 'id'>) => `id:${t.id}`
export const tagKeyForMerchant = (t: Pick<Txn, 'merchant'>) => `m:${t.merchant.trim().toLowerCase()}`
export const txnTag = (t: Txn, tags: TagMap = {}): TxnTag | undefined => tags[tagKeyForTxn(t)] ?? tags[tagKeyForMerchant(t)]

/** Card bill paid from the bank; the same money already shows up as card purchases. */
export const isCardBillPayment = (t: Txn) => t.category === 'Card Payment' || /ICICI BANK CREDIT CA/i.test(t.description)

/** Whether a debit is real spending: not a transfer, card-bill payment, family transfer or ignored item. Tagging as household forces it in. */
export function countsAsSpend(t: Txn, tags: TagMap = {}): boolean {
  if (!(t.debit > 0)) return false
  const tag = txnTag(t, tags)
  if (tag === 'family' || tag === 'ignore') return false
  if (tag === 'household') return true
  return !NOT_SPEND.has(t.category) && !isCardBillPayment(t)
}

export const spendTxns = (txns: Txn[], tags: TagMap = {}) => txns.filter((t) => countsAsSpend(t, tags))

export function spentByCategory(txns: Txn[], month: string, tags: TagMap = {}): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of txns) {
    if (t.date.slice(0, 7) !== month || !countsAsSpend(t, tags)) continue
    out[t.category] = (out[t.category] ?? 0) + t.debit
  }
  return out
}

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export interface BudgetStatus {
  category: string
  limit: number
  spent: number
  pct: number
  remaining: number
  daysLeft: number
  projected: number
  over: boolean
  near: boolean
  projectedOver: boolean
}

export const NEAR_PCT = 85

export function budgetStatus(budgets: Record<string, number>, spent: Record<string, number>, month: string, today: string): BudgetStatus[] {
  const dim = daysInMonth(month)
  const cur = today.slice(0, 7)
  const elapsed = month < cur ? dim : month > cur ? 0 : Number(today.slice(8, 10))
  const daysLeft = dim - elapsed
  const cats = new Set([...Object.keys(budgets), ...Object.keys(spent)])
  const out: BudgetStatus[] = []
  for (const category of cats) {
    const limit = budgets[category] ?? 0
    const s = Math.round((spent[category] ?? 0) * 100) / 100
    const projected = elapsed === 0 ? 0 : month === cur ? Math.round((s / elapsed) * dim) : s
    const pct = limit > 0 ? (s / limit) * 100 : 0
    out.push({ category, limit, spent: s, pct, remaining: limit - s, daysLeft, projected, over: limit > 0 && s > limit, near: limit > 0 && pct >= NEAR_PCT && s <= limit, projectedOver: limit > 0 && s <= limit && projected > limit })
  }
  return out.sort((a, b) => (b.limit > 0 ? 1 : 0) - (a.limit > 0 ? 1 : 0) || b.pct - a.pct || b.spent - a.spent)
}

/** Notices for the current month: over-budget and close-to-budget categories. */
export function budgetNotices(budgets: Record<string, number>, txns: Txn[], today: string, tags: TagMap = {}) {
  const month = today.slice(0, 7)
  const rows = budgetStatus(budgets, spentByCategory(txns, month, tags), month, today).filter((r) => r.limit > 0)
  const out: { id: string; title: string; detail: string }[] = []
  for (const r of rows) {
    if (r.over) out.push({ id: `budget-over-${month}-${r.category}`, title: `${r.category} is over budget`, detail: `${formatInr(r.spent)} spent of ${formatInr(r.limit)} this month.` })
    else if (r.near) out.push({ id: `budget-near-${month}-${r.category}`, title: `${r.category} budget almost used`, detail: `${Math.round(r.pct)}% of ${formatInr(r.limit)} used, ${r.daysLeft} days left.` })
  }
  return out
}
