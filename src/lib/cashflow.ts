import type { Txn } from './statements'
import { countsAsSpend, type TagMap } from './budget'
import { detectRecurring } from './recurring'

const INCOME = new Set(['Salary', 'Other Income', 'Interest'])
const round = (n: number) => Math.round(n)
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

export interface MonthFlow {
  month: string
  income: number
  spend: number
  net: number
  /** Percent of income kept; null when there was no income. */
  savingsRate: number | null
}

export function monthlyFlow(txns: Txn[], months: string[], tags: TagMap = {}): MonthFlow[] {
  const map = new Map(months.map((m) => [m, { income: 0, spend: 0 }]))
  for (const t of txns) {
    const row = map.get(t.date.slice(0, 7))
    if (!row) continue
    if (t.credit > 0 && INCOME.has(t.category)) row.income += t.credit
    if (countsAsSpend(t, tags)) row.spend += t.debit
  }
  return months.map((month) => {
    const { income, spend } = map.get(month)!
    return { month, income: round(income), spend: round(spend), net: round(income - spend), savingsRate: income > 0 ? ((income - spend) / income) * 100 : null }
  })
}

/** Sum of each account's most recent known balance. */
export function latestBalance(bank: Txn[]): number | null {
  const last = new Map<string, Txn>()
  for (const t of bank) {
    if (t.balance == null) continue
    const cur = last.get(t.accountKey)
    if (!cur || t.date >= cur.date) last.set(t.accountKey, t)
  }
  return last.size ? [...last.values()].reduce((s, t) => s + (t.balance ?? 0), 0) : null
}

const addMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface Projection {
  month: string
  income: number
  fixed: number
  variable: number
  spend: number
  balance: number
}

export interface CashFlow {
  flows: MonthFlow[]
  balance: number | null
  avgBurn: number
  avgIncome: number
  runwayMonths: number | null
  recurringMonthly: number
  projection: Projection[]
}

/** `months` is the history window, oldest first, ending with the current month; the current (partial) month is left out of averages. */
export function cashFlow(bank: Txn[], card: Txn[], months: string[], today: string, tags: TagMap = {}): CashFlow {
  const all = [...bank, ...card]
  const flows = monthlyFlow(all, months, tags)
  const cur = today.slice(0, 7)
  const complete = flows.filter((f) => f.month < cur && (f.income > 0 || f.spend > 0)).slice(-3)
  const basis = complete.length ? complete : flows.filter((f) => f.spend > 0 || f.income > 0).slice(-1)
  const avgBurn = round(mean(basis.map((f) => f.spend)))
  const avgIncome = round(mean(basis.map((f) => f.income)))
  const balance = latestBalance(bank)
  const runwayMonths = balance != null && avgBurn > 0 ? Math.max(0, balance) / avgBurn : null
  const recurringMonthly = round(detectRecurring(all.filter((t) => countsAsSpend(t, tags))).reduce((s, r) => s + r.lastAmount, 0))
  const fixed = Math.min(recurringMonthly, avgBurn)
  const variable = Math.max(0, avgBurn - fixed)
  let running = balance ?? 0
  const projection = [1, 2, 3].map((i) => {
    running += avgIncome - fixed - variable
    return { month: addMonth(cur, i), income: avgIncome, fixed, variable, spend: fixed + variable, balance: round(running) }
  })
  return { flows, balance, avgBurn, avgIncome, runwayMonths, recurringMonthly, projection }
}
