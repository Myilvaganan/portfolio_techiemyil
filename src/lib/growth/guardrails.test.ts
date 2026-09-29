import { describe, expect, it } from 'vitest'
import { blankTrade, type Trade } from '../journal'
import { EMPTY_DOCS } from '../growthApi'
import { breachesByMonth, checkGuardrails, weekOf } from './guardrails'

let n = 0
const trade = (date: string, net: number, time = '', qty = 1): Trade => ({ ...blankTrade(date), id: `t${++n}`, date, time, grossPnl: net, fees: 0, qty, symbol: 'NIFTY' })
const NO_DAY_RULES = { dailyLossLimit: 0, maxTradesPerDay: 0, maxConsecutiveLosses: 0 }
const rules = (r: Partial<typeof EMPTY_DOCS.guardrails>) => ({ ...EMPTY_DOCS.guardrails, ...r })

describe('checkGuardrails', () => {
  it('finds nothing and reports a clean record when no rules are set', () => {
    const r = checkGuardrails([trade('2026-09-01', -50000)], NO_DAY_RULES, rules({}))
    expect(r.breaches).toEqual([])
    expect(r.cleanPct).toBe(100)
    expect(r.costOfBreaches).toBe(0)
    expect(r.cappedNet).toBeNull()
  })

  it('flags losses beyond the per-trade cap and counts only the excess as the cost', () => {
    const r = checkGuardrails([trade('2026-09-01', -25000), trade('2026-09-01', 4000), trade('2026-09-02', -3000)], NO_DAY_RULES, rules({ maxLossPerTrade: 10000 }))
    expect(r.breaches.map((b) => b.kind)).toEqual(['trade-loss'])
    expect(r.costOfBreaches).toBe(15000)
    expect(r.actualNet).toBe(-24000)
    expect(r.cappedNet).toBe(-9000)
    expect(r.days.map((d) => d.status)).toEqual(['breach', 'clean'])
    expect(r.cleanPct).toBe(50)
  })

  it('charges the full loss of trades taken after the daily limit was hit, once', () => {
    const day = [trade('2026-09-03', -6000, '09:20'), trade('2026-09-03', -5000, '10:00'), trade('2026-09-03', -20000, '11:00'), trade('2026-09-03', 2000, '12:00')]
    const r = checkGuardrails(day, { ...NO_DAY_RULES, dailyLossLimit: 10000 }, rules({ maxLossPerTrade: 10000 }))
    // Limit crossed on the second trade; the last two should never have been placed.
    const dayBreach = r.breaches.find((b) => b.kind === 'day-loss')!
    expect(dayBreach.cost).toBe(18000)
    // The -20,000 trade is forbidden, so its whole loss counts — not also its 10,000 excess over the cap.
    expect(r.costOfBreaches).toBe(20000)
  })

  it('flags too many trades and loss streaks in a day', () => {
    const day = ['09:15', '09:30', '09:45', '10:00'].map((t) => trade('2026-09-04', -100, t))
    const r = checkGuardrails(day, { dailyLossLimit: 0, maxTradesPerDay: 3, maxConsecutiveLosses: 3 }, rules({}))
    expect(r.breaches.map((b) => b.kind).sort()).toEqual(['day-count', 'loss-streak'])
  })

  it('flags a losing week on its last trading day, and trading during the cool-off', () => {
    const t = [trade('2026-09-07', -8000), trade('2026-09-09', -8000), trade('2026-09-10', -1000)]
    const r = checkGuardrails(t, NO_DAY_RULES, rules({ weeklyLossLimit: 15000, cooldownDays: 1 }))
    const week = r.breaches.find((b) => b.kind === 'week-loss')!
    expect(week.date).toBe('2026-09-09')
    const cool = r.breaches.find((b) => b.kind === 'cooldown')!
    expect(cool.date).toBe('2026-09-10')
    expect(r.costOfBreaches).toBe(1000)
  })

  it('checks size only on rupee trades', () => {
    const usd: Trade = { ...trade('2026-09-05', 10, '', 5), currency: 'USD', fxRate: 90 }
    const r = checkGuardrails([trade('2026-09-05', 100, '', 2000), usd], NO_DAY_RULES, rules({ maxQtyPerTrade: 1000 }))
    expect(r.breaches.filter((b) => b.kind === 'trade-size')).toHaveLength(1)
  })

  it('groups breaks by month', () => {
    const r = checkGuardrails([trade('2026-08-01', -20000), trade('2026-09-01', -20000), trade('2026-09-02', -12000)], NO_DAY_RULES, rules({ maxLossPerTrade: 10000 }))
    expect(breachesByMonth(r.breaches)).toEqual([
      { month: '2026-09', count: 2, cost: 12000 },
      { month: '2026-08', count: 1, cost: 10000 },
    ])
  })

  it('computes the ISO week start', () => {
    expect(weekOf('2026-09-29')).toBe('2026-09-28')
    expect(weekOf('2026-09-27')).toBe('2026-09-21')
  })
})
