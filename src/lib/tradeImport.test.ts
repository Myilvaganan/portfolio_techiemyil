import { describe, expect, it } from 'vitest'
import { analyseRows, autoMapping, csvToRows, findHeaderRow, normalizeContract, rowsToFills, type Cell } from './tradeImport'
import { parseOptionSymbol } from './optionsAnalytics'

const ref = '2025-09-22'

describe('normalizeContract', () => {
  it.each([
    ['NIFTY25SEP24500CE', 'NIFTY25SEP24500CE'],
    ['NIFTY2592324500CE', 'NIFTY2592324500CE'],
    ['nifty 25sep24500ce', 'NIFTY25SEP24500CE'],
    ['NIFTY 25 SEP 2025 24500 CE', 'NIFTY2592524500CE'],
    ['NIFTY-Sep2025-24500-CE', 'NIFTY25SEP24500CE'],
    ['BANKNIFTY 30 Sep 2026 CALL 52000', 'BANKNIFTY2693052000CE'],
    ['NIFTY BANK 30 SEP 2026 52000 PE', 'BANKNIFTY2693052000PE'],
    ['NIFTY 24500 CE 25-Sep-2025', 'NIFTY2592524500CE'],
    ['NIFTY 25SEP 24500 CE', 'NIFTY25SEP24500CE'],
    ['NIFTY 50 OPT 23-Oct-2025 24700 PUT', 'NIFTY25O2324700PE'],
    ['FINNIFTY 02 DEC 2025 23800 CE', 'FINNIFTY25D0223800CE'],
    ['M&M 30 SEP 2025 3200 CE', 'M&M259303200CE'],
    ['OPTIDX NIFTY 25-09-2025 PE 24500.00', 'NIFTY2592524500PE'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeContract({ symbol: input }, ref)).toBe(expected)
    expect(parseOptionSymbol(expected)).not.toBeNull()
  })

  it('rejects futures and equities', () => {
    expect(normalizeContract({ symbol: 'NIFTY 25 SEP 2025 FUT' }, ref)).toBeNull()
    expect(normalizeContract({ symbol: 'RELIANCE' }, ref)).toBeNull()
  })

  it('builds a contract from split columns', () => {
    expect(normalizeContract({ underlying: 'NIFTY', expiry: '25-09-2025', strike: 24500, right: 'Call' }, ref)).toBe('NIFTY2592524500CE')
    expect(normalizeContract({ underlying: 'Nifty Bank', expiry: '2025-10-28', strike: 52000, right: 'PE' }, ref)).toBe('BANKNIFTY25O2852000PE')
    expect(normalizeContract({ underlying: 'NIFTY', expiry: 'Sep 2025', strike: 24500, right: 'CE' }, ref)).toBe('NIFTY25SEP24500CE')
  })

  it('infers the year from the trade date when the contract has none', () => {
    expect(normalizeContract({ symbol: 'NIFTY SEP 24500 CE' }, '2025-09-01')).toBe('NIFTY25SEP24500CE')
    expect(normalizeContract({ symbol: 'NIFTY JAN 24500 CE' }, '2025-12-15')).toBe('NIFTY26JAN24500CE')
  })
})

describe('column detection', () => {
  const dhan: Cell[][] = [
    ['Trade History'],
    [],
    ['Date', 'Time', 'Name', 'Buy/Sell', 'Qty', 'Price', 'Order No', 'Trade No'],
    ['22/09/2025', '09:31:10', 'NIFTY 25 SEP 2025 24500 CE', 'BUY', 75, 100.5, 'O1', 'T1'],
    ['22/09/2025', '10:05:00', 'NIFTY 25 SEP 2025 24500 CE', 'SELL', 75, 130, 'O2', 'T2'],
  ]

  it('finds a header row after title lines', () => {
    expect(findHeaderRow([['Some report'], ['generated 2025'], ...dhan.slice(2)])).toBe(2)
  })

  it('does not mistake an option-type column for buy/sell', () => {
    const m = autoMapping(['Symbol', 'Type', 'Action', 'Qty', 'Price', 'Date'], [['NIFTY25SEP24500CE', 'CE', 'Buy', 75, 100, '2025-09-22']])
    expect(m.side).toBe(2)
    expect(m.right).toBe(1)
  })

  it('imports a broker file whose columns are named differently', () => {
    const rows: Cell[][] = [
      ['Scrip Name', 'Action', 'Traded Qty', 'Rate', 'Trade Date', 'Exchange Order No'],
      ['NIFTY 25 SEP 2025 24500 CE', 'B', '75', '₹1,100.50', '22-Sep-2025 09:31:10 AM', 'A1'],
      ['NIFTY 25 SEP 2025 24500 CE', 'S', '75', '1130', '22-Sep-2025 10:05:00 AM', 'A2'],
      ['RELIANCE', 'B', '5', '2900', '22-Sep-2025 10:05:00 AM', 'A3'],
    ]
    const a = analyseRows(rows)
    expect(a.problems).toEqual([])
    expect(a.result!.fills).toHaveLength(2)
    expect(a.result!.ignoredRows).toBe(1)
    expect(a.result!.fills[0]).toMatchObject({ symbol: 'NIFTY2592524500CE', side: 'BUY', qty: 75, price: 1100.5, date: '2025-09-22', time: '09:31:10', orderId: 'A1' })
  })

  it('supports contracts split across columns and Excel dates', () => {
    const rows: Cell[][] = [
      ['Stock', 'Expiry Date', 'Strike Price', 'Option Type', 'Action', 'Quantity', 'Trade Price', 'Trade Date'],
      ['NIFTY', '25-Sep-2025', 24500, 'Call', 'Buy', 75, 100, new Date(Date.UTC(2025, 8, 22, 9, 31, 10))],
      ['NIFTY', '25-Sep-2025', 24500, 'Call', 'Sell', 75, 120, new Date(Date.UTC(2025, 8, 22, 10, 5, 0))],
    ]
    const a = analyseRows(rows)
    expect(a.problems).toEqual([])
    expect(a.result!.fills.map((f) => [f.symbol, f.side, f.time])).toEqual([
      ['NIFTY2592524500CE', 'BUY', '09:31:10'],
      ['NIFTY2592524500CE', 'SELL', '10:05:00'],
    ])
  })

  it('reports what is missing when columns cannot be matched', () => {
    const a = analyseRows([['foo', 'bar', 'baz'], ['1', '2', '3']])
    expect(a.result).toBeUndefined()
    expect(a.problems.length).toBeGreaterThan(0)
  })
})

describe('rowsToFills', () => {
  const header: Cell[] = ['Symbol', 'Side', 'Qty', 'Price', 'Date']
  const mapping = { symbol: 0, side: 1, qty: 2, price: 3, date: 4 }

  it('keeps file order when there is no time, even for newest-first files', () => {
    const rows: Cell[][] = [
      header,
      ['NIFTY25SEP24500CE', 'SELL', 75, 130, '2025-09-22'],
      ['NIFTY25SEP24500CE', 'BUY', 75, 100, '2025-09-22'],
      ['NIFTY25SEP24500CE', 'SELL', 75, 90, '2025-09-21'],
      ['NIFTY25SEP24500CE', 'BUY', 75, 80, '2025-09-21'],
    ]
    const fills = rowsToFills(rows, 0, mapping).fills
    expect(fills.map((f) => f.side)).toEqual(['BUY', 'SELL', 'BUY', 'SELL'])
    expect(fills.map((f) => f.date)).toEqual(['2025-09-21', '2025-09-21', '2025-09-22', '2025-09-22'])
  })

  it('gives stable ids so overlapping exports de-duplicate', () => {
    const a = rowsToFills([header, ['NIFTY25SEP24500CE', 'BUY', 75, 100, '2025-09-22 09:30:00'], ['NIFTY25SEP24500CE', 'BUY', 75, 100, '2025-09-22 09:30:00']], 0, mapping).fills
    const b = rowsToFills([header, ['NIFTY25SEP24500CE', 'BUY', 75, 100, '2025-09-22 09:30:00']], 0, mapping).fills
    expect(new Set(a.map((f) => f.id)).size).toBe(2)
    expect(b[0].id).toBe(a[0].id)
  })

  it('parses AM/PM times and negative quantities', () => {
    const f = rowsToFills([header, ['NIFTY25SEP24500CE', 'SELL', -75, 100, '22/09/2025 02:15:30 PM']], 0, mapping).fills[0]
    expect(f).toMatchObject({ qty: 75, time: '14:15:30', date: '2025-09-22' })
  })

  it('reads CSV with quoted commas', () => {
    expect(csvToRows('a,b\n"1,000",x')).toEqual([['a', 'b'], ['1,000', 'x']])
  })
})
