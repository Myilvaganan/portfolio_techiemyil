import type { ReportDoc, ReportSection } from './report'
import { formatInr } from './kite'
import {
  anomalies,
  bankKpis,
  cardsSummary,
  categoryTotals,
  dayLabel,
  merchantTotals,
  monthLabel,
  monthlyFlow,
  recurringCharges,
  type AiInsights,
  type Options,
  type Statement,
  type Txn,
} from './statements'

const inr = (n: number) => formatInr(n)
const signed = (n: number) => `${n < 0 ? '-' : n > 0 ? '+' : ''}${formatInr(n)}`

function aiSections(ai: AiInsights | null): ReportSection[] {
  if (!ai) return []
  return [
    { title: 'AI analysis', note: `Health score ${ai.score.value}/100 — ${ai.score.label} · ${ai.model}`, text: `${ai.headline}. ${ai.summary}`, bullets: ai.highlights.map((h) => ({ text: `${h.title}: ${h.detail}`, tone: h.tone })) },
    { title: 'Recommended actions', bullets: [...ai.tips.map((t) => ({ text: `${t.title}. ${t.detail}`, tone: 'info' as const })), ...ai.risks.map((r) => ({ text: r, tone: 'warn' as const }))] },
  ]
}

const range = (txns: Txn[]) => {
  const d = txns.map((t) => t.date).sort()
  return d.length ? `${dayLabel(d[0])} – ${dayLabel(d.at(-1)!)}` : 'No data'
}

export function bankReport(txns: Txn[], statements: Statement[], ai: AiInsights | null, o: Options, accountLabel: string): ReportDoc {
  const k = bankKpis(txns, statements, o)
  const flow = monthlyFlow('bank', txns, o)
  const cats = categoryTotals('bank', txns, o)
  const merchants = merchantTotals('bank', txns, o)
  const recurring = recurringCharges('bank', txns, o)
  const odd = anomalies('bank', txns, 5, o)
  return {
    title: 'Bank statement report',
    subtitle: `${accountLabel} · ${range(txns)}${o.excludeTransfers ? ' · own transfers excluded' : ''}`,
    sections: [
      {
        title: 'Summary',
        kpis: [
          { label: 'Money in', value: inr(k.income), note: `${inr(k.avgMonthlyIncome)} / month` },
          { label: 'Money out', value: inr(k.spend), note: `${inr(k.avgMonthlySpend)} / month` },
          { label: 'Net cash flow', value: signed(k.net), tone: k.net >= 0 ? 'good' : 'bad' },
          { label: 'Savings rate', value: `${k.savingsRate.toFixed(0)}%`, tone: k.savingsRate >= 20 ? 'good' : 'warn' },
          { label: 'Latest balance', value: k.latestBalance === null ? '—' : inr(k.latestBalance), note: k.runwayMonths === null ? undefined : `${k.runwayMonths.toFixed(1)} months of spending` },
          { label: 'Cash withdrawn', value: inr(k.cashWithdrawn) },
        ],
      },
      ...aiSections(ai),
      { title: 'Month by month', table: { columns: ['Month', 'Money in', 'Money out', 'Net', 'Savings rate'], rows: flow.map((r) => [monthLabel(r.month, true), inr(r.income), inr(r.spend), signed(r.net), `${r.savingsRate.toFixed(0)}%`]), rightAlign: [1, 2, 3, 4] } },
      { title: 'Where the money went', bars: cats.slice(0, 12).map((c) => ({ label: c.label, value: c.value, display: `${inr(c.value)} · ${c.count}` })) },
      { title: 'Top merchants', bars: merchants.slice(0, 12).map((m) => ({ label: m.label, value: m.value, display: `${inr(m.value)} · ${m.count}×` })) },
      ...(recurring.length ? [{ title: 'Recurring charges', note: 'Merchants charged in 3+ months with steady amounts.', table: { columns: ['Merchant', 'Category', 'Monthly', 'Yearly', 'Months seen'], rows: recurring.map((r) => [r.merchant, r.category, inr(r.monthly), inr(r.annual), r.months]), rightAlign: [2, 3, 4] } }] : []),
      ...(odd.length ? [{ title: 'Unusually large debits', table: { columns: ['Date', 'Merchant', 'Category', 'Amount'], rows: odd.map((t) => [dayLabel(t.date), t.merchant, t.category, inr(t.debit)]), rightAlign: [3] } }] : []),
      { title: 'Transactions', table: { columns: ['Date', 'Merchant', 'Category', 'Channel', 'Debit', 'Credit', 'Balance'], rows: [...txns].sort((a, b) => b.date.localeCompare(a.date)).map((t) => [dayLabel(t.date), t.merchant, t.category, t.channel ?? '', t.debit ? inr(t.debit) : '', t.credit ? inr(t.credit) : '', typeof t.balance === 'number' ? inr(t.balance) : '']), rightAlign: [4, 5, 6] } },
    ],
  }
}

export function cardReport(txns: Txn[], statements: Statement[], ai: AiInsights | null, cardLabel: string): ReportDoc {
  const cards = cardsSummary(txns, statements)
  const cats = categoryTotals('card', txns)
  const merchants = merchantTotals('card', txns)
  const flow = monthlyFlow('card', txns)
  const recurring = recurringCharges('card', txns)
  const totals = cards.reduce((a, c) => ({ spend: a.spend + c.spend, fees: a.fees + c.feesInterest, pay: a.pay + c.payments, due: a.due + (c.totalDue ?? 0), limit: a.limit + (c.limit ?? 0) }), { spend: 0, fees: 0, pay: 0, due: 0, limit: 0 })
  const labels = Object.fromEntries(cards.map((c) => [c.key, c.label]))
  return {
    title: 'Credit card report',
    subtitle: `${cardLabel} · ${range(txns)}`,
    sections: [
      {
        title: 'Summary',
        kpis: [
          { label: 'Spend', value: inr(totals.spend) },
          { label: 'Fees & interest', value: inr(totals.fees), tone: totals.fees > 0 ? 'bad' : 'good', note: totals.spend ? `${((totals.fees / totals.spend) * 100).toFixed(1)}% of spend` : undefined },
          { label: 'Payments made', value: inr(totals.pay) },
          { label: 'Total due (latest)', value: inr(totals.due) },
          { label: 'Utilisation', value: totals.limit ? `${((totals.due / totals.limit) * 100).toFixed(0)}%` : '—', note: totals.limit ? `of ${inr(totals.limit)}` : undefined },
        ],
      },
      ...aiSections(ai),
      { title: 'Cards', table: { columns: ['Card', 'Spend', 'Fees & interest', 'Payments', 'Total due', 'Min due', 'Due date', 'Utilisation'], rows: cards.map((c) => [c.label, inr(c.spend), inr(c.feesInterest), inr(c.payments), c.totalDue === null ? '—' : inr(c.totalDue), c.minDue === null ? '—' : inr(c.minDue), c.dueDate ? dayLabel(c.dueDate) : '—', c.utilisation === null ? '—' : `${c.utilisation.toFixed(0)}%`]), rightAlign: [1, 2, 3, 4, 5, 7] } },
      { title: 'Month by month spend', table: { columns: ['Month', 'Spend', 'Transactions'], rows: flow.map((r) => [monthLabel(r.month, true), inr(r.spend), r.txns]), rightAlign: [1, 2] } },
      { title: 'Where the money went', bars: cats.slice(0, 12).map((c) => ({ label: c.label, value: c.value, display: `${inr(c.value)} · ${c.count}` })) },
      { title: 'Top merchants', bars: merchants.slice(0, 12).map((m) => ({ label: m.label, value: m.value, display: `${inr(m.value)} · ${m.count}×` })) },
      ...(recurring.length ? [{ title: 'Recurring charges & EMIs', table: { columns: ['Merchant', 'Monthly', 'Yearly', 'Months seen'], rows: recurring.map((r) => [r.merchant, inr(r.monthly), inr(r.annual), r.months]), rightAlign: [1, 2, 3] } }] : []),
      { title: 'Transactions', table: { columns: ['Date', 'Card', 'Merchant', 'Category', 'Type', 'Charge', 'Credit'], rows: [...txns].sort((a, b) => b.date.localeCompare(a.date)).map((t) => [dayLabel(t.date), labels[t.accountKey] ?? '', t.merchant, t.category, t.type ?? '', t.debit ? inr(t.debit) : '', t.credit ? inr(t.credit) : '']), rightAlign: [5, 6] } },
    ],
  }
}
