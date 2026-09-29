import type { Habit, HabitsDoc } from '../growthApi'
import type { Txn } from '../statements'
import type { DailyLog } from '../health'

// Daily habits as streaks. Manual habits are ticked by hand; automatic ones are read from data you already have.
// An automatic habit is "unknown" (not failed) on a day the data doesn't cover yet — no statement imported, no log.

export type DayState = 'done' | 'missed' | 'unknown'

export const DELIVERY = /swiggy|zomato|zepto|blinkit|instamart|dunzo|eatsure|domino|pizza hut|kfc|mcdonald/i

export interface AutoData {
  txns: Txn[]
  /** Latest date covered by imported statements. */
  statementsTo: string
  health: DailyLog[]
  /** Trading days that broke a guardrail. */
  breachDays: Set<string>
}

export function dayState(h: Habit, date: string, doc: HabitsDoc, auto: AutoData): DayState {
  if (!h.auto) return doc.checks[date]?.includes(h.id) ? 'done' : 'missed'
  if (h.auto === 'no-delivery') {
    if (date > auto.statementsTo) return 'unknown'
    return auto.txns.some((t) => t.date === date && t.debit > 0 && DELIVERY.test(`${t.merchant} ${t.description}`)) ? 'missed' : 'done'
  }
  if (h.auto === 'rules') return auto.breachDays.has(date) ? 'missed' : 'done'
  const log = auto.health.find((l) => l.date === date)
  if (h.auto === 'steps') return log?.steps == null ? 'unknown' : log.steps >= (h.target || 10000) ? 'done' : 'missed'
  if (h.auto === 'sleep') return log?.sleepH == null ? 'unknown' : log.sleepH >= (h.target || 7) ? 'done' : 'missed'
  return 'unknown'
}

const shift = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Current streak: consecutive done days ending today, or yesterday if today isn't done yet. Unknown days are skipped. */
export function streak(h: Habit, today: string, doc: HabitsDoc, auto: AutoData): number {
  let day = dayState(h, today, doc, auto) === 'done' ? today : shift(today, -1)
  let n = 0
  for (let i = 0; i < 400; i++) {
    const st = dayState(h, day, doc, auto)
    if (st === 'done') n++
    else if (st === 'missed') break
    day = shift(day, -1)
  }
  return n
}

export function lastDays(today: string, n: number) {
  return Array.from({ length: n }, (_, i) => shift(today, i - n + 1))
}

/** Share of known days done over the window, 0–100 (null when no day is known). */
export function rate(h: Habit, days: string[], doc: HabitsDoc, auto: AutoData): number | null {
  const states = days.map((d) => dayState(h, d, doc, auto)).filter((st) => st !== 'unknown')
  return states.length ? (states.filter((st) => st === 'done').length / states.length) * 100 : null
}

export function toggle(doc: HabitsDoc, habitId: string, date: string): HabitsDoc {
  const cur = doc.checks[date] ?? []
  const next = cur.includes(habitId) ? cur.filter((x) => x !== habitId) : [...cur, habitId]
  const checks = { ...doc.checks }
  if (next.length) checks[date] = next
  else delete checks[date]
  return { ...doc, checks }
}
