import { describe, expect, it } from 'vitest'
import { grossFromPrices } from './journal'
import {
  Mt5ParseError,
  accountFromReport,
  contractSizeFor,
  decodeReport,
  holdLabel,
  instrumentFor,
  parseMt5Report,
  positionTradeId,
  positionsToTrades,
  readReportFile,
} from './mt5'
import { SAMPLE_DEPOSITS, SAMPLE_TRADES, buildMt5Html, toUtf16 } from './fixtures/mt5Report'

const parse = (opts?: Parameters<typeof buildMt5Html>[0]) => parseMt5Report(buildMt5Html(opts))

describe('decodeReport', () => {
  const html = '<html><body>Trade History Report — ₹ ok</body></html>'

  it('reads UTF-16 with a byte-order mark, the way MetaTrader writes it', () => {
    expect(decodeReport(toUtf16(html))).toBe(html)
  })

  it('detects UTF-16 even without a byte-order mark', () => {
    const withBom = new Uint8Array(toUtf16(html))
    expect(decodeReport(withBom.slice(2).buffer)).toBe(html)
  })

  it('reads UTF-8, with or without a byte-order mark', () => {
    const utf8 = new TextEncoder().encode(html)
    expect(decodeReport(utf8.buffer as ArrayBuffer)).toBe(html)
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])
    expect(decodeReport(bom.buffer)).toBe(html)
  })

  it('reads a File the way the upload does', async () => {
    const file = new File([toUtf16(html)], 'ReportHistory-12345678.html', { type: 'text/html' })
    expect(await readReportFile(file)).toBe(html)
  })
})

describe('parseMt5Report — account details', () => {
  it('reads the name, account number, currency, server, type, mode and company', () => {
    expect(parse()).toMatchObject({
      name: 'Test Trader',
      account: '12345678',
      currency: 'USD',
      server: 'Demo-Real',
      accountType: 'real',
      marginMode: 'Hedge',
      company: 'Demo Markets Ltd',
      reportTime: '2026-09-26 08:12',
    })
  })

  it('handles an account line with no brackets', () => {
    expect(parse({ accountLine: '12345678' })).toMatchObject({ account: '12345678', currency: '', server: '' })
  })

  it('falls back to the page title when the account row is empty', () => {
    expect(parse({ accountLine: '' }).account).toBe('12345678')
  })

  it('works end to end from the UTF-16 bytes', () => {
    const report = parseMt5Report(decodeReport(toUtf16(buildMt5Html())))
    expect(report.account).toBe('12345678')
    expect(report.positions).toHaveLength(SAMPLE_TRADES.length)
  })
})

describe('parseMt5Report — positions', () => {
  const report = parse()

  it('finds every closed position, ordered by when it closed', () => {
    expect(report.positions.map((p) => p.position)).toEqual(['1000001', '1000002', '1000005', '1000003', '1000004'])
  })

  it('reads all the columns, skipping the blank spacer cell after Type', () => {
    expect(report.positions.find((p) => p.position === '1000001')).toEqual({
      position: '1000001',
      symbol: 'BTCUSD',
      type: 'buy',
      volume: 0.01,
      openTime: '2026-09-22 12:12:05',
      openPrice: 85866.5,
      sl: null,
      tp: null,
      closeTime: '2026-09-22 12:16:12',
      closePrice: 85901.5,
      commission: 0,
      swap: 0,
      profit: 0.35,
    })
  })

  it('reads stop loss, take profit, commission and swap when present', () => {
    const p = report.positions.find((x) => x.position === '1000003')!
    expect(p).toMatchObject({ sl: 4260, tp: 4300 })
    const overnight = report.positions.find((x) => x.position === '1000005')!
    expect(overnight).toMatchObject({ commission: -0.7, swap: -0.15, profit: -2 })
  })

  it('reads a sell and negative profit', () => {
    expect(report.positions.find((p) => p.position === '1000002')).toMatchObject({ type: 'sell', profit: -9.27 })
  })

  it('understands prices with a thousands separator', () => {
    const r = parse({ trades: [{ ...SAMPLE_TRADES[0], openPrice: '1&nbsp;234.50', closePrice: '1,240.75' }] })
    expect(r.positions[0]).toMatchObject({ openPrice: 1234.5, closePrice: 1240.75 })
  })

  it('accepts a report with no closed positions yet', () => {
    const r = parse({ trades: [] })
    expect(r.positions).toEqual([])
    expect(r.account).toBe('12345678')
  })

  it('counts a position once even if the report repeats it', () => {
    expect(parse({ trades: [SAMPLE_TRADES[0], SAMPLE_TRADES[0]] }).positions).toHaveLength(1)
  })
})

describe('parseMt5Report — deposits, account state and broker summary', () => {
  const report = parse()

  it('lists deposits from the Deals table without mistaking trades for them', () => {
    expect(report.balanceOps).toEqual([
      { time: '2026-09-21 19:34:40', type: 'balance', amount: 150.44, comment: 'D/D00000001/INR15000/00000001', balance: 150.44 },
      { time: '2026-09-23 12:19:51', type: 'balance', amount: 150.82, comment: 'D/D00000002/INR15000/00000002', balance: 197.77 },
    ])
  })

  it('has no deposits when there are none', () => {
    expect(parse({ deposits: [] }).balanceOps).toEqual([])
  })

  it('reads the account state: balance, equity, margin', () => {
    expect(report.state).toEqual({ balance: 141.57, credit: 0, floating: 0, equity: 141.57, margin: 0, freeMargin: 141.57, marginLevel: 0 })
  })

  it('keeps the broker-reported summary as printed', () => {
    expect(report.summary).toMatchObject({
      'Total Net Profit': '-179.75',
      'Gross Profit': '238.10',
      'Profit Factor': '0.57',
      'Balance Drawdown Maximal': '312.57 (117.00%)',
      'Profit Trades (% of total)': '31 (68.89%)',
      'Largest loss trade': '-125.11',
    })
  })

  it('ignores a heading label that has no value', () => {
    expect(report.summary).not.toHaveProperty('Balance Drawdown')
  })

  it('leaves the state empty rather than zero when the report has none', () => {
    const html = buildMt5Html().replace(/<tr align="left"><td><b>(Balance|Credit Facility|Floating P\/L|Equity):<\/b>.*<\/tr>\n/g, '')
    expect(parseMt5Report(html).state).toMatchObject({ balance: null, equity: null })
  })
})

describe('parseMt5Report — files that are not a usable report', () => {
  it('rejects an empty string', () => {
    expect(() => parseMt5Report('')).toThrow(Mt5ParseError)
  })

  it('rejects an unrelated web page and says what to do', () => {
    expect(() => parseMt5Report('<html><body><table><tr><td>hello</td></tr></table></body></html>')).toThrow(/account number/i)
  })

  it('rejects a report with an account but no Positions table', () => {
    const html = buildMt5Html().replace(/<tr align="center"><th colspan="14"><div style="font: 10pt Tahoma"><b>Positions<\/b><\/div><\/th><\/tr>/, '')
    expect(() => parseMt5Report(html)).toThrow(/Positions/)
  })
})

describe('instrumentFor / contractSizeFor', () => {
  it.each([
    ['BTCUSD', 'Bitcoin'],
    ['BTCUSDm', 'Bitcoin'],
    ['XBTUSD.pro', 'Bitcoin'],
    ['XAUUSD', 'XAUUSD'],
    ['XAUUSD.m', 'XAUUSD'],
    ['US30', 'US30'],
    ['US30.cash', 'US30'],
    ['DJ30', 'US30'],
    ['EURUSD', 'Forex'],
    ['GBPJPY.pro', 'Forex'],
    ['NAS100', 'NAS100'],
    ['ETHUSD', 'ETHUSD'],
  ])('maps %s to %s', (symbol, instrument) => {
    expect(instrumentFor(symbol)).toBe(instrument)
  })

  it('uses the right contract size for each market', () => {
    expect(contractSizeFor('XAUUSD')).toBe(100)
    expect(contractSizeFor('Bitcoin')).toBe(1)
    expect(contractSizeFor('US30')).toBe(1)
    expect(contractSizeFor('Forex')).toBe(100_000)
    expect(contractSizeFor('NAS100')).toBe(1)
  })
})

describe('positionsToTrades', () => {
  const report = parse()
  const trades = positionsToTrades(report)
  const byId = (position: string) => trades.find((t) => t.id === positionTradeId('12345678', position))!

  it('makes one journal trade per position with a stable id', () => {
    expect(trades).toHaveLength(5)
    expect(byId('1000001').id).toBe('mt5-12345678-1000001')
    expect(new Set(trades.map((t) => t.id)).size).toBe(5)
  })

  it('gives the same ids for the same positions in an overlapping later report', () => {
    const later = positionsToTrades(parse({ trades: [SAMPLE_TRADES[0], SAMPLE_TRADES[3]], date: '2026.09.30 09:00' }))
    expect(later.map((t) => t.id)).toEqual(['mt5-12345678-1000001', 'mt5-12345678-1000004'])
  })

  it('tags each trade with its account and source, in dollars with no conversion', () => {
    expect(byId('1000001')).toMatchObject({ account: '12345678', source: 'mt5:12345678', currency: 'USD', fxRate: 1, manualPnl: true })
  })

  it('files a trade under the day it closed, with the open time when it closed the same day', () => {
    expect(byId('1000001')).toMatchObject({ date: '2026-09-22', time: '12:12' })
  })

  it('leaves the time empty for a position held overnight, dating it by its close', () => {
    expect(byId('1000005')).toMatchObject({ date: '2026-09-24', time: '' })
  })

  it('maps symbols to journal instruments and keeps the exact MT5 symbol', () => {
    expect(byId('1000001')).toMatchObject({ instrument: 'Bitcoin', symbol: 'BTCUSD' })
    expect(byId('1000003')).toMatchObject({ instrument: 'XAUUSD', symbol: 'XAUUSD' })
    expect(byId('1000005')).toMatchObject({ instrument: 'US30', symbol: 'US30' })
  })

  it('keeps direction, lots, prices, stop loss and target', () => {
    expect(byId('1000003')).toMatchObject({ direction: 'BUY', qty: 0.01, entry: 4270.84, exit: 4282.05, stopLoss: 4260, target: 4300 })
    expect(byId('1000002')).toMatchObject({ direction: 'SELL', stopLoss: null, target: null })
  })

  it('uses MetaTrader’s own profit, folding swap in and treating commission as a cost', () => {
    expect(byId('1000001')).toMatchObject({ grossPnl: 0.35, fees: 0 })
    // −2.00 profit − 0.15 swap = −2.15 result; 0.70 commission is a cost.
    expect(byId('1000005')).toMatchObject({ grossPnl: -2.15, fees: 0.7 })
  })

  it('treats a positive commission as a rebate that adds to the result', () => {
    const t = positionsToTrades(parse({ trades: [{ ...SAMPLE_TRADES[0], commission: '0.20' }] }))[0]
    expect(t).toMatchObject({ grossPnl: 0.55, fees: 0 })
  })

  it('reproduces MetaTrader’s profit from the prices, so the contract sizes are right', () => {
    for (const position of ['1000001', '1000002', '1000003', '1000004']) {
      const t = byId(position)
      expect(grossFromPrices(t)).toBeCloseTo(report.positions.find((p) => p.position === position)!.profit, 2)
    }
    expect(grossFromPrices(byId('1000005'))).toBeCloseTo(-2, 2)
  })

  it('writes readable notes with the position id, times and hold time', () => {
    expect(byId('1000001').notes).toMatch(/position 1000001/)
    expect(byId('1000001').notes).toMatch(/held 4m/)
    expect(byId('1000005').notes).toMatch(/Swap -0\.15/)
  })
})

describe('holdLabel', () => {
  it.each([
    ['2026-09-22 12:12:05', '2026-09-22 12:16:12', '4m'],
    ['2026-09-22 12:00:00', '2026-09-22 13:05:00', '1h 5m'],
    ['2026-09-22 12:00:00', '2026-09-24 15:30:00', '2d 3h'],
    ['2026-09-22 12:00:00', '2026-09-22 12:00:00', '0m'],
  ])('%s → %s is %s', (open, close, label) => {
    expect(holdLabel(open, close)).toBe(label)
  })
})

describe('accountFromReport', () => {
  it('summarises the account and the period the report covered', () => {
    const meta = accountFromReport(parse())
    expect(meta).toMatchObject({
      account: '12345678',
      name: 'Test Trader',
      currency: 'USD',
      server: 'Demo-Real',
      marginMode: 'Hedge',
      balance: 141.57,
      equity: 141.57,
      report: { time: '2026-09-26 08:12', from: '2026-09-22', to: '2026-09-25', trades: 5 },
    })
    expect(meta.balanceOps).toHaveLength(SAMPLE_DEPOSITS.length)
    expect(meta.summary['Total Net Profit']).toBe('-179.75')
  })

  it('has an empty period for a report with no trades', () => {
    expect(accountFromReport(parse({ trades: [] })).report).toMatchObject({ from: '', to: '', trades: 0 })
  })
})
