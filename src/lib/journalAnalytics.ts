// Statistics, breakdowns and rule-based insights over a set of journal trades.
// Every amount here is INR, before tax unless the field says otherwise.

import type { Tone } from './report'
import {
  WEEKDAYS,
  byWhen,
  groupByDate,
  monthOf,
  instrumentKey,
  netInr,
  rMultiple,
  taxOn,
  taxRuleFor,
  totalsOf,
  weekdayIndex,
  type JournalSettings,
  type Totals,
  type Trade,
} from './journal'

export interface DayRow {
  date: string
  trades: number
  wins: number
  losses: number
  gross: number
  fees: number
  net: number
  tax: number
  afterTax: number
}

export interface Slice {
  label: string
  trades: number
  wins: number
  net: number
  /** Tax on this group under each instrument's own rule. */
  tax: number
  afterTax: number
  winRate: number
  avgNet: number
}

export interface EquityPoint {
  date: string
  /** Cumulative net P&L before tax. */
  pre: number
  /** Cumulative net P&L after tax. */
  post: number
}

export interface Drawdown {
  amount: number
  /** Of the peak equity; null when no starting capital is set (the % would be meaningless). */
  pct: number | null
  peakDate: string
  troughDate: string
}

export interface MonthRow {
  month: string
  trades: number
  net: number
  tax: number
  afterTax: number
}

export interface Breach {
  date: string
  kind: 'loss' | 'trades'
  /** The day's net loss (loss breach) or trade count (trades breach). */
  amount: number
}

export interface Analytics {
  totals: Totals
  days: DayRow[]
  equity: EquityPoint[]
  maxDrawdown: Drawdown
  currentDrawdown: number
  winRate: number
  profitFactor: number | null
  expectancy: number
  avgWin: number
  avgLoss: number
  payoff: number | null
  largestWin: number
  largestLoss: number
  avgR: number | null
  streaks: { maxWin: number; maxLoss: number; current: { kind: 'win' | 'loss' | 'none'; length: number } }
  greenDays: number
  redDays: number
  bestDay: DayRow | null
  worstDay: DayRow | null
  avgTradesPerDay: number
  byInstrument: Slice[]
  byStrategy: Slice[]
  byEmotion: Slice[]
  byWeekday: Slice[]
  mistakes: { label: string; count: number; net: number }[]
  discipline: { followed: Slice; broke: Slice; unrecorded: Slice }
  monthly: MonthRow[]
  breaches: Breach[]
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function sliceOf(label: string, trades: Trade[], settings: JournalSettings): Slice {
  const nets = trades.map(netInr)
  const net = sum(nets)
  const tax = taxOn(trades, settings)
  const wins = nets.filter((n) => n > 0).length
  return {
    label,
    trades: trades.length,
    wins,
    net,
    tax,
    afterTax: net - tax,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    avgNet: trades.length ? net / trades.length : 0,
  }
}

function groupSlices(trades: Trade[], keyOf: (t: Trade) => string, settings: JournalSettings): Slice[] {
  const groups = new Map<string, Trade[]>()
  for (const t of trades) {
    const key = keyOf(t)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return [...groups].map(([label, list]) => sliceOf(label, list, settings)).sort((a, b) => b.net - a.net)
}

export function dayRowOf(date: string, trades: Trade[], settings: JournalSettings): DayRow {
  const t = totalsOf(trades, settings)
  return { date, trades: t.trades, wins: t.wins, losses: t.losses, gross: t.gross, fees: t.fees, net: t.net, tax: t.tax, afterTax: t.afterTax }
}

export function analyze(input: Trade[], settings: JournalSettings): Analytics {
  const trades = [...input].sort(byWhen)
  const totals = totalsOf(trades, settings)
  const nets = trades.map(netInr)

  const byDate = groupByDate(trades)
  const days = [...byDate].map(([date, list]) => dayRowOf(date, list, settings)).sort((a, b) => a.date.localeCompare(b.date))

  // Equity curve + drawdown, one point per trading day. Tax is tracked with running sums so the
  // after-tax curve is O(n) and honours both tax modes.
  const equity: EquityPoint[] = []
  let runNet = 0
  // Per instrument, because each instrument can have its own tax rule.
  const running = new Map<string, { net: number; positive: number; rate: number; mode: 'per-trade' | 'net' }>()
  let peak = settings.startingCapital
  let peakDate = ''
  let dd: Drawdown = { amount: 0, pct: null, peakDate: '', troughDate: '' }
  let currentDrawdown = 0
  for (const day of days) {
    for (const t of byDate.get(day.date) ?? []) {
      const n = netInr(t)
      runNet += n
      const key = instrumentKey(t.instrument)
      const acc = running.get(key) ?? { net: 0, positive: 0, ...taxRuleFor(settings, t.instrument) }
      acc.net += n
      acc.positive += Math.max(0, n)
      running.set(key, acc)
    }
    let tax = 0
    for (const acc of running.values()) tax += ((acc.mode === 'net' ? Math.max(0, acc.net) : acc.positive) * acc.rate) / 100
    equity.push({ date: day.date, pre: runNet, post: runNet - tax })

    const value = settings.startingCapital + runNet
    if (value > peak) {
      peak = value
      peakDate = day.date
    }
    currentDrawdown = peak - value
    if (currentDrawdown > dd.amount) {
      dd = {
        amount: currentDrawdown,
        pct: settings.startingCapital > 0 && peak > 0 ? (currentDrawdown / peak) * 100 : null,
        peakDate,
        troughDate: day.date,
      }
    }
  }

  const winsN = nets.filter((n) => n > 0)
  const lossesN = nets.filter((n) => n < 0)
  const grossWin = sum(winsN)
  const grossLoss = Math.abs(sum(lossesN))
  const avgWin = winsN.length ? grossWin / winsN.length : 0
  const avgLoss = lossesN.length ? grossLoss / lossesN.length : 0

  let run = 0
  let maxWin = 0
  let maxLoss = 0
  for (const n of nets) {
    run = n > 0 ? (run > 0 ? run + 1 : 1) : n < 0 ? (run < 0 ? run - 1 : -1) : 0
    maxWin = Math.max(maxWin, run)
    maxLoss = Math.max(maxLoss, -run)
  }

  const rs = trades.map(rMultiple).filter((r): r is number => r !== null)

  const green = days.filter((d) => d.net > 0)
  const red = days.filter((d) => d.net < 0)
  const bestDay = days.length ? days.reduce((a, b) => (b.net > a.net ? b : a)) : null
  const worstDay = days.length ? days.reduce((a, b) => (b.net < a.net ? b : a)) : null

  const mistakeMap = new Map<string, { count: number; net: number }>()
  for (const t of trades) {
    for (const m of t.mistakes) {
      const cur = mistakeMap.get(m) ?? { count: 0, net: 0 }
      mistakeMap.set(m, { count: cur.count + 1, net: cur.net + netInr(t) })
    }
  }

  const monthGroups = new Map<string, Trade[]>()
  for (const t of trades) {
    const m = monthOf(t.date)
    const list = monthGroups.get(m)
    if (list) list.push(t)
    else monthGroups.set(m, [t])
  }
  const monthly: MonthRow[] = [...monthGroups]
    .map(([month, list]) => {
      const t = totalsOf(list, settings)
      return { month, trades: t.trades, net: t.net, tax: t.tax, afterTax: t.afterTax }
    })
    .sort((a, b) => a.month.localeCompare(b.month))

  const breaches: Breach[] = []
  for (const d of days) {
    if (settings.dailyLossLimit > 0 && d.net <= -settings.dailyLossLimit) breaches.push({ date: d.date, kind: 'loss', amount: -d.net })
    if (settings.maxTradesPerDay > 0 && d.trades > settings.maxTradesPerDay) breaches.push({ date: d.date, kind: 'trades', amount: d.trades })
  }

  const last = nets.length ? nets[nets.length - 1] : 0
  let currentLen = 0
  if (last !== 0) {
    for (let i = nets.length - 1; i >= 0 && Math.sign(nets[i]) === Math.sign(last); i--) currentLen++
  }

  return {
    totals,
    days,
    equity,
    maxDrawdown: dd,
    currentDrawdown,
    winRate: trades.length ? (winsN.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: trades.length ? totals.net / trades.length : 0,
    avgWin,
    avgLoss,
    payoff: avgLoss > 0 ? avgWin / avgLoss : null,
    largestWin: nets.length ? Math.max(0, ...nets) : 0,
    largestLoss: nets.length ? Math.min(0, ...nets) : 0,
    avgR: rs.length ? sum(rs) / rs.length : null,
    streaks: { maxWin, maxLoss, current: { kind: last > 0 ? 'win' : last < 0 ? 'loss' : 'none', length: currentLen } },
    greenDays: green.length,
    redDays: red.length,
    bestDay: bestDay && bestDay.net > 0 ? bestDay : null,
    worstDay: worstDay && worstDay.net < 0 ? worstDay : null,
    avgTradesPerDay: days.length ? trades.length / days.length : 0,
    byInstrument: groupSlices(trades, (t) => t.instrument, settings),
    byStrategy: groupSlices(trades, (t) => t.strategy || 'Unspecified', settings),
    byEmotion: groupSlices(trades, (t) => t.emotion || 'Unspecified', settings),
    byWeekday: groupSlices(trades, (t) => WEEKDAYS[weekdayIndex(t.date)], settings).sort((a, b) => WEEKDAYS.indexOf(a.label) - WEEKDAYS.indexOf(b.label)),
    mistakes: [...mistakeMap].map(([label, v]) => ({ label, ...v })).sort((a, b) => a.net - b.net),
    discipline: {
      followed: sliceOf('Followed plan', trades.filter((t) => t.followedPlan === true), settings),
      broke: sliceOf('Broke plan', trades.filter((t) => t.followedPlan === false), settings),
      unrecorded: sliceOf('Not recorded', trades.filter((t) => t.followedPlan === null), settings),
    },
    monthly,
    breaches,
  }
}

// ---------- Insights ----------

export interface Insight {
  tone: Tone
  text: string
}

/** Groups smaller than this are too noisy to draw a conclusion from. */
const MIN_SAMPLE = 5
const MAX_INSIGHTS = 8

/**
 * Plain-English observations a trading coach would make. `money` formats an INR amount, so the caller controls
 * masking (hidden mode) — never bake a formatted amount into shared state.
 */
export function buildInsights(a: Analytics, settings: JournalSettings, money: (n: number) => string): Insight[] {
  const out: Insight[] = []
  const t = a.totals
  if (t.trades === 0) return out

  if (a.streaks.current.kind === 'loss' && a.streaks.current.length >= 3) {
    out.push({ tone: 'bad', text: `You're on a ${a.streaks.current.length}-trade losing streak. Consider reducing size or stepping away until you're back to your plan.` })
  }

  if (a.profitFactor !== null && a.profitFactor < 1 && t.trades >= MIN_SAMPLE) {
    out.push({ tone: 'bad', text: `Profit factor is ${a.profitFactor.toFixed(2)} — losses are outweighing wins. Review the largest losing trades first.` })
  }

  if (a.payoff !== null && a.payoff < 1 && a.winRate < 60 && t.trades >= MIN_SAMPLE) {
    out.push({ tone: 'warn', text: `Your average loss (${money(a.avgLoss)}) is bigger than your average win (${money(a.avgWin)}). Cut losers faster or let winners run.` })
  }

  const { followed, broke } = a.discipline
  if (followed.trades >= 3 && broke.trades >= 3) {
    out.push({
      tone: followed.avgNet >= broke.avgNet ? 'good' : 'warn',
      text: `Trades where you followed your plan average ${money(followed.avgNet)} vs ${money(broke.avgNet)} when you didn't.`,
    })
  }

  const costliest = a.mistakes.find((m) => m.net < 0 && m.count >= 2)
  if (costliest) {
    out.push({ tone: 'bad', text: `"${costliest.label}" appears in ${costliest.count} trades and cost you ${money(-costliest.net)}. It's your most expensive habit.` })
  }

  const rated = a.byInstrument.filter((s) => s.trades >= MIN_SAMPLE)
  if (rated.length >= 2) {
    const best = rated[0]
    const worst = rated[rated.length - 1]
    if (best.net > 0) out.push({ tone: 'good', text: `${best.label} is your strongest instrument: ${money(best.net)} over ${best.trades} trades (${best.winRate.toFixed(0)}% win rate).` })
    if (worst.net < 0 && worst.label !== best.label) out.push({ tone: 'warn', text: `${worst.label} is costing you ${money(-worst.net)} over ${worst.trades} trades — consider trading it smaller or pausing it.` })
  }

  const badDay = a.byWeekday.filter((s) => s.trades >= MIN_SAMPLE && s.net < 0).sort((x, y) => x.net - y.net)[0]
  if (badDay) out.push({ tone: 'warn', text: `${badDay.label}s are your weakest day: ${money(badDay.net)} across ${badDay.trades} trades.` })

  if (settings.maxTradesPerDay > 0) {
    const over = a.breaches.filter((b) => b.kind === 'trades').length
    if (over > 0) out.push({ tone: 'warn', text: `You exceeded your ${settings.maxTradesPerDay}-trades-a-day limit on ${over} day${over === 1 ? '' : 's'}.` })
  } else {
    const busy = a.days.filter((d) => d.trades >= 5)
    const calm = a.days.filter((d) => d.trades < 5)
    if (busy.length >= 3 && calm.length >= 3) {
      const avg = (rows: DayRow[]) => sum(rows.map((r) => r.net)) / rows.length
      if (avg(busy) < avg(calm)) {
        out.push({ tone: 'warn', text: `Days with 5+ trades average ${money(avg(busy))} vs ${money(avg(calm))} on quieter days — possible overtrading.` })
      }
    }
  }

  if (settings.dailyLossLimit > 0) {
    const over = a.breaches.filter((b) => b.kind === 'loss').length
    if (over > 0) out.push({ tone: 'bad', text: `You breached your ${money(settings.dailyLossLimit)} daily loss limit on ${over} day${over === 1 ? '' : 's'}.` })
  }

  if (t.gross > 0 && t.fees / t.gross > 0.1) {
    out.push({ tone: 'warn', text: `Fees and charges take ${((t.fees / t.gross) * 100).toFixed(0)}% of your gross profit (${money(t.fees)}). Fewer, higher-quality trades would help.` })
  }

  if (t.net > 0 && t.tax > 0) {
    out.push({ tone: 'info', text: `Tax takes ${money(t.tax)} (${((t.tax / t.net) * 100).toFixed(0)}% of your net profit), leaving ${money(t.afterTax)}.` })
  }

  return out.slice(0, MAX_INSIGHTS)
}

