import type { ReportDoc, ReportSection } from './report'
import type { DailyLog } from './health'
import type { FoodEntry, FoodProfile, HabitsDoc, Med, MoodDay, WaterDoc } from './growthApi'
import { medDueOn } from './growthApi'
import { MEALS, dayTotals, targets, topFoods } from './calories'

// Monthly reports for health: the calorie log on its own, and everything health-related for the month in one place.
// Both open as standalone pages that print to PDF.

const daysOf = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}
const r0 = (n: number) => Math.round(n)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' })

/** First and last weight logged in the month (from the daily Health log). */
function weightChange(logs: DailyLog[], month: string) {
  const w = logs.filter((l) => l.date.startsWith(month) && l.weight != null).sort((a, b) => a.date.localeCompare(b.date))
  if (!w.length) return null
  return { first: w[0].weight!, last: w[w.length - 1].weight!, change: w[w.length - 1].weight! - w[0].weight!, count: w.length }
}

export function calorieMonthReport(o: { month: string; label: string; entries: FoodEntry[]; profile: FoodProfile; logs: DailyLog[]; today: string }): ReportDoc {
  const latestW = [...o.logs].filter((l) => l.weight != null).sort((a, b) => b.date.localeCompare(a.date))[0]?.weight ?? 0
  const t = targets(o.profile, latestW)
  const days = daysOf(o.month).filter((d) => d <= o.today)
  const logged = days.filter((d) => o.entries.some((e) => e.date === d))
  const tot = logged.map((d) => ({ d, ...dayTotals(o.entries, d) }))
  const onTarget = t ? tot.filter((x) => Math.abs(x.kcal - t.kcal) <= t.kcal * 0.1).length : 0
  const over = t ? tot.filter((x) => x.kcal > t.kcal * 1.1).length : 0
  const avgK = avg(tot.map((x) => x.kcal))
  const wc = weightChange(o.logs, o.month)
  const mealTotals = MEALS.map((m) => ({ ...m, kcal: tot.reduce((s, x) => s + x.byMeal[m.id], 0) }))
  const allKcal = mealTotals.reduce((s, m) => s + m.kcal, 0) || 1
  const sections: ReportSection[] = [
    {
      title: 'Summary',
      kpis: [
        { label: 'Daily target', value: t ? `${t.kcal} kcal` : '—' },
        { label: 'Average eaten', value: logged.length ? `${r0(avgK)} kcal` : '—', tone: t && avgK > t.kcal * 1.05 ? 'bad' : 'good' },
        { label: 'Days logged', value: `${logged.length} / ${days.length}` },
        { label: 'Days on target (±10%)', value: String(onTarget), tone: 'good' },
        { label: 'Days over', value: String(over), tone: over ? 'warn' : 'good' },
        { label: 'Weight change', value: wc ? `${wc.change > 0 ? '+' : ''}${wc.change.toFixed(1)} kg` : '—', note: wc ? `${wc.first} → ${wc.last} kg` : 'No weights logged', tone: wc && wc.change < 0 && o.profile.goal === 'lose' ? 'good' : undefined },
      ],
    },
    {
      title: 'Average macros per logged day',
      kpis: [
        { label: 'Protein', value: `${r0(avg(tot.map((x) => x.protein)))} g`, note: t?.protein ? `target ${t.protein} g` : undefined },
        { label: 'Carbs', value: `${r0(avg(tot.map((x) => x.carbs)))} g`, note: t?.carbs ? `target ${t.carbs} g` : undefined },
        { label: 'Fat', value: `${r0(avg(tot.map((x) => x.fat)))} g`, note: t?.fat ? `target ${t.fat} g` : undefined },
        { label: 'Fibre', value: `${r0(avg(tot.map((x) => x.fiber)))} g`, note: t ? `target ${t.fiber} g` : undefined },
      ],
    },
    { title: 'Calories by meal', bars: mealTotals.map((m) => ({ label: m.label, value: m.kcal, display: `${r0(m.kcal)} kcal · ${r0((m.kcal / allKcal) * 100)}%` })) },
    { title: 'Biggest calorie sources', table: { columns: ['Food', 'Times', 'Calories'], rows: topFoods(o.entries, new Set(days), 10).map((f) => [f.name, f.times, `${r0(f.kcal)} kcal`]), rightAlign: [1, 2] } },
    {
      title: 'Day by day',
      table: {
        columns: ['Day', 'Calories', 'vs target', 'Protein', 'Carbs', 'Fat'],
        rows: tot.map((x) => [fmtDay(x.d), r0(x.kcal), t ? `${x.kcal >= t.kcal ? '+' : ''}${r0(x.kcal - t.kcal)}` : '—', `${r0(x.protein)} g`, `${r0(x.carbs)} g`, `${r0(x.fat)} g`]),
        rightAlign: [1, 2, 3, 4, 5],
      },
    },
  ]
  return { title: `Calorie report — ${o.label}`, subtitle: `${logged.length} days logged · target ${t ? `${t.kcal} kcal` : 'not set'}`, sections }
}

export function healthMonthReport(o: {
  month: string
  label: string
  today: string
  logs: DailyLog[]
  food: { entries: FoodEntry[]; profile: FoodProfile }
  water: WaterDoc
  mood: Record<string, MoodDay>
  meds: { items: Med[]; taken: Record<string, string[]> }
  habits: HabitsDoc
}): ReportDoc {
  const days = daysOf(o.month).filter((d) => d <= o.today)
  const wc = weightChange(o.logs, o.month)
  const monthLogs = o.logs.filter((l) => l.date.startsWith(o.month))
  const steps = monthLogs.filter((l) => l.steps != null).map((l) => l.steps!)
  const target = o.water.customMl || o.water.targetMl
  const waterDays = days.filter((d) => o.water.logs[d])
  const met = target ? waterDays.filter((d) => o.water.logs[d] >= target).length : 0
  const moodDays = days.map((d) => o.mood[d]).filter(Boolean)
  const sleeps = [...moodDays.filter((m) => m.sleepH > 0).map((m) => m.sleepH), ...monthLogs.filter((l) => l.sleepH != null && !o.mood[l.date]).map((l) => l.sleepH!)]
  const moods = moodDays.filter((m) => m.mood).map((m) => m.mood)
  const food = days.filter((d) => o.food.entries.some((e) => e.date === d)).map((d) => dayTotals(o.food.entries, d))
  const medRows = o.meds.items.map((m) => {
    let due = 0
    let taken = 0
    for (const d of days) {
      if (!medDueOn(m, d)) continue
      due += m.hours.length
      taken += (o.meds.taken[d] ?? []).filter((k) => k.startsWith(`${m.id}@`)).length
    }
    return [m.name, due, taken, due ? `${r0((taken / due) * 100)}%` : '—']
  })
  const habitRows = o.habits.habits.filter((h) => !h.auto).map((h) => {
    const n = days.filter((d) => o.habits.checks[d]?.includes(h.id)).length
    return [h.name, n, `${r0((n / Math.max(1, days.length)) * 100)}%`]
  })
  const weights = monthLogs.filter((l) => l.weight != null).sort((a, b) => a.date.localeCompare(b.date))
  const sections: ReportSection[] = [
    {
      title: 'Body',
      kpis: [
        { label: 'Weight', value: wc ? `${wc.last} kg` : '—', note: wc ? `${wc.change > 0 ? '+' : ''}${wc.change.toFixed(1)} kg this month` : 'Log your weight weekly' },
        { label: 'Weigh-ins', value: String(weights.length), tone: weights.length >= 4 ? 'good' : 'warn' },
        { label: 'Average steps', value: steps.length ? r0(avg(steps)).toLocaleString('en-IN') : '—' },
      ],
      bars: weights.map((l) => ({ label: fmtDay(l.date), value: l.weight!, display: `${l.weight} kg` })),
    },
    {
      title: 'Food & water',
      kpis: [
        { label: 'Average calories', value: food.length ? `${r0(avg(food.map((f) => f.kcal)))} kcal` : '—', note: `${food.length} days logged` },
        { label: 'Average protein', value: food.length ? `${r0(avg(food.map((f) => f.protein)))} g` : '—' },
        { label: 'Water target met', value: target ? `${met} / ${days.length} days` : '—', tone: met >= days.length * 0.7 ? 'good' : 'warn' },
        { label: 'Average water', value: waterDays.length ? `${(avg(waterDays.map((d) => o.water.logs[d])) / 1000).toFixed(1)} L` : '—' },
      ],
    },
    {
      title: 'Sleep & mood',
      kpis: [
        { label: 'Average sleep', value: sleeps.length ? `${avg(sleeps).toFixed(1)} h` : '—', tone: sleeps.length && avg(sleeps) < 6.5 ? 'bad' : 'good' },
        { label: 'Nights under 6.5 h', value: String(sleeps.filter((h) => h < 6.5).length) },
        { label: 'Average mood', value: moods.length ? `${avg(moods).toFixed(1)} / 5` : '—' },
      ],
    },
  ]
  if (medRows.length) sections.push({ title: 'Medicines taken', table: { columns: ['Medicine', 'Doses due', 'Taken', 'Adherence'], rows: medRows, rightAlign: [1, 2, 3] } })
  if (habitRows.length) sections.push({ title: 'Habits', table: { columns: ['Habit', 'Days done', 'Share'], rows: habitRows, rightAlign: [1, 2] } })
  return { title: `Health report — ${o.label}`, subtitle: 'Weight, food, water, sleep, mood, medicines and habits for the month', sections }
}
