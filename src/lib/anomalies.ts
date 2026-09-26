import type { Txn } from './statements'
import { countsAsSpend } from './budget'
import { detectRecurring } from './recurring'
import { formatInr } from './kite'

export interface SpendAlert {
  id: string
  title: string
  detail: string
}

const DAY_MS = 86_400_000
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const UNUSUAL_WINDOW_DAYS = 30
const MIN_HISTORY = 4

export function spendAlerts(txns: Txn[], today: string): SpendAlert[] {
  const spend = txns.filter((t) => countsAsSpend(t))
  const byMerchant = new Map<string, Txn[]>()
  for (const t of spend) {
    const k = t.merchant.trim().toLowerCase()
    if (!k) continue
    byMerchant.set(k, [...(byMerchant.get(k) ?? []), t])
  }
  const out: SpendAlert[] = []
  const recurringKeys = new Set(detectRecurring(spend).map((r) => r.merchant.trim().toLowerCase()))

  for (const [key, list] of byMerchant) {
    if (recurringKeys.has(key)) continue
    for (const t of list) {
      const age = dayDiff(today, t.date)
      if (age < 0 || age > UNUSUAL_WINDOW_DAYS) continue
      const history = list.filter((x) => x.id !== t.id && x.date <= t.date).map((x) => x.debit)
      if (history.length < MIN_HISTORY) continue
      const usual = median(history)
      if (t.debit >= usual * 3 && t.debit - usual >= 1000) {
        out.push({ id: `spend-high-${t.id}`, title: `Unusually large spend at ${t.merchant}`, detail: `${formatInr(t.debit)} on ${t.date}, against a usual ${formatInr(usual)}.` })
      }
    }
  }

  const seen = new Map<string, Txn[]>()
  for (const t of spend) {
    if (t.debit < 50 || dayDiff(today, t.date) < 0 || dayDiff(today, t.date) > 14) continue
    const k = `${t.merchant.trim().toLowerCase()}|${t.debit}|${t.date}`
    seen.set(k, [...(seen.get(k) ?? []), t])
  }
  for (const [k, list] of seen) {
    if (list.length < 2) continue
    out.push({ id: `spend-double-${k}`, title: `Possible double debit at ${list[0].merchant}`, detail: `${list.length} charges of ${formatInr(list[0].debit)} on ${list[0].date}.` })
  }

  for (const r of detectRecurring(spend)) {
    if (!r.amountChanged || r.changePct <= 0 || dayDiff(today, r.lastDate) > 45) continue
    out.push({ id: `spend-hike-${r.merchant.toLowerCase()}-${r.lastDate}`, title: `${r.merchant} costs more now`, detail: `Now ${formatInr(r.lastAmount)}, up ${Math.round(r.changePct)}% from ${formatInr(r.avgAmount)}.` })
  }
  return out
}
