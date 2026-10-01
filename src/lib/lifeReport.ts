import type { ReportDoc, ReportSection } from './report'
import type { MonthFigures } from './growth/review'
import type { HabitsDoc, MoodDay, Receipt, TasksDoc, WaterDoc } from './growthApi'

// One printable page for the whole month: money, trading, habits, water, focus, sleep and cash receipts. Opens as a
// standalone page that prints to PDF.

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const signed = (n: number) => `${n < 0 ? '−' : '+'}${inr(Math.abs(n))}`

export function lifeMonthReport(o: {
  month: string
  label: string
  f: MonthFigures
  habits: HabitsDoc
  water: WaterDoc
  tasks: TasksDoc
  mood: Record<string, MoodDay>
  receipts: Receipt[]
}): ReportDoc {
  const { month, f } = o
  const inMonth = (d: string) => d.startsWith(month)
  const target = o.water.customMl || o.water.targetMl
  const waterDays = Object.entries(o.water.logs).filter(([d]) => inMonth(d))
  const met = target ? waterDays.filter(([, ml]) => ml >= target).length : 0
  const focus = o.tasks.sessions.filter((x) => inMonth(x.date)).reduce((s, x) => s + x.minutes, 0)
  const done = o.tasks.tasks.filter((t) => t.done && inMonth(t.doneOn)).length
  const moods = Object.entries(o.mood).filter(([d]) => inMonth(d)).map(([, v]) => v)
  const avgMood = moods.filter((v) => v.mood).reduce((s, v, _, a) => s + v.mood / a.length, 0)
  const rec = o.receipts.filter((r) => inMonth(r.date))
  const byCat = new Map<string, number>()
  for (const r of rec) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount)

  const sections: ReportSection[] = [
    {
      title: 'Money',
      kpis: [
        { label: 'Spent', value: inr(f.spend) },
        { label: 'Income', value: inr(f.income), tone: 'good' },
        { label: 'Wants', value: inr(f.wants), tone: 'warn' },
        { label: 'Net worth', value: f.netWorth != null ? inr(f.netWorth) : '—' },
      ],
      bullets: f.overBudget.map((b) => ({ text: `${b.category}: ${inr(b.spent)} of ${inr(b.limit)} budget`, tone: 'bad' as const })),
    },
    {
      title: 'Trading',
      kpis: [
        { label: 'P&L', value: signed(f.tradingPnl), tone: f.tradingPnl >= 0 ? 'good' : 'bad' },
        { label: 'Trades', value: String(f.trades) },
        { label: 'Rules broken', value: String(f.breaks), tone: f.breaks ? 'bad' : 'good' },
        { label: 'Cost of broken rules', value: inr(f.breakCost), tone: f.breakCost ? 'bad' : 'good' },
      ],
    },
    {
      title: 'Habits & health',
      kpis: [
        { label: 'Habit ticks', value: String(Object.entries(o.habits.checks).filter(([d]) => inMonth(d)).reduce((s, [, v]) => s + v.length, 0)) },
        { label: 'Water target met', value: `${met} days` },
        { label: 'Avg sleep', value: f.sleepAvg != null ? `${f.sleepAvg.toFixed(1)} h` : '—' },
        { label: 'Avg mood', value: avgMood ? `${avgMood.toFixed(1)} / 5` : '—' },
      ],
    },
    {
      title: 'Focus',
      kpis: [
        { label: 'Focused time', value: `${Math.floor(focus / 60)}h ${focus % 60}m` },
        { label: 'Tasks done', value: String(done) },
      ],
    },
  ]
  if (rec.length) {
    sections.push({
      title: 'Cash receipts',
      note: `${rec.length} receipts · ${inr(rec.reduce((s, r) => s + r.amount, 0))}`,
      bars: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, display: inr(value) })),
    })
  }
  return { title: `Life report — ${o.label}`, subtitle: 'Money, trading, habits, health and focus for the month', sections }
}
