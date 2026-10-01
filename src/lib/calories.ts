import type { FoodEntry, FoodProfile, Meal } from './growthApi'

// Daily energy and macro targets (Mifflin–St Jeor BMR × activity, adjusted for the goal), day totals, and the
// patterns worth pointing out.

export const ACTIVITY: Record<FoodProfile['activity'], { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Desk job, little exercise' },
  light: { factor: 1.375, label: 'Light exercise 1–3 days a week' },
  moderate: { factor: 1.55, label: 'Exercise 3–5 days a week' },
  active: { factor: 1.725, label: 'Hard exercise 6–7 days a week' },
  athlete: { factor: 1.9, label: 'Physical job or twice-a-day training' },
}
export const GOAL_ADJUST: Record<FoodProfile['goal'], number> = { lose: -500, maintain: 0, gain: 300 }
export const MEALS: { id: Meal; label: string; emoji: string }[] = [
  { id: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { id: 'lunch', label: 'Lunch', emoji: '🍛' },
  { id: 'dinner', label: 'Dinner', emoji: '🌙' },
  { id: 'snack', label: 'Snacks', emoji: '🍪' },
]

export interface Targets {
  bmr: number
  tdee: number
  kcal: number
  protein: number
  fat: number
  carbs: number
  fiber: number
}

export function targets(p: FoodProfile, weightKg: number): Targets | null {
  const w = p.weightKg || weightKg
  if (!w || !p.heightCm || !p.age) return p.customKcal ? { bmr: 0, tdee: 0, kcal: p.customKcal, protein: 0, fat: 0, carbs: 0, fiber: 30 } : null
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
  const tdee = bmr * ACTIVITY[p.activity].factor
  const kcal = p.customKcal || Math.max(p.sex === 'male' ? 1500 : 1200, Math.round((tdee + GOAL_ADJUST[p.goal]) / 10) * 10)
  // Protein 1.6 g/kg (2 g/kg while losing, to keep muscle); fat 25% of energy; the rest carbs.
  const protein = Math.round(w * (p.goal === 'lose' ? 2 : 1.6))
  const fat = Math.round((kcal * 0.25) / 9)
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, fat, carbs, fiber: p.sex === 'male' ? 38 : 25 }
}

export interface DayTotals {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  byMeal: Record<Meal, number>
}

export function dayTotals(entries: FoodEntry[], date: string): DayTotals {
  const t: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, byMeal: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 } }
  for (const e of entries) {
    if (e.date !== date) continue
    t.kcal += e.kcal
    t.protein += e.protein
    t.carbs += e.carbs
    t.fat += e.fat
    t.fiber += e.fiber
    t.byMeal[e.meal] += e.kcal
  }
  return t
}

/** Days in a row with something logged, ending today (or yesterday if today is empty so far). */
export function logStreak(entries: FoodEntry[], today: string) {
  const days = new Set(entries.map((e) => e.date))
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  let d = days.has(today) ? today : shift(today, -1)
  let n = 0
  while (days.has(d) && n < 3650) {
    n++
    d = shift(d, -1)
  }
  return n
}

export interface Insight {
  tone: 'good' | 'warn' | 'info'
  text: string
}

/** Patterns over the logged days in `days` (YYYY-MM-DD list). */
export function insights(entries: FoodEntry[], days: string[], t: Targets | null): Insight[] {
  const logged = days.filter((d) => entries.some((e) => e.date === d))
  if (logged.length < 3 || !t) return []
  const tot = logged.map((d) => dayTotals(entries, d))
  const avg = (k: keyof Omit<DayTotals, 'byMeal'>) => tot.reduce((s, x) => s + x[k], 0) / tot.length
  const out: Insight[] = []
  const kcal = avg('kcal')
  const diff = kcal - t.kcal
  if (Math.abs(diff) <= t.kcal * 0.05) out.push({ tone: 'good', text: `You’re averaging ${Math.round(kcal)} kcal — right on your ${t.kcal} target.` })
  else out.push({ tone: 'warn', text: `You’re averaging ${Math.round(kcal)} kcal, ${Math.abs(Math.round(diff))} ${diff > 0 ? 'over' : 'under'} your ${t.kcal} target. That’s about ${Math.abs(diff * 7 / 7700).toFixed(2)} kg a week ${diff > 0 ? 'gained' : 'lost'}.` })
  if (t.protein && avg('protein') < t.protein * 0.8) out.push({ tone: 'warn', text: `Protein is low: ${Math.round(avg('protein'))} g a day against ${t.protein} g. Add eggs, paneer, dal, curd, chicken or a whey scoop.` })
  if (avg('fiber') < t.fiber * 0.6) out.push({ tone: 'info', text: `Fibre averages ${Math.round(avg('fiber'))} g — aim for ${t.fiber} g with vegetables, fruit and whole grains.` })
  const snackShare = tot.reduce((s, x) => s + x.byMeal.snack, 0) / Math.max(1, tot.reduce((s, x) => s + x.kcal, 0))
  if (snackShare > 0.25) out.push({ tone: 'warn', text: `${Math.round(snackShare * 100)}% of your calories come from snacks.` })
  const dinnerShare = tot.reduce((s, x) => s + x.byMeal.dinner, 0) / Math.max(1, tot.reduce((s, x) => s + x.kcal, 0))
  if (dinnerShare > 0.4) out.push({ tone: 'info', text: `Dinner is ${Math.round(dinnerShare * 100)}% of the day — a lighter dinner usually helps sleep and weight.` })
  const fatPct = (avg('fat') * 9) / Math.max(1, kcal)
  if (fatPct > 0.35) out.push({ tone: 'info', text: `Fat is ${Math.round(fatPct * 100)}% of your energy — watch the oil and ghee.` })
  return out
}

/** Foods that add the most calories over the period. */
export function topFoods(entries: FoodEntry[], days: Set<string>, n = 5) {
  const map = new Map<string, { kcal: number; times: number }>()
  for (const e of entries) {
    if (!days.has(e.date)) continue
    const k = e.name.toLowerCase()
    const cur = map.get(k) ?? { kcal: 0, times: 0 }
    map.set(k, { kcal: cur.kcal + e.kcal, times: cur.times + 1 })
  }
  return [...map.entries()].sort((a, b) => b[1].kcal - a[1].kcal).slice(0, n).map(([name, v]) => ({ name, ...v }))
}
