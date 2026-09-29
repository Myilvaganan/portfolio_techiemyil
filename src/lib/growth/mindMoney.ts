import { netInr, type Trade } from '../journal'
import { planBucket, type TagMap } from '../budget'
import type { Txn } from '../statements'
import type { DailyLog } from '../health'

// Groups days by how you slept and how much you moved, then compares trading and discretionary spending across the
// groups. Counts only — no claim that one causes the other, and groups with too few days are marked as such.

export const MIN_DAYS = 5

export interface Bucket {
  key: string
  /** Days in the group with a health log. */
  days: number
  tradingDays: number
  /** Average net P&L on the days you traded (null with no trading days). */
  avgPnl: number | null
  /** Share of trading days that ended positive, 0–100. */
  winDayPct: number | null
  /** Share of trading days with a guardrail break, 0–100. */
  breachDayPct: number | null
  /** Average "wants" spending per day (shopping, food delivery, entertainment…). */
  avgWants: number
  enough: boolean
}

export interface MindMoney {
  sleep: Bucket[]
  steps: Bucket[]
  loggedDays: number
}

const SLEEP = [
  { key: 'under6', test: (h: number) => h < 6 },
  { key: '6to7', test: (h: number) => h >= 6 && h < 7 },
  { key: '7plus', test: (h: number) => h >= 7 },
]
const STEPS = [
  { key: 'under5k', test: (n: number) => n < 5000 },
  { key: '5to10k', test: (n: number) => n >= 5000 && n < 10000 },
  { key: '10kplus', test: (n: number) => n >= 10000 },
]

export function buildMindMoney(input: { logs: DailyLog[]; trades: Trade[]; txns: Txn[]; tags: TagMap; breachDays: Set<string> }): MindMoney {
  const pnlByDay = new Map<string, number>()
  for (const t of input.trades) pnlByDay.set(t.date, (pnlByDay.get(t.date) ?? 0) + netInr(t))
  const wantsByDay = new Map<string, number>()
  for (const t of input.txns) {
    if (t.debit > 0 && planBucket(t, input.tags) === 'wants') wantsByDay.set(t.date, (wantsByDay.get(t.date) ?? 0) + t.debit)
  }

  const group = (defs: { key: string; test: (v: number) => boolean }[], value: (l: DailyLog) => number | null): Bucket[] =>
    defs.map(({ key, test }) => {
      const days = input.logs.filter((l) => {
        const v = value(l)
        return v !== null && test(v)
      })
      const traded = days.filter((d) => pnlByDay.has(d.date))
      const pnls = traded.map((d) => pnlByDay.get(d.date)!)
      return {
        key,
        days: days.length,
        tradingDays: traded.length,
        avgPnl: pnls.length ? pnls.reduce((s, x) => s + x, 0) / pnls.length : null,
        winDayPct: pnls.length ? (pnls.filter((x) => x > 0).length / pnls.length) * 100 : null,
        breachDayPct: traded.length ? (traded.filter((d) => input.breachDays.has(d.date)).length / traded.length) * 100 : null,
        avgWants: days.length ? days.reduce((s, d) => s + (wantsByDay.get(d.date) ?? 0), 0) / days.length : 0,
        enough: days.length >= MIN_DAYS,
      }
    })

  return {
    sleep: group(SLEEP, (l) => l.sleepH),
    steps: group(STEPS, (l) => l.steps),
    loggedDays: input.logs.filter((l) => l.sleepH !== null || l.steps !== null).length,
  }
}
