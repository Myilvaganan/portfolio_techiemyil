import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TAX_RULES,
  blankTrade,
  grossFromPrices,
  groupByDate,
  monthGrid,
  netInr,
  rMultiple,
  rangeFor,
  riskInr,
  shiftMonth,
  taxCaption,
  taxHeading,
  taxOn,
  taxRuleFor,
  taxSummary,
  todayStr,
  usesNetTax,
  totalsOf,
  weekdayIndex,
  type Trade,
} from './journal'

let seq = 0
function trade(over: Partial<Trade> = {}): Trade {
  seq += 1
  return { ...blankTrade('2026-09-15'), id: `trade-${seq}`, instrument: 'Options', qty: 1, ...over }
}

describe('grossFromPrices', () => {
  it('computes a BUY profit as (exit − entry) × qty × contract size', () => {
    expect(grossFromPrices({ direction: 'BUY', entry: 100, exit: 110, qty: 75, contractSize: 1 })).toBe(750)
  })

  it('flips the sign for a SELL', () => {
    expect(grossFromPrices({ direction: 'SELL', entry: 100, exit: 110, qty: 75, contractSize: 1 })).toBe(-750)
  })

  it('uses the contract size (0.5 lot of gold, 100 oz per lot)', () => {
    expect(grossFromPrices({ direction: 'BUY', entry: 4378, exit: 4388, qty: 0.5, contractSize: 100 })).toBe(500)
  })

  it('is null until entry, exit and a quantity are all present', () => {
    expect(grossFromPrices({ direction: 'BUY', entry: 100, exit: null, qty: 1, contractSize: 1 })).toBeNull()
    expect(grossFromPrices({ direction: 'BUY', entry: 100, exit: 110, qty: 0, contractSize: 1 })).toBeNull()
  })
})

describe('net P&L in INR', () => {
  it('subtracts fees', () => {
    expect(netInr(trade({ grossPnl: 1000, fees: 60 }))).toBe(940)
  })

  it('converts USD trades with their own FX rate', () => {
    expect(netInr(trade({ currency: 'USD', fxRate: 90, grossPnl: 100, fees: 10 }))).toBe(8100)
  })

  it('ignores a stray FX rate on INR trades', () => {
    expect(netInr(trade({ currency: 'INR', fxRate: 90, grossPnl: 100 }))).toBe(100)
  })
})

describe('risk and R-multiple', () => {
  it('measures risk from entry to stop', () => {
    expect(riskInr(trade({ entry: 100, stopLoss: 90, qty: 10 }))).toBe(100)
  })

  it('reports a winner as a multiple of the risk taken', () => {
    expect(rMultiple(trade({ entry: 100, stopLoss: 90, qty: 10, grossPnl: 200 }))).toBe(2)
    expect(rMultiple(trade({ entry: 100, stopLoss: 90, qty: 10, grossPnl: -100 }))).toBe(-1)
  })

  it('is null without a stop loss', () => {
    expect(rMultiple(trade({ entry: 100, stopLoss: null, qty: 10, grossPnl: 200 }))).toBeNull()
  })
})

describe('tax', () => {
  const winner = trade({ grossPnl: 1000 })
  const loser = trade({ grossPnl: -400 })

  it('per-trade mode taxes every winner and lets losses offset nothing', () => {
    expect(taxOn([winner, loser], { taxRate: 30, taxMode: 'per-trade' })).toBe(300)
  })

  it('net mode taxes only the net profit of the set', () => {
    expect(taxOn([winner, loser], { taxRate: 30, taxMode: 'net' })).toBe(180)
  })

  it('charges nothing when the net result is a loss in net mode', () => {
    expect(taxOn([loser], { taxRate: 30, taxMode: 'net' })).toBe(0)
  })

  it('totalsOf reports before-tax, tax and after-tax together', () => {
    const t = totalsOf([winner, loser], { ...DEFAULT_SETTINGS, taxRate: 30, taxMode: 'per-trade' })
    expect(t).toMatchObject({ trades: 2, wins: 1, losses: 1, net: 600, tax: 300, afterTax: 300 })
  })
})

describe('calendar', () => {
  it('lays September 2026 out as Monday-first weeks (starts on a Tuesday)', () => {
    const grid = monthGrid('2026-09')
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid[0][0]).toMatchObject({ date: '2026-08-31', inMonth: false })
    expect(grid[0][1]).toMatchObject({ date: '2026-09-01', inMonth: true })
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30)
  })

  it('handles a month that starts on Monday without leading padding', () => {
    expect(monthGrid('2026-06')[0][0]).toMatchObject({ date: '2026-06-01', inMonth: true })
  })

  it('shifts months across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('numbers weekdays Monday = 0', () => {
    expect(weekdayIndex('2026-09-14')).toBe(0)
    expect(weekdayIndex('2026-09-20')).toBe(6)
  })

  it('formats today in the local timezone', () => {
    expect(todayStr(new Date(2026, 8, 5))).toBe('2026-09-05')
  })

  it('groups trades by date', () => {
    const g = groupByDate([trade({ date: '2026-09-01' }), trade({ date: '2026-09-01' }), trade({ date: '2026-09-02' })])
    expect(g.get('2026-09-01')).toHaveLength(2)
    expect(g.size).toBe(2)
  })
})

describe('rangeFor', () => {
  const today = '2026-09-20'

  it('uses exactly the viewed month for "month"', () => {
    expect(rangeFor('month', '2026-05', today)).toEqual({ from: '2026-05', to: '2026-05' })
  })

  it('counts rolling ranges back from the current month, across year ends', () => {
    expect(rangeFor('3m', '2026-05', today)).toEqual({ from: '2026-07', to: '2026-09' })
    expect(rangeFor('6m', '2026-05', today)).toEqual({ from: '2026-04', to: '2026-09' })
    expect(rangeFor('1y', '2026-05', today)).toEqual({ from: '2025-10', to: '2026-09' })
    expect(rangeFor('3m', '2026-05', '2027-01-10')).toEqual({ from: '2026-11', to: '2027-01' })
  })

  it('starts year-to-date in January', () => {
    expect(rangeFor('ytd', '2026-05', today)).toEqual({ from: '2026-01', to: '2026-09' })
  })

  it('has no bounds for all time', () => {
    expect(rangeFor('all', '2026-05', today)).toEqual({})
  })
})

describe('per-instrument tax rules', () => {
  const options = trade({ instrument: 'Options', grossPnl: 1000 })
  const bitcoin = trade({ instrument: 'Bitcoin', grossPnl: 1000 })
  const withRules = { taxRate: 30, taxMode: 'per-trade' as const, taxRules: [{ instrument: 'Bitcoin', rate: 20, mode: 'per-trade' as const }] }

  it('uses the default for instruments without a rule, and matches names case-insensitively', () => {
    expect(taxRuleFor(withRules, 'Options')).toEqual({ rate: 30, mode: 'per-trade' })
    expect(taxRuleFor(withRules, ' bitCOIN ')).toEqual({ rate: 20, mode: 'per-trade' })
  })

  it('taxes each instrument at its own rate', () => {
    expect(taxOn([options, bitcoin], withRules)).toBe(300 + 200)
  })

  it('applies each instrument’s own method: net-profit netting only within that instrument', () => {
    const settings = { ...withRules, taxRules: [{ instrument: 'Options', rate: 30, mode: 'net' as const }] }
    const optionsLoss = trade({ instrument: 'Options', grossPnl: -400 })
    // Options net = 600 → 180 (losses offset within Options). Bitcoin winner at the 30% default = 300.
    expect(taxOn([options, optionsLoss, bitcoin], settings)).toBe(180 + 300)
  })

  it('does not let a loss in one instrument offset another instrument’s tax', () => {
    const bitcoinLoss = trade({ instrument: 'Bitcoin', grossPnl: -5000 })
    expect(taxOn([options, bitcoinLoss], { taxRate: 30, taxMode: 'net', taxRules: [{ instrument: 'Bitcoin', rate: 20, mode: 'net' }] })).toBe(300)
  })

  it('a zero rate means no tax on that instrument', () => {
    expect(taxOn([bitcoin], { ...withRules, taxRules: [{ instrument: 'Bitcoin', rate: 0, mode: 'per-trade' }] })).toBe(0)
  })

  it('totalsOf reports the combined tax and after-tax result', () => {
    const t = totalsOf([options, bitcoin], { ...DEFAULT_SETTINGS, ...withRules })
    expect(t).toMatchObject({ net: 2000, tax: 500, afterTax: 1500 })
  })

  it('describes the rules for headings and captions', () => {
    expect(taxHeading({ taxRate: 30, taxMode: 'per-trade', taxRules: [] })).toBe('Tax 30%')
    expect(taxHeading(withRules)).toBe('Tax · by instrument')
    expect(taxSummary({ taxRate: 30, taxMode: 'per-trade', taxRules: [] })).toBe('30%')
    expect(taxSummary(withRules)).toBe('30% default · Bitcoin 20%')
    expect(usesNetTax(withRules)).toBe(false)
    expect(usesNetTax({ ...withRules, taxRules: [{ instrument: 'Options', rate: 30, mode: 'net' }] })).toBe(true)
  })
})

describe('default tax', () => {
  const options = trade({ instrument: 'Options', grossPnl: 1000 })
  const bitcoin = trade({ instrument: 'Bitcoin', currency: 'USD', fxRate: 90, grossPnl: 10 }) // ₹900
  const gold = trade({ instrument: 'XAUUSD', currency: 'USD', fxRate: 90, grossPnl: 20 }) // ₹1,800

  it('taxes only Bitcoin, at 30% on each winning trade', () => {
    expect(DEFAULT_SETTINGS.taxRate).toBe(0)
    expect(DEFAULT_SETTINGS.taxRules).toEqual([{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }])
    expect(taxOn([bitcoin], DEFAULT_SETTINGS)).toBe(270)
  })

  it('adds no tax on options — Options Analytics already accounts for its own', () => {
    expect(taxOn([options], DEFAULT_SETTINGS)).toBe(0)
  })

  it('adds no tax on other instruments either unless a rule says so', () => {
    expect(taxOn([gold], DEFAULT_SETTINGS)).toBe(0)
  })

  it('combines them: only the Bitcoin part is taxed', () => {
    const t = totalsOf([options, bitcoin, gold], DEFAULT_SETTINGS)
    expect(t).toMatchObject({ net: 1000 + 900 + 1800, tax: 270, afterTax: 1000 + 900 + 1800 - 270 })
  })

  it('does not tax a losing Bitcoin trade', () => {
    expect(taxOn([trade({ instrument: 'Bitcoin', currency: 'USD', fxRate: 90, grossPnl: -10 })], DEFAULT_SETTINGS)).toBe(0)
  })

  it('hands out its own copy of the rules so editing one settings object cannot change the defaults', () => {
    DEFAULT_SETTINGS.taxRules[0].rate = 99
    expect(DEFAULT_TAX_RULES[0].rate).toBe(30)
    DEFAULT_SETTINGS.taxRules[0].rate = 30
  })

  it('describes a Bitcoin-only setup and a no-tax setup', () => {
    expect(taxHeading(DEFAULT_SETTINGS)).toBe('Tax · by instrument')
    expect(taxCaption(DEFAULT_SETTINGS)).toBe('Bitcoin 30% · other instruments untaxed')
    expect(taxHeading({ taxRate: 0, taxMode: 'per-trade', taxRules: [] })).toBe('Tax')
    expect(taxCaption({ taxRate: 0, taxMode: 'per-trade', taxRules: [] })).toBe('No tax applied')
    expect(taxSummary({ taxRate: 0, taxMode: 'per-trade', taxRules: [] })).toBe('No tax')
  })
})

