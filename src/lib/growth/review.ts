import { netInr, type JournalSettings, type Trade } from '../journal'
import { planBucket, planTotals, tradingFlow, isCardBillPayment, type TagMap } from '../budget'
import type { Txn } from '../statements'
import type { DailyLog } from '../health'
import type { WealthSnapshot } from '../netWorthHistory'
import type { GuardrailRules } from '../growthApi'
import { checkGuardrails } from './guardrails'

// One month on one page, computed from data already in the vault. Every figure has the previous month beside it, and
// the takeaways are plain rules over those figures — no AI call, so a review costs nothing and never invents a number.

const NOT_SPEND = new Set(['Transfer', 'Card Payment', 'Salary', 'Interest', 'Other Income', 'Refund', 'Cashback & Rewards', 'Trading'])

export interface MonthFigures {
  month: string
  spend: number
  wants: number
  income: number
  overBudget: { category: string; spent: number; limit: number }[]
  tradingPnl: number
  trades: number
  breaks: number
  breakCost: number
  brokerNet: number
  netWorth: number | null
  sleepAvg: number | null
  stepsAvg: number | null
}

export type Takeaway = { tone: 'good' | 'bad' | 'neutral'; key: 'overBudget' | 'underBudget' | 'tradingLoss' | 'tradingWin' | 'breaks' | 'noBreaks' | 'netWorthUp' | 'netWorthDown' | 'wantsUp' | 'wantsDown'; value: number; label?: string }

export const prevMonth = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

export function monthFigures(month: string, input: { txns: Txn[]; trades: Trade[]; tags: TagMap; budgets: Record<string, number>; snapshots: WealthSnapshot[]; health: DailyLog[]; settings: JournalSettings; rules: GuardrailRules }): MonthFigures {
  const inMonth = input.txns.filter((t) => t.date.startsWith(month))
  const spendTxns = inMonth.filter((t) => t.debit > 0 && !NOT_SPEND.has(t.category) && !isCardBillPayment(t) && planBucket(t, input.tags) !== 'ignore')
  const byCategory = new Map<string, number>()
  for (const t of spendTxns) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.debit)
  const overBudget = [...byCategory]
    .filter(([c, spent]) => (input.budgets[c] ?? 0) > 0 && spent > input.budgets[c])
    .map(([category, spent]) => ({ category, spent, limit: input.budgets[category] }))
    .sort((a, b) => b.spent - b.limit - (a.spent - a.limit))

  const trades = input.trades.filter((t) => t.date.startsWith(month))
  const guard = checkGuardrails(trades, input.settings, input.rules)
  const snap = input.snapshots.find((s) => s.month === month)
  const logs = input.health.filter((l) => l.date.startsWith(month))

  return {
    month,
    spend: spendTxns.reduce((s, t) => s + t.debit, 0),
    wants: planTotals(input.txns, month, input.tags).wants,
    income: inMonth.filter((t) => t.category === 'Salary').reduce((s, t) => s + t.credit, 0),
    overBudget,
    tradingPnl: trades.reduce((s, t) => s + netInr(t), 0),
    trades: trades.length,
    breaks: guard.breaches.length,
    breakCost: guard.costOfBreaches,
    brokerNet: tradingFlow(input.txns, month, input.tags).net,
    netWorth: snap ? snap.net : null,
    sleepAvg: avg(logs.map((l) => l.sleepH).filter((x): x is number => x !== null)),
    stepsAvg: avg(logs.map((l) => l.steps).filter((x): x is number => x !== null)),
  }
}

/** Up to three takeaways, most important first. */
export function takeaways(cur: MonthFigures, prev: MonthFigures): Takeaway[] {
  const out: (Takeaway & { weight: number })[] = []
  const over = cur.overBudget[0]
  if (over) out.push({ tone: 'bad', key: 'overBudget', value: over.spent - over.limit, label: over.category, weight: over.spent - over.limit })
  if (cur.trades > 0) {
    if (cur.breaks > 0) out.push({ tone: 'bad', key: 'breaks', value: cur.breakCost, label: String(cur.breaks), weight: cur.breakCost + 1 })
    else out.push({ tone: 'good', key: 'noBreaks', value: cur.trades, weight: 1000 })
    out.push({ tone: cur.tradingPnl < 0 ? 'bad' : 'good', key: cur.tradingPnl < 0 ? 'tradingLoss' : 'tradingWin', value: Math.abs(cur.tradingPnl), weight: Math.abs(cur.tradingPnl) })
  }
  if (cur.netWorth !== null && prev.netWorth !== null) {
    const d = cur.netWorth - prev.netWorth
    out.push({ tone: d >= 0 ? 'good' : 'bad', key: d >= 0 ? 'netWorthUp' : 'netWorthDown', value: Math.abs(d), weight: Math.abs(d) })
  }
  if (prev.wants > 0) {
    const d = cur.wants - prev.wants
    if (Math.abs(d) / prev.wants >= 0.15) out.push({ tone: d > 0 ? 'bad' : 'good', key: d > 0 ? 'wantsUp' : 'wantsDown', value: Math.abs(d), weight: Math.abs(d) })
  }
  if (!over && cur.spend > 0) out.push({ tone: 'good', key: 'underBudget', value: cur.spend, weight: 1 })
  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(({ weight: _w, ...t }) => t)
}
