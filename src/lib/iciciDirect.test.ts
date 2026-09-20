import { describe, expect, it } from 'vitest'
import { analyseRows, csvToRows, normalizeContract, rowsToFills, type Cell } from './tradeImport'
import { analyze, buildRoundTrips, estimateCharges, parseOptionSymbol } from './optionsAnalytics'

// Rows copied from a real ICICI Direct F&O order book export: newest first, no time column, real charges on every row.
const HEADER = 'Trade Date,Contract Descriptor,Exchange,Action,Qty,Price,Value,Order Ref.,Securities Transaction Tax-STT,Transaction Charges,Stamp Duty,SEBI Turnover Charges,Brokerage,Service Tax On Brokerage,Total Charges'
const ROWS = [
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","BSE","Sell","1000","1.82","1812","#20260910A400081220","2.72","0.59","0","0","20","3.72","27.03"',
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","BSE","Buy","1000","0.59","621","#20260910A400081063","0","0.2","0.02","0","20","3.62","23.84"',
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-75500-C-E-I","BSE","Sell","1000","9.1","9100","#20260910A400078372","13.65","2.96","0","0.01","20","4.14","40.76"',
  '"10-Sep-26","OPT-SENSEX-10-Sep-2026-75500-C-E-I","BSE","Buy","1000","8.5","8492","#20260910A400078001","0","2.76","0.25","0","20","4.1","27.11"',
  '"23-Feb-26","OPT-SBILIFE-24-Feb-2026-2120-P-E-S","NSE","Sell","375","20.65","7743.75","#202602232500007997","7.74","2.75","0","0.01","49","9.32","68.82"',
  '"23-Feb-26","OPT-SBILIFE-24-Feb-2026-2120-P-E-S","NSE","Buy","375","21.5","8062.5","#202602232500006515","0","2.86","0","0.01","49","9.34","61.21"',
  '"20-Feb-26","OPT-FINNIFTY-24-Feb-2026-28200-C-E-I","NSE","Buy","60","165","9900","#202602202500009404","0","3.52","0","0.01","49","9.46","61.99"',
  '"23-Feb-26","OPT-FINNIFTY-24-Feb-2026-28200-C-E-I","NSE","Sell","60","297.45","17847","#202602232500001487","18.04","6.34","0","0.02","49","9.96","83.36"',
]
const csv = [HEADER, ...ROWS].join('\n')

describe('ICICI Direct order book', () => {
  it('reads the contract descriptor with single-letter call/put', () => {
    expect(normalizeContract({ symbol: 'OPT-SENSEX-10-Sep-2026-74900-P-E-I' }, '2026-09-10')).toBe('SENSEX2691074900PE')
    expect(normalizeContract({ symbol: 'OPT-NIFTY-15-Sep-2026-23700-C-E-I' }, '2026-09-10')).toBe('NIFTY2691523700CE')
    expect(normalizeContract({ symbol: 'OPT-SBILIFE-24-Feb-2026-2120-P-E-S' }, '2026-02-23')).toBe('SBILIFE262242120PE')
    expect(parseOptionSymbol('SBILIFE262242120PE')).toMatchObject({ underlying: 'SBILIFE', strike: 2120, type: 'PE', expiry: '2026-02-24' })
    expect(normalizeContract({ symbol: 'FUT-NIFTY-24-Feb-2026' }, '2026-02-23')).toBeNull()
  })

  it('detects the columns, including the charge columns', () => {
    const a = analyseRows(csvToRows(csv))
    expect(a.problems).toEqual([])
    expect(a.result!.fills).toHaveLength(8)
    expect(a.result!.ignoredRows).toBe(0)
    expect(a.mapping).toMatchObject({ symbol: 1, side: 3, qty: 4, price: 5, date: 0, orderId: 7 })
    expect(a.mapping.time).toBeUndefined()
  })

  it('orders a newest-first file chronologically so buys pair with the right sells', () => {
    const fills = analyseRows(csvToRows(csv)).result!.fills
    const { trips } = buildRoundTrips(fills, '2026-09-20')
    const put = trips.find((t) => t.symbol === 'SENSEX2691074900PE')!
    expect(put.direction).toBe('LONG')
    expect(put.pnl).toBeCloseTo((1.82 - 0.59) * 1000)
    expect(trips.find((t) => t.symbol === 'SENSEX2691075500CE')).toMatchObject({ direction: 'LONG' })
    expect(trips.find((t) => t.symbol === 'SENSEX2691075500CE')!.pnl).toBeCloseTo((9.1 - 8.5) * 1000)
    expect(trips.find((t) => t.symbol === 'FINNIFTY26224 28200CE'.replace(' ', ''))?.pnl).toBeCloseTo((297.45 - 165) * 60)
  })

  it('uses the charges printed on the statement instead of estimating', () => {
    const fills = analyseRows(csvToRows(csv)).result!.fills
    expect(fills[0].chg).toMatchObject({ stt: expect.any(Number), total: expect.any(Number) })
    const charges = estimateCharges(fills)
    expect(charges.every((c) => c.actual)).toBe(true)
    const total = charges.reduce((s, c) => s + c.total, 0)
    expect(total).toBeCloseTo(27.03 + 23.84 + 40.76 + 27.11 + 68.82 + 61.21 + 61.99 + 83.36, 2)
    const { trips } = buildRoundTrips(fills, '2026-09-20')
    const a = analyze(trips, charges)
    expect(a.chargesSource).toBe('actual')
    expect(a.chargeParts.brokerage).toBeCloseTo(20 * 4 + 49 * 4)
    expect(a.chargeParts.stt).toBeCloseTo(2.72 + 13.65 + 7.74 + 18.04)
    expect(a.net).toBeCloseTo(a.gross - total, 2)
  })

  it('falls back to estimates when a file has no charge columns', () => {
    const plain = analyseRows(csvToRows(['Trade Date,Contract Descriptor,Action,Qty,Price', '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","Buy","1000","0.59"', '"10-Sep-26","OPT-SENSEX-10-Sep-2026-74900-P-E-I","Sell","1000","1.82"'].join('\n')))
    const fills = plain.result!.fills
    expect(fills[0].chg).toBeUndefined()
    expect(analyze(buildRoundTrips(fills, '2026-09-20').trips, estimateCharges(fills)).chargesSource).toBe('estimated')
  })
})

describe('other broker layouts', () => {
  it('reads contracts where the day is separate from the month (Dhan-style)', () => {
    expect(normalizeContract({ symbol: 'NIFTY 28 AUG 25000 CALL' }, '2025-08-25')).toBe('NIFTY2582825000CE')
    expect(normalizeContract({ symbol: 'BANKNIFTY 30 SEP 52000 PUT' }, '2025-09-22')).toBe('BANKNIFTY2593052000PE')
    expect(normalizeContract({ symbol: 'NIFTY-25Sep2025-24500-CE' }, '2025-09-22')).toBe('NIFTY2592524500CE')
    expect(normalizeContract({ symbol: 'NIFTY-Sep2025-24500-CE' }, '2025-09-22')).toBe('NIFTY25SEP24500CE')
    expect(normalizeContract({ symbol: 'NIFTY 25SEP 24500 CE' }, '2025-09-22')).toBe('NIFTY25SEP24500CE')
  })

  it('accepts Excel serial numbers for dates and times', () => {
    const rows: Cell[][] = [
      ['Date', 'Time', 'Name', 'Buy/Sell', 'Qty', 'Price'],
      [45292, 0.5, 'NIFTY 04 JAN 2024 21500 CE', 'BUY', 50, 100],
      [45292, 0.5208333, 'NIFTY 04 JAN 2024 21500 CE', 'SELL', 50, 120],
    ]
    const r = analyseRows(rows).result!
    expect(r.fills).toHaveLength(2)
    expect(r.fills[0]).toMatchObject({ date: '2024-01-01', time: '12:00:00', symbol: 'NIFTY2410421500CE' })
    expect(r.fills[1].time).toBe('12:30:00')
  })

  it('reports contracts it could not read', () => {
    const rows: Cell[][] = [['Symbol', 'Side', 'Qty', 'Price', 'Date'], ['WEIRD-CONTRACT-XYZ', 'BUY', 1, 1, '2025-09-22']]
    const r = rowsToFills(rows, 0, { symbol: 0, side: 1, qty: 2, price: 3, date: 4 })
    expect(r.fills).toEqual([])
    expect(r.unrecognised).toEqual(['WEIRD-CONTRACT-XYZ'])
  })
})
