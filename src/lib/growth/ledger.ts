import { netInr, type Trade } from '../journal'
import { tradingFlow, type TagMap } from '../budget'
import type { Txn } from '../statements'
import type { Goal } from '../goals'
import type { Loan } from '../loans'

// Trading measured in real-life terms: rupees that left the bank for brokers and did not come back, set against rent,
// EMIs and goals. Two separate views are kept on purpose — cash moved (bank/card) and P&L realised (journal) — because
// they disagree whenever money sits in a broker account.

export interface LedgerMonth {
  month: string
  sent: number
  back: number
  /** Positive = more went to brokers than came back. */
  net: number
  /** Realised P&L in the journal that month (rupees). */
  pnl: number
}

export interface Ledger {
  months: LedgerMonth[]
  totalNet: number
  totalPnl: number
  last12Net: number
  /** How many months of rent / EMIs the net outflow equals (null when the figure is unknown). */
  rentMonths: number | null
  emiMonths: number | null
  monthlyEmi: number
  goals: { id: string; name: string; target: number; pct: number; months: number | null }[]
  /** Rough yearly interest avoided had the net outflow prepaid the costliest loan (simple interest, not exact). */
  prepay: { loan: string; ratePct: number; yearlyInterest: number } | null
}

const monthsOf = (txns: Txn[], trades: Trade[]) => [...new Set([...txns.map((t) => t.date.slice(0, 7)), ...trades.map((t) => t.date.slice(0, 7))])].sort()

export function buildLedger(input: { txns: Txn[]; trades: Trade[]; tags: TagMap; budgets: Record<string, number>; goals: Goal[]; loans: Loan[]; today: string }): Ledger {
  const { txns, trades, tags, budgets, goals, loans, today } = input
  const months: LedgerMonth[] = monthsOf(txns, trades).map((month) => {
    const flow = tradingFlow(txns, month, tags)
    const pnl = trades.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + netInr(t), 0)
    return { month, ...flow, pnl }
  })
  const totalNet = months.reduce((s, m) => s + m.net, 0)
  const totalPnl = months.reduce((s, m) => s + m.pnl, 0)
  const cutoff = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() - 11)
    return d.toISOString().slice(0, 7)
  })()
  const last12Net = months.filter((m) => m.month >= cutoff).reduce((s, m) => s + m.net, 0)

  const active = loans.filter((l) => l.outstanding > 0 && l.emi > 0)
  const monthlyEmi = active.reduce((s, l) => s + l.emi, 0)
  const rent = budgets['Rent'] ?? 0
  const lost = Math.max(0, totalNet)

  const costliest = [...active].sort((a, b) => b.ratePct - a.ratePct)[0]
  return {
    months,
    totalNet,
    totalPnl,
    last12Net,
    rentMonths: rent > 0 ? lost / rent : null,
    emiMonths: monthlyEmi > 0 ? lost / monthlyEmi : null,
    monthlyEmi,
    goals: goals
      .filter((g) => g.targetAmount > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        target: g.targetAmount,
        pct: (lost / g.targetAmount) * 100,
        // With a monthly contribution set, the outflow is that many months of saving for the goal.
        months: g.monthlyContribution && g.monthlyContribution > 0 ? lost / g.monthlyContribution : null,
      })),
    prepay: costliest && lost > 0 ? { loan: costliest.label, ratePct: costliest.ratePct, yearlyInterest: (Math.min(lost, costliest.outstanding) * costliest.ratePct) / 100 } : null,
  }
}
