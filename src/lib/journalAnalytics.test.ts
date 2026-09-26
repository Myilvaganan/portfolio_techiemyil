import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, blankTrade, type JournalSettings, type Trade } from './journal'
import { accountDrawdown, accountEquityCurve, analyze, buildInsights, holdBucket, hourBucket } from './journalAnalytics'

let seq = 0
function t(date: string, pnl: number, over: Partial<Trade> = {}): Trade {
  seq += 1
  return { ...blankTrade(date), id: `tr-${seq}`, instrument: 'Options', grossPnl: pnl, ...over }
}

// A flat 30% on every instrument, so these tests exercise the tax mechanics rather than the shipped defaults.
const settings = (over: Partial<JournalSettings> = {}): JournalSettings => ({ ...DEFAULT_SETTINGS, taxRate: 30, taxRules: [], ...over })
const money = (n: number) => `₹${Math.round(n)}`

describe('analyze — core statistics', () => {
  const trades = [t('2026-09-14', 1000), t('2026-09-14', -400), t('2026-09-15', 600), t('2026-09-16', -200)]
  const a = analyze(trades, settings())

  it('adds up before-tax, tax and after-tax', () => {
    expect(a.totals).toMatchObject({ trades: 4, net: 1000, tax: 480, afterTax: 520 })
  })

  it('computes win rate, profit factor, expectancy and payoff', () => {
    expect(a.winRate).toBe(50)
    expect(a.profitFactor).toBeCloseTo(1600 / 600)
    expect(a.expectancy).toBe(250)
    expect(a.avgWin).toBe(800)
    expect(a.avgLoss).toBe(300)
    expect(a.payoff).toBeCloseTo(800 / 300)
  })

  it('rolls trades up into days and identifies best and worst', () => {
    expect(a.days.map((d) => [d.date, d.net])).toEqual([
      ['2026-09-14', 600],
      ['2026-09-15', 600],
      ['2026-09-16', -200],
    ])
    expect(a.greenDays).toBe(2)
    expect(a.redDays).toBe(1)
    expect(a.worstDay?.date).toBe('2026-09-16')
    expect(a.largestWin).toBe(1000)
    expect(a.largestLoss).toBe(-400)
  })

  it('builds a cumulative before/after-tax equity curve', () => {
    expect(a.equity.map((p) => p.pre)).toEqual([600, 1200, 1000])
    // per-trade tax: 30% of winners only → 1000+600 taxed = 480 by the end
    expect(a.equity[2].post).toBe(1000 - 480)
  })

  it('has no profit factor when there are no losses', () => {
    expect(analyze([t('2026-09-14', 100)], settings()).profitFactor).toBeNull()
  })

  it('handles an empty journal', () => {
    const empty = analyze([], settings())
    expect(empty.totals.trades).toBe(0)
    expect(empty.bestDay).toBeNull()
    expect(empty.equity).toEqual([])
    expect(empty.maxDrawdown.amount).toBe(0)
  })
})

describe('analyze — drawdown', () => {
  const trades = [t('2026-09-01', 1000), t('2026-09-02', -600), t('2026-09-03', -300), t('2026-09-04', 200)]

  it('measures the deepest fall from the equity peak', () => {
    const a = analyze(trades, settings())
    expect(a.maxDrawdown).toMatchObject({ amount: 900, peakDate: '2026-09-01', troughDate: '2026-09-03', pct: null })
    expect(a.currentDrawdown).toBe(700)
  })

  it('expresses it as a percentage once starting capital is known', () => {
    const a = analyze(trades, settings({ startingCapital: 9000 }))
    expect(a.maxDrawdown.pct).toBeCloseTo((900 / 10000) * 100)
  })
})

describe('analyze — streaks', () => {
  it('finds the longest win/loss runs and the current one', () => {
    const a = analyze([t('2026-09-01', 5), t('2026-09-02', 5), t('2026-09-03', 5), t('2026-09-04', -5), t('2026-09-07', -5)], settings())
    expect(a.streaks).toMatchObject({ maxWin: 3, maxLoss: 2, current: { kind: 'loss', length: 2 } })
  })
})

describe('analyze — breakdowns', () => {
  const trades = [
    t('2026-09-14', 500, { instrument: 'Options', strategy: 'Breakout', followedPlan: true }),
    t('2026-09-14', -300, { instrument: 'Bitcoin', strategy: '', mistakes: ['Revenge trade'], followedPlan: false }),
    t('2026-09-15', -100, { instrument: 'Bitcoin', mistakes: ['Revenge trade', 'No stop loss'] }),
  ]
  const a = analyze(trades, settings())

  it('groups by instrument, best first', () => {
    expect(a.byInstrument.map((s) => [s.label, s.net])).toEqual([
      ['Options', 500],
      ['Bitcoin', -400],
    ])
  })

  it('labels a missing strategy as Unspecified', () => {
    expect(a.byStrategy.map((s) => s.label).sort()).toEqual(['Breakout', 'Unspecified'])
  })

  it('ranks mistakes by what they cost', () => {
    expect(a.mistakes[0]).toEqual({ label: 'Revenge trade', count: 2, net: -400 })
  })

  it('splits results by plan adherence', () => {
    expect(a.discipline.followed).toMatchObject({ trades: 1, net: 500 })
    expect(a.discipline.broke).toMatchObject({ trades: 1, net: -300 })
    expect(a.discipline.unrecorded.trades).toBe(1)
  })

  it('orders weekdays Monday to Sunday', () => {
    expect(a.byWeekday.map((s) => s.label)).toEqual(['Mon', 'Tue'])
  })

  it('groups the months with their own tax', () => {
    const m = analyze([t('2026-08-31', 1000), t('2026-09-01', 1000)], settings()).monthly
    expect(m.map((r) => [r.month, r.tax])).toEqual([
      ['2026-08', 300],
      ['2026-09', 300],
    ])
  })
})

describe('analyze — risk-rule breaches', () => {
  it('flags days over the loss limit and over the trade limit', () => {
    const trades = [t('2026-09-14', -3000), t('2026-09-15', 10), t('2026-09-15', 10), t('2026-09-15', 10)]
    const a = analyze(trades, settings({ dailyLossLimit: 2500, maxTradesPerDay: 2 }))
    expect(a.breaches).toEqual([
      { date: '2026-09-14', kind: 'loss', amount: 3000 },
      { date: '2026-09-15', kind: 'trades', amount: 3 },
    ])
  })

  it('reports nothing when the limits are off', () => {
    expect(analyze([t('2026-09-14', -99999)], settings()).breaches).toEqual([])
  })
})

describe('buildInsights', () => {
  it('says nothing for an empty journal', () => {
    expect(buildInsights(analyze([], settings()), settings(), money)).toEqual([])
  })

  it('warns about a losing streak', () => {
    const a = analyze([t('2026-09-01', -5), t('2026-09-02', -5), t('2026-09-03', -5)], settings())
    expect(buildInsights(a, settings(), money).some((i) => i.tone === 'bad' && /3-trade losing streak/.test(i.text))).toBe(true)
  })

  it('compares planned and unplanned trades once both have a sample', () => {
    const trades = [
      ...[1, 2, 3].map((d) => t(`2026-09-0${d}`, 500, { followedPlan: true })),
      ...[4, 5, 6].map((d) => t(`2026-09-0${d}`, -200, { followedPlan: false })),
    ]
    const text = buildInsights(analyze(trades, settings()), settings(), money).map((i) => i.text).join('\n')
    expect(text).toMatch(/followed your plan average ₹500 vs ₹-200/)
  })

  it('names the costliest repeated mistake', () => {
    const trades = [t('2026-09-01', -300, { mistakes: ['FOMO entry'] }), t('2026-09-02', -200, { mistakes: ['FOMO entry'] })]
    const text = buildInsights(analyze(trades, settings()), settings(), money).map((i) => i.text).join('\n')
    expect(text).toMatch(/"FOMO entry" appears in 2 trades and cost you ₹500/)
  })

  it('formats every amount through the supplied formatter so hidden mode can mask them', () => {
    const trades = [t('2026-09-01', -300, { mistakes: ['FOMO entry'] }), t('2026-09-02', -200, { mistakes: ['FOMO entry'] })]
    const text = buildInsights(analyze(trades, settings()), settings(), () => '****').map((i) => i.text).join('\n')
    expect(text).not.toMatch(/\d{3}/)
    expect(text).toContain('****')
  })
})

describe('hourBucket / holdBucket', () => {
  it('labels the hour of day, or null with no time', () => {
    expect(hourBucket('09:15')).toBe('09:00')
    expect(hourBucket('23:59')).toBe('23:00')
    expect(hourBucket('')).toBeNull()
  })

  it('buckets hold time, or null when unknown (0)', () => {
    expect(holdBucket(0)).toBeNull()
    expect(holdBucket(10)).toBe('< 15m')
    expect(holdBucket(45)).toBe('15–60m')
    expect(holdBucket(120)).toBe('1–4h')
    expect(holdBucket(600)).toBe('4–24h')
    expect(holdBucket(2000)).toBe('1d+')
  })
})

describe('analyze — time-of-day, hold time and tags', () => {
  const trades = [
    t('2026-09-14', 500, { time: '09:15', holdMinutes: 10 }),
    t('2026-09-14', -100, { time: '09:45', holdMinutes: 30 }),
    t('2026-09-15', 200, { time: '14:00', holdMinutes: 500, tags: ['gap-up', 'earnings'] }),
    t('2026-09-16', -50, { tags: ['earnings'] }), // no time, no hold info
  ]
  const a = analyze(trades, settings())

  it('groups by hour of day, leaving out trades with no time', () => {
    expect(a.byHour.map((s) => s.label)).toEqual(['09:00', '14:00'])
    expect(a.byHour.find((s) => s.label === '09:00')?.trades).toBe(2)
  })

  it('groups by hold-time bucket, leaving out trades with no recorded hold time', () => {
    expect(a.byHoldBucket.map((s) => s.label)).toEqual(['< 15m', '15–60m', '4–24h'])
  })

  it('tallies tags across trades by count', () => {
    const byLabel = Object.fromEntries(a.tags.map((x) => [x.label, x]))
    expect(byLabel.earnings).toMatchObject({ count: 2, net: 150 })
    expect(byLabel['gap-up']).toMatchObject({ count: 1, net: 200 })
  })
})

describe('analyze — consecutive-loss streak breach', () => {
  it('flags a day whose trades include enough losses in a row', () => {
    const trades = [
      t('2026-09-14', 10, { time: '09:00' }),
      t('2026-09-14', -10, { time: '09:05' }),
      t('2026-09-14', -10, { time: '09:10' }),
      t('2026-09-14', -10, { time: '09:15' }),
    ]
    const a = analyze(trades, settings({ maxConsecutiveLosses: 3 }))
    expect(a.breaches).toEqual([{ date: '2026-09-14', kind: 'streak', amount: 3 }])
  })

  it('does nothing when the rule is off or not met', () => {
    const trades = [t('2026-09-14', -10), t('2026-09-14', -10)]
    expect(analyze(trades, settings()).breaches).toEqual([])
    expect(analyze(trades, settings({ maxConsecutiveLosses: 3 })).breaches).toEqual([])
  })
})

describe('accountEquityCurve / accountDrawdown', () => {
  it('combines deposits and trading P&L into a running equity curve', () => {
    const trades = [t('2026-09-02', 100), t('2026-09-03', -300)]
    const curve = accountEquityCurve(trades, [{ time: '2026-09-01 10:00:00', amount: 1000 }])
    expect(curve).toEqual([
      { date: '2026-09-01', deposited: 1000, equity: 1000 },
      { date: '2026-09-02', deposited: 1000, equity: 1100 },
      { date: '2026-09-03', deposited: 1000, equity: 800 },
    ])
  })

  it('measures drawdown from the equity peak, not from the deposit total', () => {
    const trades = [t('2026-09-02', 500), t('2026-09-03', -800), t('2026-09-04', 100)]
    const curve = accountEquityCurve(trades, [{ time: '2026-09-01 10:00:00', amount: 1000 }])
    const { max, current } = accountDrawdown(curve)
    expect(max).toMatchObject({ amount: 800, peakDate: '2026-09-02', troughDate: '2026-09-03' })
    expect(max.pct).toBeCloseTo((800 / 1500) * 100)
    expect(current).toBe(700)
  })

  it('is empty with no deposits or trades', () => {
    expect(accountEquityCurve([], [])).toEqual([])
    expect(accountDrawdown([]).max.amount).toBe(0)
  })
})

describe('analyze — per-instrument tax', () => {
  const rules = settings({ taxRules: [{ instrument: 'Bitcoin', rate: 20, mode: 'per-trade' }] })
  const trades = [t('2026-09-14', 1000, { instrument: 'Options' }), t('2026-09-15', 1000, { instrument: 'Bitcoin' })]
  const a = analyze(trades, rules)

  it('totals tax at each instrument’s own rate', () => {
    expect(a.totals).toMatchObject({ net: 2000, tax: 500, afterTax: 1500 })
  })

  it('carries the same rules into the after-tax equity curve', () => {
    expect(a.equity.map((p) => p.post)).toEqual([700, 1500])
  })

  it('reports tax and after-tax per instrument', () => {
    const byName = Object.fromEntries(a.byInstrument.map((s) => [s.label, s]))
    expect(byName.Options).toMatchObject({ net: 1000, tax: 300, afterTax: 700 })
    expect(byName.Bitcoin).toMatchObject({ net: 1000, tax: 200, afterTax: 800 })
  })
})
