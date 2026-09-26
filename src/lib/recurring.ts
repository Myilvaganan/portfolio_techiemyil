// Subscription / EMI detection: same merchant charged roughly every month, whether from a bank account or a
// credit card. Flags a changed amount (a price hike, or a subscription that quietly dropped) and predicts the
// next due date from the typical gap between charges.

import type { Txn } from './statements'

const DAY_MS = 86_400_000
const round = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const mean = (xs: number[]) => sum(xs) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

export interface RecurringItem {
  merchant: string
  category: string
  count: number
  avgAmount: number
  lastAmount: number
  lastDate: string
  avgIntervalDays: number
  nextDueDate: string
  amountChanged: boolean
  changePct: number
}

export interface RecurringOptions {
  minOccurrences?: number
  minIntervalDays?: number
  maxIntervalDays?: number
  changeThresholdPct?: number
}

const EXCLUDE_CATEGORIES = new Set(['Transfer', 'Card Payment'])

// Groups spends by a normalised merchant name and keeps groups that repeat at roughly monthly gaps.
export function detectRecurring(txns: Txn[], opts: RecurringOptions = {}): RecurringItem[] {
  const minOccurrences = opts.minOccurrences ?? 3
  const minIntervalDays = opts.minIntervalDays ?? 20
  const maxIntervalDays = opts.maxIntervalDays ?? 40
  const changeThresholdPct = opts.changeThresholdPct ?? 5

  const groups = new Map<string, { merchant: string; category: string; date: string; amount: number }[]>()
  for (const t of txns) {
    if (!t.debit || EXCLUDE_CATEGORIES.has(t.category)) continue
    const key = t.merchant.trim().toLowerCase()
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push({ merchant: t.merchant.trim(), category: t.category, date: t.date, amount: t.debit })
    groups.set(key, list)
  }

  const out: RecurringItem[] = []
  for (const list of groups.values()) {
    if (list.length < minOccurrences) continue
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push((Date.parse(`${sorted[i].date}T00:00:00Z`) - Date.parse(`${sorted[i - 1].date}T00:00:00Z`)) / DAY_MS)
    const avgGap = mean(gaps)
    if (avgGap < minIntervalDays || avgGap > maxIntervalDays) continue

    const amounts = sorted.map((x) => x.amount)
    const last = sorted.at(-1)!
    const priorAmounts = amounts.slice(0, -1)
    const priorAvg = priorAmounts.length ? mean(priorAmounts) : last.amount
    const changePct = priorAvg ? round(((last.amount - priorAvg) / priorAvg) * 100) : 0

    out.push({
      merchant: last.merchant,
      category: last.category,
      count: sorted.length,
      avgAmount: round(mean(amounts)),
      lastAmount: last.amount,
      lastDate: last.date,
      avgIntervalDays: Math.round(avgGap),
      nextDueDate: addDays(last.date, median(gaps)),
      amountChanged: Math.abs(changePct) > changeThresholdPct,
      changePct,
    })
  }
  return out.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
}
