import { planTotals, type TagMap } from '../budget'
import type { Txn } from '../statements'
import type { WealthSnapshot } from '../netWorthHistory'
import type { LendingEntry } from '../lending'
import { summarize } from '../lending'

// "If income stopped today, how long would the money last?" Monthly outflow is the average of the last three
// complete months of real spending (needs, wants and family — EMIs included, trading and transfers not). Cash and
// investments come from the latest net-worth snapshot. Each scenario changes one assumption.

export interface RunwayInputs {
  monthlyOutflow: number
  wantsShare: number
  monthlyIncome: number
  cash: number
  investments: number
  owedToYou: number
  monthsUsed: string[]
  snapshotMonth: string | null
}

export type ScenarioKey = 'jobLoss' | 'marketDrop' | 'cutWants' | 'repaid'

export interface Scenario {
  key: ScenarioKey
  months: number | null
  assets: number
  outflow: number
}

const lastFullMonths = (txns: Txn[], today: string, n: number) => {
  const current = today.slice(0, 7)
  const months = [...new Set(txns.map((t) => t.date.slice(0, 7)))].filter((m) => m < current).sort()
  return months.slice(-n)
}

export function runwayInputs(input: { txns: Txn[]; tags: TagMap; snapshots: WealthSnapshot[]; lending: LendingEntry[]; today: string }): RunwayInputs {
  const months = lastFullMonths(input.txns, input.today, 3)
  const totals = months.map((m) => planTotals(input.txns, m, input.tags))
  const avg = (f: (t: (typeof totals)[number]) => number) => (totals.length ? totals.reduce((s, t) => s + f(t), 0) / totals.length : 0)
  const outflow = avg((t) => t.needs + t.wants + t.family)
  const income = months.length ? months.reduce((s, m) => s + input.txns.filter((t) => t.date.startsWith(m) && t.category === 'Salary').reduce((a, t) => a + t.credit, 0), 0) / months.length : 0
  const snap = [...input.snapshots].sort((a, b) => a.month.localeCompare(b.month)).at(-1) ?? null
  return {
    monthlyOutflow: outflow,
    wantsShare: outflow ? avg((t) => t.wants) / outflow : 0,
    monthlyIncome: income,
    cash: snap?.assets.bank ?? 0,
    investments: (snap?.assets.portfolio ?? 0) + (snap?.assets.other ?? 0),
    owedToYou: summarize(input.lending, input.today).totalOwed,
    monthsUsed: months,
    snapshotMonth: snap?.month ?? null,
  }
}

export function scenarios(r: RunwayInputs): Scenario[] {
  const base = r.cash + r.investments
  const make = (key: ScenarioKey, assets: number, outflow: number): Scenario => ({ key, assets, outflow, months: outflow > 0 ? assets / outflow : null })
  return [
    make('jobLoss', base, r.monthlyOutflow),
    make('marketDrop', r.cash + r.investments * 0.8, r.monthlyOutflow),
    make('cutWants', base, r.monthlyOutflow * (1 - r.wantsShare / 2)),
    make('repaid', base + r.owedToYou, r.monthlyOutflow),
  ]
}
