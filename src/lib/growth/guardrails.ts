import { netInr, type JournalSettings, type Trade } from '../journal'
import type { GuardrailRules } from '../growthApi'

// Checks every trade and trading day against the rules. Pure: the page passes in trades (already in rupees), the
// journal's day rules and the guardrail rules, and gets back every break, a status per day and what the breaks cost.

export type BreachKind = 'trade-loss' | 'trade-size' | 'day-loss' | 'day-count' | 'loss-streak' | 'week-loss' | 'cooldown'

export interface Breach {
  date: string
  kind: BreachKind
  /** The trade that broke a per-trade rule, if any. */
  tradeId?: string
  symbol?: string
  /** The rupee figure behind the break (loss, weekly net) or the count (trades, streak). */
  value: number
  limit: number
  /** Money lost because the rule was broken: loss beyond the per-trade cap, or P&L after the day limit was hit. */
  cost: number
}

export interface DayCheck {
  date: string
  net: number
  trades: number
  status: 'clean' | 'breach'
}

export interface GuardrailReport {
  breaches: Breach[]
  days: DayCheck[]
  /** Share of trading days with no break, 0–100 (null when there are no trading days). */
  cleanPct: number | null
  /** Rupees lost to breaking the rules (sum of `cost`). Never double-counted per trade. */
  costOfBreaches: number
  actualNet: number
  /** Net P&L had every loss stopped at the per-trade cap (optimistic: real stops can slip). Null without a cap. */
  cappedNet: number | null
}

/** Monday of the ISO week, YYYY-MM-DD. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const shift = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - shift)
  return d.toISOString().slice(0, 10)
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Trades without a time run after the timed ones of the same day, so "after the limit was hit" stays conservative.
const inOrder = (a: Trade, b: Trade) => a.date.localeCompare(b.date) || (a.time || '99:99').localeCompare(b.time || '99:99') || a.id.localeCompare(b.id)

export function checkGuardrails(trades: Trade[], settings: Pick<JournalSettings, 'dailyLossLimit' | 'maxTradesPerDay' | 'maxConsecutiveLosses'>, rules: GuardrailRules): GuardrailReport {
  const sorted = [...trades].sort(inOrder)
  const breaches: Breach[] = []
  // Trades that should not have happened at all (after the day's limit was hit, or during a cool-off).
  const forbidden = new Set<string>()

  const byDay = new Map<string, Trade[]>()
  for (const t of sorted) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t])

  // Per trade: loss beyond the cap and size beyond the cap (size only for rupee trades — lots and shares aren't comparable).
  for (const t of sorted) {
    const net = netInr(t)
    if (rules.maxLossPerTrade > 0 && net < -rules.maxLossPerTrade) {
      const cost = -net - rules.maxLossPerTrade
      breaches.push({ date: t.date, kind: 'trade-loss', tradeId: t.id, symbol: t.symbol, value: -net, limit: rules.maxLossPerTrade, cost })
    }
    if (rules.maxQtyPerTrade > 0 && t.currency !== 'USD' && t.qty > rules.maxQtyPerTrade) {
      breaches.push({ date: t.date, kind: 'trade-size', tradeId: t.id, symbol: t.symbol, value: t.qty, limit: rules.maxQtyPerTrade, cost: 0 })
    }
  }

  const breachDays = new Set<string>()
  const days: DayCheck[] = []
  for (const [date, list] of byDay) {
    const net = list.reduce((s, t) => s + netInr(t), 0)
    const before = breaches.length

    if (settings.dailyLossLimit > 0) {
      // Everything traded after the running net first crossed the limit should not have happened; its losses are the cost.
      let running = 0
      let hitAt = -1
      list.forEach((t, i) => {
        running += netInr(t)
        if (hitAt < 0 && running <= -settings.dailyLossLimit) hitAt = i
      })
      if (net <= -settings.dailyLossLimit || hitAt >= 0) {
        const after = hitAt >= 0 ? list.slice(hitAt + 1) : []
        const afterNet = after.reduce((s, t) => s + netInr(t), 0)
        const cost = Math.max(0, -afterNet)
        breaches.push({ date, kind: 'day-loss', value: -net, limit: settings.dailyLossLimit, cost })
        for (const t of after) forbidden.add(t.id)
      }
    }
    if (settings.maxTradesPerDay > 0 && list.length > settings.maxTradesPerDay) {
      breaches.push({ date, kind: 'day-count', value: list.length, limit: settings.maxTradesPerDay, cost: 0 })
    }
    if (settings.maxConsecutiveLosses > 0) {
      let streak = 0
      let worst = 0
      for (const t of list) {
        streak = netInr(t) < 0 ? streak + 1 : 0
        worst = Math.max(worst, streak)
      }
      if (worst >= settings.maxConsecutiveLosses) breaches.push({ date, kind: 'loss-streak', value: worst, limit: settings.maxConsecutiveLosses, cost: 0 })
    }
    if (breaches.length > before || breaches.some((b) => b.date === date)) breachDays.add(date)
    days.push({ date, net, trades: list.length, status: 'clean' })
  }

  if (rules.weeklyLossLimit > 0) {
    // The break lands on the day the week's running net first crosses the limit; later days that week should not
    // have been traded at all.
    const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const running = new Map<string, number>()
    const crossed = new Set<string>()
    for (const d of ordered) {
      const week = weekOf(d.date)
      if (crossed.has(week)) {
        for (const t of byDay.get(d.date) ?? []) forbidden.add(t.id)
        breachDays.add(d.date)
        continue
      }
      const net = (running.get(week) ?? 0) + d.net
      running.set(week, net)
      if (net <= -rules.weeklyLossLimit) {
        crossed.add(week)
        breaches.push({ date: d.date, kind: 'week-loss', value: -net, limit: rules.weeklyLossLimit, cost: 0 })
        breachDays.add(d.date)
      }
    }
  }

  if (rules.cooldownDays > 0) {
    // Trading on the calendar days right after a break, when the rule says to sit out.
    const initial = [...breachDays].sort()
    for (const day of initial) {
      for (let i = 1; i <= rules.cooldownDays; i++) {
        const next = addDays(day, i)
        const list = byDay.get(next)
        if (!list) continue
        const net = list.reduce((s, t) => s + netInr(t), 0)
        breaches.push({ date: next, kind: 'cooldown', value: list.length, limit: rules.cooldownDays, cost: Math.max(0, -net) })
        for (const t of list) forbidden.add(t.id)
        breachDays.add(next)
      }
    }
  }

  for (const d of days) if (breachDays.has(d.date)) d.status = 'breach'
  days.sort((a, b) => a.date.localeCompare(b.date))
  breaches.sort((a, b) => b.date.localeCompare(a.date))

  const actualNet = sorted.reduce((s, t) => s + netInr(t), 0)
  const cappedNet = rules.maxLossPerTrade > 0 ? sorted.reduce((s, t) => s + Math.max(netInr(t), -rules.maxLossPerTrade), 0) : null
  const clean = days.filter((d) => d.status === 'clean').length

  return {
    breaches,
    days,
    cleanPct: days.length ? (clean / days.length) * 100 : null,
    // Each trade counts once: a trade that should not have happened costs its whole loss; any other costs only the part
    // of its loss beyond the per-trade cap.
    costOfBreaches: sorted.reduce((sum, t) => {
      const loss = Math.max(0, -netInr(t))
      if (forbidden.has(t.id)) return sum + loss
      return sum + (rules.maxLossPerTrade > 0 ? Math.max(0, loss - rules.maxLossPerTrade) : 0)
    }, 0),
    actualNet,
    cappedNet,
  }
}

/** Breaks per month, newest first: { month, count, cost }. */
export function breachesByMonth(breaches: Breach[]) {
  const out = new Map<string, { month: string; count: number; cost: number }>()
  for (const b of breaches) {
    const m = b.date.slice(0, 7)
    const row = out.get(m) ?? { month: m, count: 0, cost: 0 }
    row.count++
    row.cost += b.cost
    out.set(m, row)
  }
  return [...out.values()].sort((a, b) => b.month.localeCompare(a.month))
}
