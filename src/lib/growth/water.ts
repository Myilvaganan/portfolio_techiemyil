import type { WaterActivity, WaterDoc } from '../growthApi'
import type { DailyLog } from '../health'

// Daily water from body weight: ~35 ml per kg, more on active or hot days, kept between 1.5 and 5 litres.

export const ML_PER_KG = 35
export const ACTIVITY_EXTRA: Record<WaterActivity, number> = { low: 0, moderate: 350, high: 700 }
export const HOT_EXTRA = 500

/** The newest weight in the Health log, or null. */
export function latestWeight(logs: DailyLog[]): { kg: number; date: string } | null {
  let best: { kg: number; date: string } | null = null
  for (const l of logs) if (l.weight != null && l.weight > 0 && (!best || l.date > best.date)) best = { kg: l.weight, date: l.date }
  return best
}

export interface TargetBreakdown {
  weightKg: number
  base: number
  activity: number
  hot: number
  /** Weight-based target, rounded to 50 ml. */
  recommended: number
  /** The target in force (the custom one when set). */
  target: number
}

export function waterTarget(doc: Pick<WaterDoc, 'weightKg' | 'activity' | 'hot' | 'customMl'>, logWeight: number | null): TargetBreakdown | null {
  const weightKg = doc.weightKg || logWeight || 0
  if (!weightKg && !doc.customMl) return null
  const base = weightKg * ML_PER_KG
  const activity = ACTIVITY_EXTRA[doc.activity]
  const hot = doc.hot ? HOT_EXTRA : 0
  const recommended = weightKg ? Math.min(5000, Math.max(1500, Math.round((base + activity + hot) / 50) * 50)) : 0
  return { weightKg, base, activity, hot, recommended, target: doc.customMl || recommended }
}

export function addWater(doc: WaterDoc, date: string, ml: number): WaterDoc {
  const next = Math.max(0, Math.min(20000, (doc.logs[date] || 0) + ml))
  const logs = { ...doc.logs }
  if (next) logs[date] = next
  else delete logs[date]
  return { ...doc, logs }
}

const shift = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Consecutive days at or over target, ending today (or yesterday while today is still in progress). */
export function waterStreak(doc: WaterDoc, today: string, target: number): number {
  if (!target) return 0
  let day = (doc.logs[today] || 0) >= target ? today : shift(today, -1)
  let n = 0
  while ((doc.logs[day] || 0) >= target && n < 1000) {
    n++
    day = shift(day, -1)
  }
  return n
}

/** Calendar grid for a month (YYYY-MM): leading blanks for a Monday start, then each date. */
export function monthGrid(month: string): (string | null)[] {
  const first = new Date(`${month}-01T00:00:00Z`)
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
}

export function shiftMonth(month: string, n: number) {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

/** Month summary up to today: days logged, days on target, average litres on logged days. */
export function monthStats(doc: WaterDoc, month: string, today: string, target: number) {
  const dates = monthGrid(month).filter((d): d is string => !!d && d <= today)
  const logged = dates.filter((d) => doc.logs[d])
  const met = target ? logged.filter((d) => doc.logs[d] >= target).length : 0
  const avg = logged.length ? logged.reduce((s, d) => s + doc.logs[d], 0) / logged.length : 0
  return { days: dates.length, logged: logged.length, met, avg }
}
