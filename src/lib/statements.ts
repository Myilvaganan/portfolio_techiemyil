// Types and pure analytics for the bank-statement and credit-card dashboards.

export type StatementKind = 'bank' | 'card'

export interface Statement {
  id: string
  kind: StatementKind
  filename: string
  uploadedAt: string
  pages: number
  fileKey: string
  accountKey: string
  txnCount: number
  duplicatesSkipped: number
  bank: 'icici' | 'axis' | 'other'
  periodFrom: string | null
  periodTo: string | null
  // bank
  accountHolder?: string | null
  accountLast4?: string | null
  accountType?: string | null
  openingBalance?: number | null
  closingBalance?: number | null
  // card
  cardName?: string | null
  cardLast4?: string | null
  holderName?: string | null
  statementDate?: string | null
  dueDate?: string | null
  totalDue?: number | null
  minDue?: number | null
  creditLimit?: number | null
  availableLimit?: number | null
  rewardPoints?: number | null
  previousBalance?: number | null
}

export interface Txn {
  id: string
  statementId: string
  accountKey: string
  date: string
  description: string
  merchant: string
  debit: number
  credit: number
  category: string
  balance?: number | null
  channel?: string
  type?: string
}

export interface AiInsights {
  fingerprint: string
  generatedAt: string
  model: string
  headline: string
  summary: string
  score: { value: number; label: string }
  highlights: { title: string; detail: string; tone: 'good' | 'warn' | 'bad' | 'info' }[]
  tips: { title: string; detail: string }[]
  risks: string[]
}

export interface StatementsData {
  statements: Statement[]
  transactions: Txn[]
  insights: AiInsights | null
  updatedAt?: string
}

export const emptyStatements = (): StatementsData => ({ statements: [], transactions: [], insights: null })

// ---------- Helpers ----------

export const monthOf = (date: string) => date.slice(0, 7)

export function monthLabel(month: string, long = false) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' })
}

export function dayLabel(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const round = (n: number) => Math.round(n * 100) / 100

export interface Filters {
  from?: string
  to?: string
  category?: string
  search?: string
  account?: string
  direction?: 'all' | 'debit' | 'credit'
}

export function filterTxns(txns: Txn[], f: Filters): Txn[] {
  const q = f.search?.trim().toLowerCase()
  return txns.filter((t) => {
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (f.category && f.category !== 'all' && t.category !== f.category) return false
    if (f.account && f.account !== 'all' && t.accountKey !== f.account) return false
    if (f.direction === 'debit' && !t.debit) return false
    if (f.direction === 'credit' && !t.credit) return false
    if (q && !`${t.merchant} ${t.description} ${t.category}`.toLowerCase().includes(q)) return false
    return true
  })
}

// ---------- Spending model ----------
// For a bank account "spend" is money out and "income" money in; transfers can be left out so moving money
// between your own accounts doesn't look like income or spending. For cards, spend is purchases, fees and interest.

export interface Options {
  excludeTransfers?: boolean
}

const isTransfer = (t: Txn) => t.category === 'Transfer'
const isCardSettlement = (t: Txn) => t.category === 'Card Payment'

export function spendOf(kind: StatementKind, t: Txn, o: Options = {}): number {
  if (kind === 'bank') return o.excludeTransfers && isTransfer(t) ? 0 : t.debit
  return isCardSettlement(t) ? 0 : t.debit
}

export function incomeOf(kind: StatementKind, t: Txn, o: Options = {}): number {
  if (kind === 'bank') return o.excludeTransfers && isTransfer(t) ? 0 : t.credit
  return 0
}

export interface MonthRow {
  month: string
  income: number
  spend: number
  net: number
  savingsRate: number
  txns: number
}

export function monthlyFlow(kind: StatementKind, txns: Txn[], o: Options = {}): MonthRow[] {
  const map = new Map<string, MonthRow>()
  for (const t of txns) {
    const m = monthOf(t.date)
    const row = map.get(m) ?? { month: m, income: 0, spend: 0, net: 0, savingsRate: 0, txns: 0 }
    row.income += incomeOf(kind, t, o)
    row.spend += spendOf(kind, t, o)
    row.txns++
    map.set(m, row)
  }
  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, income: round(r.income), spend: round(r.spend), net: round(r.income - r.spend), savingsRate: r.income > 0 ? ((r.income - r.spend) / r.income) * 100 : 0 }))
}

export interface Slice {
  label: string
  value: number
  count: number
}

export function categoryTotals(kind: StatementKind, txns: Txn[], o: Options = {}): Slice[] {
  const map = new Map<string, Slice>()
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    if (!v) continue
    const s = map.get(t.category) ?? { label: t.category, value: 0, count: 0 }
    s.value += v
    s.count++
    map.set(t.category, s)
  }
  return [...map.values()].map((s) => ({ ...s, value: round(s.value) })).sort((a, b) => b.value - a.value)
}

export function topWithOther(slices: Slice[], max: number): Slice[] {
  if (slices.length <= max) return slices
  const rest = slices.slice(max)
  return [...slices.slice(0, max), { label: `Other (${rest.length})`, value: round(sum(rest.map((s) => s.value))), count: sum(rest.map((s) => s.count)) }]
}

export function merchantTotals(kind: StatementKind, txns: Txn[], o: Options = {}): Slice[] {
  const map = new Map<string, Slice>()
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    if (!v) continue
    const key = t.merchant.trim().toLowerCase()
    const s = map.get(key) ?? { label: t.merchant.trim(), value: 0, count: 0 }
    s.value += v
    s.count++
    map.set(key, s)
  }
  return [...map.values()].map((s) => ({ ...s, value: round(s.value) })).sort((a, b) => b.value - a.value)
}

export function dailySpend(kind: StatementKind, txns: Txn[], o: Options = {}): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    if (v) map.set(t.date, round((map.get(t.date) ?? 0) + v))
  }
  return map
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function weekdaySpend(kind: StatementKind, txns: Txn[], o: Options = {}): Slice[] {
  const rows = WEEKDAYS.map((label) => ({ label, value: 0, count: 0 }))
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    if (!v) continue
    const idx = (new Date(`${t.date}T00:00:00Z`).getUTCDay() + 6) % 7
    rows[idx].value += v
    rows[idx].count++
  }
  return rows.map((r) => ({ ...r, value: round(r.value) }))
}

export interface BalancePoint {
  date: string
  balance: number
}

// Closing balance per day, taken from the balance printed on the last transaction of that day.
export function balanceSeries(txns: Txn[]): BalancePoint[] {
  const byDay = new Map<string, number>()
  let known = false
  for (const t of txns) {
    if (typeof t.balance === 'number') {
      byDay.set(t.date, t.balance)
      known = true
    }
  }
  return known ? [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, balance]) => ({ date, balance })) : []
}

export interface Recurring {
  merchant: string
  category: string
  monthly: number
  months: number
  lastDate: string
  annual: number
}

// A merchant charged in at least 3 different months with steady amounts (subscriptions, EMIs, SIPs, rent).
export function recurringCharges(kind: StatementKind, txns: Txn[], o: Options = {}): Recurring[] {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (!spendOf(kind, t, o)) continue
    const key = t.merchant.trim().toLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: Recurring[] = []
  for (const list of groups.values()) {
    const months = new Set(list.map((t) => monthOf(t.date)))
    if (months.size < 3) continue
    const amounts = list.map((t) => t.debit)
    const mean = sum(amounts) / amounts.length
    const sd = Math.sqrt(sum(amounts.map((a) => (a - mean) ** 2)) / amounts.length)
    if (mean <= 0 || sd / mean > 0.2) continue
    const perMonth = round(sum(amounts) / months.size)
    out.push({ merchant: list[0].merchant.trim(), category: list[0].category, monthly: perMonth, months: months.size, lastDate: list.map((t) => t.date).sort().at(-1)!, annual: round(perMonth * 12) })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

// Unusually large single debits (more than 2.5 standard deviations above that category's mean, and not tiny).
export function anomalies(kind: StatementKind, txns: Txn[], limit = 5, o: Options = {}): Txn[] {
  const byCat = new Map<string, number[]>()
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    if (v) byCat.set(t.category, [...(byCat.get(t.category) ?? []), v])
  }
  const flagged: { t: Txn; z: number }[] = []
  for (const t of txns) {
    const v = spendOf(kind, t, o)
    const list = byCat.get(t.category)
    if (!v || !list || list.length < 5) continue
    const mean = sum(list) / list.length
    const sd = Math.sqrt(sum(list.map((x) => (x - mean) ** 2)) / list.length)
    if (sd > 0 && (v - mean) / sd > 2.5 && v > 1000) flagged.push({ t, z: (v - mean) / sd })
  }
  return flagged.sort((a, b) => b.z - a.z).slice(0, limit).map((x) => x.t)
}

// ---------- Bank summary ----------

export interface BankKpis {
  income: number
  spend: number
  net: number
  savingsRate: number
  months: number
  avgMonthlySpend: number
  avgMonthlyIncome: number
  latestBalance: number | null
  runwayMonths: number | null
  txns: number
  cashWithdrawn: number
  largest: Txn | null
  from: string
  to: string
}

export function bankKpis(txns: Txn[], statements: Statement[], o: Options = {}): BankKpis {
  const flow = monthlyFlow('bank', txns, o)
  const income = sum(flow.map((r) => r.income))
  const spend = sum(flow.map((r) => r.spend))
  const months = Math.max(flow.length, 1)
  const balances = balanceSeries(txns)
  const latestFromTxns = balances.at(-1)?.balance ?? null
  const latestStatement = [...statements].filter((s) => typeof s.closingBalance === 'number').sort((a, b) => (a.periodTo ?? '').localeCompare(b.periodTo ?? '')).at(-1)
  const latestBalance = latestFromTxns ?? latestStatement?.closingBalance ?? null
  const avgMonthlySpend = spend / months
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
  return {
    income: round(income),
    spend: round(spend),
    net: round(income - spend),
    savingsRate: income > 0 ? ((income - spend) / income) * 100 : 0,
    months: flow.length,
    avgMonthlySpend: round(avgMonthlySpend),
    avgMonthlyIncome: round(income / months),
    latestBalance,
    runwayMonths: latestBalance !== null && avgMonthlySpend > 0 ? latestBalance / avgMonthlySpend : null,
    txns: txns.length,
    cashWithdrawn: round(sum(txns.filter((t) => t.category === 'Cash Withdrawal').map((t) => t.debit))),
    largest: [...txns].filter((t) => spendOf('bank', t, o)).sort((a, b) => b.debit - a.debit)[0] ?? null,
    from: sorted[0]?.date ?? '',
    to: sorted.at(-1)?.date ?? '',
  }
}

// ---------- Credit-card summary ----------

export interface CardSummary {
  key: string
  label: string
  last4: string
  name: string
  spend: number
  purchases: number
  feesInterest: number
  payments: number
  refunds: number
  txns: number
  limit: number | null
  totalDue: number | null
  minDue: number | null
  dueDate: string | null
  utilisation: number | null
  rewardPoints: number | null
  statements: number
}

export function cardKey(t: { accountKey: string }) {
  return t.accountKey
}

export function cardsSummary(txns: Txn[], statements: Statement[]): CardSummary[] {
  const keys = new Set<string>([...statements.map((s) => s.accountKey), ...txns.map((t) => t.accountKey)])
  const rows: CardSummary[] = []
  for (const key of keys) {
    const st = statements.filter((s) => s.accountKey === key).sort((a, b) => (a.periodTo ?? a.uploadedAt).localeCompare(b.periodTo ?? b.uploadedAt))
    const latest = st.at(-1)
    const list = txns.filter((t) => t.accountKey === key)
    const last4 = latest?.cardLast4 ?? key.split(':')[1] ?? ''
    const name = latest?.cardName ?? 'ICICI card'
    const limit = latest?.creditLimit ?? null
    const totalDue = latest?.totalDue ?? null
    rows.push({
      key,
      last4,
      name,
      label: last4 ? `${name} ••${last4}` : name,
      spend: round(sum(list.map((t) => spendOf('card', t)))),
      purchases: round(sum(list.filter((t) => t.type === 'purchase' || t.type === 'emi').map((t) => t.debit))),
      feesInterest: round(sum(list.filter((t) => t.type === 'fee' || t.type === 'interest').map((t) => t.debit))),
      payments: round(sum(list.filter((t) => t.type === 'payment').map((t) => t.credit))),
      refunds: round(sum(list.filter((t) => t.type === 'refund' || t.type === 'cashback').map((t) => t.credit))),
      txns: list.length,
      limit,
      totalDue,
      minDue: latest?.minDue ?? null,
      dueDate: latest?.dueDate ?? null,
      utilisation: limit && totalDue !== null ? (totalDue / limit) * 100 : null,
      rewardPoints: latest?.rewardPoints ?? null,
      statements: st.length,
    })
  }
  return rows.sort((a, b) => b.spend - a.spend)
}

export function monthlySpendByCard(txns: Txn[]): { months: string[]; keys: string[]; values: Record<string, number[]> } {
  const months = [...new Set(txns.map((t) => monthOf(t.date)))].sort()
  const keys = [...new Set(txns.map((t) => t.accountKey))]
  const values: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, months.map(() => 0)]))
  for (const t of txns) {
    const v = spendOf('card', t)
    if (v) values[t.accountKey][months.indexOf(monthOf(t.date))] += v
  }
  for (const k of keys) values[k] = values[k].map(round)
  return { months, keys, values }
}

// ---------- Fingerprint + AI context ----------

export function fingerprint(txns: Txn[]): string {
  const dates = txns.map((t) => t.date).sort()
  return `${txns.length}:${round(sum(txns.map((t) => t.debit)))}:${round(sum(txns.map((t) => t.credit)))}:${dates[0] ?? ''}:${dates.at(-1) ?? ''}`
}

const top = <T,>(xs: T[], n: number) => xs.slice(0, n)

export function aiContext(kind: StatementKind, data: StatementsData, o: Options = {}) {
  const txns = data.transactions
  const flow = monthlyFlow(kind, txns, o)
  const cats = categoryTotals(kind, txns, o)
  const merchants = merchantTotals(kind, txns, o)
  const recurring = recurringCharges(kind, txns, o)
  const odd = anomalies(kind, txns, 5, o)
  const base = {
    currency: 'INR',
    period: { from: [...txns].map((t) => t.date).sort()[0], to: [...txns].map((t) => t.date).sort().at(-1) },
    transactions: txns.length,
    monthly: flow.map((r) => ({ month: r.month, income: r.income, spend: r.spend, net: r.net, savingsRatePct: Math.round(r.savingsRate) })),
    topCategories: top(cats, 12).map((c) => ({ category: c.label, spend: c.value, count: c.count })),
    topMerchants: top(merchants, 15).map((m) => ({ merchant: m.label, spend: m.value, count: m.count })),
    recurring: top(recurring, 10).map((r) => ({ merchant: r.merchant, monthly: r.monthly, months: r.months })),
    unusualLargeDebits: odd.map((t) => ({ date: t.date, merchant: t.merchant, category: t.category, amount: t.debit })),
  }
  if (kind === 'bank') {
    const k = bankKpis(txns, data.statements, o)
    return {
      ...base,
      totals: { income: k.income, spend: k.spend, net: k.net, savingsRatePct: Math.round(k.savingsRate), avgMonthlySpend: k.avgMonthlySpend, avgMonthlyIncome: k.avgMonthlyIncome, cashWithdrawn: k.cashWithdrawn },
      latestBalance: k.latestBalance,
      runwayMonths: k.runwayMonths === null ? null : Math.round(k.runwayMonths * 10) / 10,
      channels: Object.entries(txns.reduce<Record<string, number>>((m, t) => ((m[t.channel ?? 'Other'] = (m[t.channel ?? 'Other'] ?? 0) + t.debit), m), {})).map(([channel, spend]) => ({ channel, spend: round(spend) })),
    }
  }
  const cards = cardsSummary(txns, data.statements)
  return {
    ...base,
    cards: cards.map((c) => ({
      card: c.label,
      spend: c.spend,
      purchases: c.purchases,
      feesAndInterest: c.feesInterest,
      paymentsMade: c.payments,
      refundsAndCashback: c.refunds,
      creditLimit: c.limit,
      latestTotalDue: c.totalDue,
      minimumDue: c.minDue,
      dueDate: c.dueDate,
      utilisationPct: c.utilisation === null ? null : Math.round(c.utilisation),
      rewardPoints: c.rewardPoints,
      topCategories: top(categoryTotals('card', txns.filter((t) => t.accountKey === c.key)), 5).map((x) => ({ category: x.label, spend: x.value })),
    })),
    totals: {
      spend: round(sum(cards.map((c) => c.spend))),
      feesAndInterest: round(sum(cards.map((c) => c.feesInterest))),
      payments: round(sum(cards.map((c) => c.payments))),
    },
  }
}
