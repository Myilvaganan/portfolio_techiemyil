import { netInr, type JournalSettings, type Trade } from './journal'
import type { GateDay } from './growthApi'

// The pre-market check-in. From how you slept and feel, whether you've read your rules, your recent results and the
// day itself, it recommends a position size: full, half, or sit out. The reasons are listed, so it's never a mystery.

export type Size = 'full' | 'half' | 'skip'
export interface GateAdvice {
  size: Size
  reasons: string[]
  ready: boolean
}

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export function gateAdvice(o: { day: GateDay | undefined; today: string; trades: Trade[]; settings: JournalSettings | null; checklistLength: number; chandrashtamam?: boolean }): GateAdvice {
  const { day, today, trades, settings } = o
  const reasons: string[] = []
  let size = 'full' as Size
  const lower = (to: Size, why: string) => {
    reasons.push(why)
    if (to === 'skip' || (to === 'half' && size === 'full')) size = to
  }
  const ready = Boolean(day && day.sleep && day.mood && day.rulesRead && (o.checklistLength === 0 || day.checks.length >= o.checklistLength))

  const todayPnl = trades.filter((t) => t.date === today).reduce((s, t) => s + netInr(t), 0)
  if (settings && settings.dailyLossLimit > 0 && todayPnl <= -settings.dailyLossLimit) lower('skip', 'Daily loss limit already hit today.')
  if (day?.sleep && day.sleep <= 1) lower('skip', 'Very poor sleep — decisions suffer.')
  else if (day?.sleep && day.sleep <= 2) lower('half', 'Short on sleep.')
  if (day?.mood && day.mood <= 1) lower('skip', 'Low mood — high risk of revenge trading.')
  else if (day?.mood && day.mood <= 2) lower('half', 'Mood is low.')

  // Losing streak: the last three trading days, all red.
  const byDay = new Map<string, number>()
  for (const t of trades) if (t.date < today && t.date >= shift(today, -14)) byDay.set(t.date, (byDay.get(t.date) ?? 0) + netInr(t))
  const last3 = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3)
  if (last3.length === 3 && last3.every(([, v]) => v < 0)) lower('half', 'Three losing days in a row — trade smaller until you get a green day.')
  if (o.chandrashtamam) lower('half', 'Chandrashtamam today — go slow.')
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay()
  if (wd === 0 || wd === 6) reasons.push('Weekend — Indian markets are closed (forex only).')
  if (!ready) reasons.push('Finish the check-in first.')
  return { size: ready ? size : size === 'skip' ? 'skip' : 'half', reasons, ready }
}
