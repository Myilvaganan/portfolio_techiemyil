import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CHARGE_RATES, estimateCharges, type ChargeRates, type Fill } from './optionsAnalytics'
import { backfillId, diffBackfill, loadBackfillPlan, loadChargeRates, summarise, tradesFromFills } from './journalBackfill'
import { blankTrade, type Trade } from './journal'
import { fetchStoredBrokers, fetchStoredFills } from './optionsStore'

vi.mock('./optionsStore', () => ({ fetchStoredBrokers: vi.fn(), fetchStoredFills: vi.fn() }))

const AS_OF = '2026-09-21'
const CALL = 'NIFTY2691025000CE' // weekly, expires 2026-09-10
const PUT = 'BANKNIFTY26SEP54000PE' // monthly

let seq = 0
function fill(over: Partial<Fill> & Pick<Fill, 'side' | 'qty' | 'price'>): Fill {
  seq += 1
  const date = over.date ?? '2026-09-10'
  const time = over.time ?? '09:20:00'
  return { id: `f${seq}`, orderId: `o${seq}`, symbol: CALL, date, time, ts: Date.parse(`${date}T${time}Z`), ...over }
}

describe('tradesFromFills', () => {
  it('turns a closed long into a BUY trade dated the day it closed', () => {
    const [t] = tradesFromFills('zerodha', [fill({ side: 'BUY', qty: 75, price: 100 }), fill({ side: 'SELL', qty: 75, price: 120, time: '11:05:00' })], DEFAULT_CHARGE_RATES, AS_OF)

    expect(t).toMatchObject({
      date: '2026-09-10',
      time: '09:20',
      instrument: 'Options',
      symbol: 'NIFTY 25000 CE · 2026-09-10',
      direction: 'BUY',
      currency: 'INR',
      fxRate: 1,
      qty: 75,
      entry: 100,
      exit: 120,
      grossPnl: 1500,
      manualPnl: true,
      source: 'options-analytics:zerodha',
    })
    expect(t.notes).toMatch(/Imported from Options Analytics \(Zerodha\)/)
  })

  it('maps a closed short to a SELL trade with the right sign', () => {
    const [t] = tradesFromFills('zerodha', [fill({ side: 'SELL', qty: 75, price: 120 }), fill({ side: 'BUY', qty: 75, price: 100, time: '10:00:00' })], DEFAULT_CHARGE_RATES, AS_OF)
    expect(t).toMatchObject({ direction: 'SELL', grossPnl: 1500, entry: 120, exit: 100 })
  })

  it('counts scaling in as one trade with the average entry', () => {
    const trades = tradesFromFills(
      'zerodha',
      [fill({ side: 'BUY', qty: 50, price: 100 }), fill({ side: 'BUY', qty: 25, price: 110, time: '09:30:00' }), fill({ side: 'SELL', qty: 75, price: 120, time: '10:30:00' })],
      DEFAULT_CHARGE_RATES,
      AS_OF,
    )
    expect(trades).toHaveLength(1)
    expect(trades[0]).toMatchObject({ qty: 75, grossPnl: 1250 })
    expect(trades[0].entry).toBeCloseTo(103.3333, 3)
  })

  it('splits back-to-back trades on the same contract into separate journal trades', () => {
    const trades = tradesFromFills(
      'zerodha',
      [
        fill({ side: 'BUY', qty: 75, price: 100 }),
        fill({ side: 'SELL', qty: 75, price: 90, time: '09:40:00' }),
        fill({ side: 'BUY', qty: 75, price: 95, time: '10:00:00' }),
        fill({ side: 'SELL', qty: 75, price: 105, time: '10:20:00' }),
      ],
      DEFAULT_CHARGE_RATES,
      AS_OF,
    )
    expect(trades.map((t) => t.grossPnl)).toEqual([-750, 750])
    expect(new Set(trades.map((t) => t.id)).size).toBe(2)
  })

  it('dates an overnight trade by its close and records when it opened', () => {
    const [t] = tradesFromFills(
      'zerodha',
      [fill({ side: 'BUY', qty: 75, price: 100, date: '2026-09-09', time: '14:50:00' }), fill({ side: 'SELL', qty: 75, price: 130, date: '2026-09-10', time: '09:20:00' })],
      DEFAULT_CHARGE_RATES,
      AS_OF,
    )
    expect(t.date).toBe('2026-09-10')
    expect(t.time).toBe('')
    expect(t.notes).toMatch(/Opened 2026-09-09 14:50, closed 2026-09-10/)
  })

  it('books a contract held to expiry as a full loss', () => {
    const [t] = tradesFromFills('zerodha', [fill({ side: 'BUY', qty: 75, price: 50, date: '2026-09-08' })], DEFAULT_CHARGE_RATES, AS_OF)
    expect(t).toMatchObject({ date: '2026-09-10', grossPnl: -3750, exit: 0 })
    expect(t.notes).toMatch(/Held to expiry/)
  })

  it('leaves out positions that are still open', () => {
    const open = tradesFromFills('zerodha', [fill({ side: 'BUY', qty: 75, price: 100, symbol: 'NIFTY2692925000CE' })], DEFAULT_CHARGE_RATES, AS_OF)
    expect(open).toEqual([])
  })

  it('ignores anything that is not an option contract', () => {
    expect(
      tradesFromFills('zerodha', [fill({ side: 'BUY', qty: 1, price: 10, symbol: 'RELIANCE' }), fill({ side: 'SELL', qty: 1, price: 12, symbol: 'RELIANCE' })], DEFAULT_CHARGE_RATES, AS_OF),
    ).toEqual([])
  })

  describe('fees', () => {
    const legs = () => [fill({ side: 'BUY', qty: 75, price: 100 }), fill({ side: 'SELL', qty: 75, price: 120, time: '11:00:00' })]

    it('estimates from the broker’s charge rates when the statement has none', () => {
      const f = legs()
      const [t] = tradesFromFills('zerodha', f, DEFAULT_CHARGE_RATES, AS_OF)
      const expected = estimateCharges(f, DEFAULT_CHARGE_RATES).reduce((s, c) => s + c.total, 0)
      expect(t.fees).toBeCloseTo(expected, 2)
      expect(t.fees).toBeGreaterThan(0)
    })

    it('follows the user’s own rates', () => {
      const free: ChargeRates = { brokeragePerOrder: 0, brokeragePct: 0, sttSellPct: 0, exchangePct: 0, sebiPerCrore: 0, gstPct: 0, stampBuyPct: 0 }
      expect(tradesFromFills('zerodha', legs(), free, AS_OF)[0].fees).toBe(0)
    })

    it('prefers the real charges printed on the statement', () => {
      const real = { stt: 0, exchange: 0, stamp: 0, sebi: 0, brokerage: 0, gst: 0 }
      const f = [
        fill({ side: 'BUY', qty: 75, price: 100, chg: { ...real, total: 30 } }),
        fill({ side: 'SELL', qty: 75, price: 120, time: '11:00:00', chg: { ...real, total: 50 } }),
      ]
      expect(tradesFromFills('zerodha', f, DEFAULT_CHARGE_RATES, AS_OF)[0].fees).toBe(80)
    })

    it('does not charge the synthetic expiry exit', () => {
      const f = [fill({ side: 'BUY', qty: 75, price: 50, date: '2026-09-08' })]
      const [t] = tradesFromFills('zerodha', f, DEFAULT_CHARGE_RATES, AS_OF)
      expect(t.fees).toBeCloseTo(estimateCharges(f, DEFAULT_CHARGE_RATES).reduce((s, c) => s + c.total, 0), 2)
    })
  })

  describe('ids', () => {
    const f = () => [fill({ side: 'BUY', qty: 75, price: 100 }), fill({ side: 'SELL', qty: 75, price: 120, time: '11:00:00' })]

    it('are stable, so importing the same history twice is recognised', () => {
      const fills = f()
      expect(tradesFromFills('zerodha', fills, DEFAULT_CHARGE_RATES, AS_OF)[0].id).toBe(tradesFromFills('zerodha', fills, DEFAULT_CHARGE_RATES, AS_OF)[0].id)
    })

    it('differ per broker and per contract', () => {
      const fills = f()
      const a = tradesFromFills('zerodha', fills, DEFAULT_CHARGE_RATES, AS_OF)[0].id
      const b = tradesFromFills('dhan', fills, DEFAULT_CHARGE_RATES, AS_OF)[0].id
      expect(a).not.toBe(b)
      const put = tradesFromFills(
        'zerodha',
        [fill({ side: 'BUY', qty: 75, price: 100, symbol: PUT, date: '2026-09-08' }), fill({ side: 'SELL', qty: 75, price: 120, symbol: PUT, date: '2026-09-08', time: '11:00:00' })],
        DEFAULT_CHARGE_RATES,
        AS_OF,
      )[0].id
      expect(put).not.toBe(a)
    })

    it('satisfy the server’s id format', () => {
      expect(backfillId('zerodha', { symbol: CALL, openTs: 1, closeTs: 2, direction: 'LONG', qty: 75 })).toMatch(/^[A-Za-z0-9_-]{6,64}$/)
      expect(backfillId('a'.repeat(24), { symbol: CALL, openTs: 1, closeTs: 2, direction: 'LONG', qty: 75 }).length).toBeLessThanOrEqual(64)
    })
  })
})

describe('summarise', () => {
  it('reports the span, gross P&L and fees', () => {
    const trades = tradesFromFills(
      'zerodha',
      [
        fill({ side: 'BUY', qty: 75, price: 100, date: '2026-09-08' }),
        fill({ side: 'SELL', qty: 75, price: 120, date: '2026-09-08', time: '11:00:00' }),
        fill({ side: 'BUY', qty: 75, price: 100, symbol: PUT, date: '2026-09-09' }),
        fill({ side: 'SELL', qty: 75, price: 90, symbol: PUT, date: '2026-09-09', time: '11:00:00' }),
      ],
      DEFAULT_CHARGE_RATES,
      AS_OF,
    )
    const s = summarise('zerodha', trades)
    expect(s).toMatchObject({ id: 'zerodha', label: 'Zerodha', from: '2026-09-08', to: '2026-09-09', gross: 750 })
    expect(s.fees).toBeGreaterThan(0)
  })

  it('handles no trades', () => {
    expect(summarise('zerodha', [])).toMatchObject({ from: '', to: '', gross: 0, fees: 0 })
  })
})

describe('loadBackfillPlan', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.clearAllMocks())

  it('reads each stored broker, skips the demo data and brokers with no closed trades', async () => {
    vi.mocked(fetchStoredBrokers).mockResolvedValue(['zerodha', 'sample', 'dhan'])
    vi.mocked(fetchStoredFills).mockImplementation(async (id) =>
      id === 'zerodha' ? [fill({ side: 'BUY', qty: 75, price: 100 }), fill({ side: 'SELL', qty: 75, price: 120, time: '11:00:00' })] : [],
    )

    const plan = await loadBackfillPlan(AS_OF)

    expect(plan.map((b) => b.id)).toEqual(['zerodha'])
    expect(plan[0].trades).toHaveLength(1)
    expect(fetchStoredFills).not.toHaveBeenCalledWith('sample')
  })

  it('uses the charge rates saved on the Options page', async () => {
    localStorage.setItem('options_rates_v1', JSON.stringify({ zerodha: { brokeragePerOrder: 0, brokeragePct: 0, sttSellPct: 0, exchangePct: 0, sebiPerCrore: 0, gstPct: 0, stampBuyPct: 0 } }))
    vi.mocked(fetchStoredBrokers).mockResolvedValue(['zerodha'])
    vi.mocked(fetchStoredFills).mockResolvedValue([fill({ side: 'BUY', qty: 75, price: 100 }), fill({ side: 'SELL', qty: 75, price: 120, time: '11:00:00' })])

    const [broker] = await loadBackfillPlan(AS_OF)
    expect(broker.fees).toBe(0)
  })

  it('falls back to defaults when the saved rates are corrupt', () => {
    localStorage.setItem('options_rates_v1', '{nope')
    expect(loadChargeRates()).toEqual({})
  })
})

describe('diffBackfill', () => {
  const t = (id: string, source: string, date = '2026-09-08'): Trade => ({ ...blankTrade(date), id, instrument: 'Options', source })
  const plan = [summarise('zerodha', [t('oa-zerodha-1', 'options-analytics:zerodha'), t('oa-zerodha-2', 'options-analytics:zerodha')])]

  it('separates trades that are new from those already in the journal', () => {
    const { rows } = diffBackfill(plan, [t('oa-zerodha-1', 'options-analytics:zerodha')])
    expect(rows).toHaveLength(1)
    expect(rows[0].fresh.map((x) => x.id)).toEqual(['oa-zerodha-2'])
    expect(rows[0].already).toBe(1)
  })

  it('reports everything as new for an empty journal', () => {
    expect(diffBackfill(plan, []).rows[0].fresh).toHaveLength(2)
  })

  it('flags an earlier import that Options Analytics no longer produces', () => {
    const stale = t('oa-zerodha-OLD', 'options-analytics:zerodha', '2026-09-05')
    const { outdated } = diffBackfill(plan, [t('oa-zerodha-1', 'options-analytics:zerodha'), stale])
    expect(outdated).toEqual([stale])
  })

  it('never flags hand-typed trades, or imports from a broker that was not re-read', () => {
    const typed = t('typed-trade-1', '')
    const otherBroker = t('oa-dhan-9', 'options-analytics:dhan')
    expect(diffBackfill(plan, [typed, otherBroker]).outdated).toEqual([])
  })

  it('copes with trades saved before the source field existed', () => {
    const legacy = { ...t('old-trade-1', ''), source: undefined } as unknown as Trade
    expect(diffBackfill(plan, [legacy]).outdated).toEqual([])
  })
})

