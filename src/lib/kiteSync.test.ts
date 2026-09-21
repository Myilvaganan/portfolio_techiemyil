import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Fill } from './optionsAnalytics'
import type { KiteTrade } from './kite'
import { NotConnectedError, fillsFromKiteTrades, newFillsOnly, syncZerodhaToJournal } from './kiteSync'
import { clearKiteSession, fetchKiteTrades, getKiteSession, KiteTokenExpiredError } from './kite'
import { fetchJournal, importTrades } from './journalStore'
import { fetchStoredFills, saveFills } from './optionsStore'

vi.mock('./kite', async (orig) => ({ ...(await orig<typeof import('./kite')>()), getKiteSession: vi.fn(), fetchKiteTrades: vi.fn(), clearKiteSession: vi.fn() }))
vi.mock('./journalStore', () => ({ fetchJournal: vi.fn(), importTrades: vi.fn() }))
vi.mock('./optionsStore', () => ({ fetchStoredFills: vi.fn(), saveFills: vi.fn() }))

const TODAY = '2026-09-21'
const CALL = 'NIFTY2692925000CE' // weekly, expires 2026-09-29 → still open on TODAY unless closed

let seq = 0
function kt(over: Partial<KiteTrade> = {}): KiteTrade {
  seq += 1
  return {
    trade_id: `T${seq}`,
    order_id: `O${seq}`,
    exchange: 'NFO',
    tradingsymbol: CALL,
    transaction_type: 'BUY',
    quantity: 75,
    average_price: 100,
    fill_timestamp: `${TODAY} 09:20:00`,
    ...over,
  }
}

function fill(over: Partial<Fill> & Pick<Fill, 'side' | 'qty' | 'price'>): Fill {
  seq += 1
  const date = over.date ?? TODAY
  const time = over.time ?? '09:20:00'
  return { id: `F${seq}`, orderId: `O${seq}`, symbol: CALL, date, time, ts: Date.parse(`${date}T${time}Z`), ...over }
}

describe('fillsFromKiteTrades', () => {
  it('maps a Kite trade to a fill, keeping the wall-clock time the file import would produce', () => {
    const [f] = fillsFromKiteTrades([kt({ trade_id: '55123', order_id: '2409210001', average_price: 101.5, fill_timestamp: '2026-09-21 09:20:45' })])

    expect(f).toEqual({
      id: '55123',
      orderId: '2409210001',
      symbol: CALL,
      side: 'BUY',
      qty: 75,
      price: 101.5,
      date: '2026-09-21',
      time: '09:20:45',
      // wall-clock read as UTC — identical to how tradebook files are parsed, so dedupe keys line up
      ts: Date.UTC(2026, 8, 21, 9, 20, 45),
    })
  })

  it('keeps only option contracts on NFO / BFO', () => {
    const fills = fillsFromKiteTrades([
      kt(),
      kt({ tradingsymbol: 'RELIANCE', exchange: 'NSE' }),
      kt({ tradingsymbol: 'NIFTY26SEPFUT', exchange: 'NFO' }),
      kt({ tradingsymbol: 'GOLDM26SEPFUT', exchange: 'MCX' }),
      kt({ tradingsymbol: 'SENSEX2692582000CE', exchange: 'BFO' }),
    ])
    expect(fills.map((f) => f.symbol)).toEqual([CALL, 'SENSEX2692582000CE'])
  })

  it('skips trades that are malformed instead of guessing', () => {
    const fills = fillsFromKiteTrades([
      kt({ quantity: 0 }),
      kt({ average_price: -1 }),
      kt({ fill_timestamp: 'yesterday', exchange_timestamp: undefined, order_timestamp: undefined }),
      kt({ transaction_type: 'HOLD' as 'BUY' }),
      kt({ trade_id: '' }),
    ])
    expect(fills).toEqual([])
  })

  it('falls back to the exchange or order timestamp when there is no fill timestamp', () => {
    const [f] = fillsFromKiteTrades([kt({ fill_timestamp: undefined, exchange_timestamp: '2026-09-21T10:00:05' })])
    expect(f).toMatchObject({ date: '2026-09-21', time: '10:00:05' })
  })

  it('returns fills in time order', () => {
    const fills = fillsFromKiteTrades([kt({ trade_id: 'late', fill_timestamp: `${TODAY} 14:00:00` }), kt({ trade_id: 'early', fill_timestamp: `${TODAY} 09:16:00` })])
    expect(fills.map((f) => f.id)).toEqual(['early', 'late'])
  })
})

describe('newFillsOnly', () => {
  it('drops a fill whose trade id is already stored, whatever its timestamp says', () => {
    const stored = fill({ id: 'A1', side: 'BUY', qty: 75, price: 100 })
    const same = { ...stored, ts: stored.ts + 3000, time: '09:20:03' }
    expect(newFillsOnly([stored], [same])).toEqual([])
  })

  it('keeps identical-looking fills that have different trade ids (an order sliced into equal pieces)', () => {
    const stored = fill({ id: 'A1', side: 'BUY', qty: 1800, price: 100 })
    const a = fill({ id: 'A2', side: 'BUY', qty: 1800, price: 100 })
    const b = fill({ id: 'A3', side: 'BUY', qty: 1800, price: 100 })
    expect(newFillsOnly([stored], [a, b]).map((f) => f.id)).toEqual(['A2', 'A3'])
  })

  it('matches loosely only against stored fills that have no id', () => {
    const noId = fill({ id: '', side: 'BUY', qty: 75, price: 100 })
    const dup = fill({ id: 'A9', side: 'BUY', qty: 75, price: 100, time: '09:20:40' })
    const other = fill({ id: 'A10', side: 'BUY', qty: 75, price: 101, time: '09:20:40' })
    expect(newFillsOnly([noId], [dup, other]).map((f) => f.id)).toEqual(['A10'])
  })

  it('does not repeat an id within the incoming list', () => {
    const a = fill({ id: 'A1', side: 'BUY', qty: 75, price: 100 })
    expect(newFillsOnly([], [a, { ...a }])).toHaveLength(1)
  })
})

describe('syncZerodhaToJournal', () => {
  const session = { accessToken: 'acc', userId: 'AB1234', userName: 'Myil' }
  const CLOSED = { call: 'NIFTY2692125000CE' } // expires today, closes intraday in the fixtures below

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getKiteSession).mockReturnValue(session)
    vi.mocked(fetchStoredFills).mockResolvedValue([])
    vi.mocked(saveFills).mockImplementation(async (_b, f) => ({ added: f.length, total: f.length }))
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [], days: {}, months: [] })
    vi.mocked(importTrades).mockImplementation(async (t) => ({ added: t.length, skipped: 0, invalid: 0 }))
  })

  afterEach(() => vi.clearAllMocks())

  const winner = () => [
    kt({ tradingsymbol: CLOSED.call, transaction_type: 'BUY', quantity: 75, average_price: 100, fill_timestamp: `${TODAY} 09:25:00` }),
    kt({ tradingsymbol: CLOSED.call, transaction_type: 'SELL', quantity: 75, average_price: 120, fill_timestamp: `${TODAY} 11:10:00` }),
  ]

  it('refuses to run without a Zerodha session', async () => {
    vi.mocked(getKiteSession).mockReturnValue(null)

    await expect(syncZerodhaToJournal(TODAY)).rejects.toBeInstanceOf(NotConnectedError)
    expect(fetchKiteTrades).not.toHaveBeenCalled()
  })

  it('fetches today’s fills, stores them, and adds the closed trade to the journal', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: winner(), fetchedAt: 'x' })

    const r = await syncZerodhaToJournal(TODAY)

    expect(fetchKiteTrades).toHaveBeenCalledWith('acc')
    expect(saveFills).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveFills).mock.calls[0][0]).toBe('zerodha')
    expect(vi.mocked(saveFills).mock.calls[0][1]).toHaveLength(2)

    const sent = vi.mocked(importTrades).mock.calls[0][0]
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ date: TODAY, instrument: 'Options', direction: 'BUY', qty: 75, entry: 100, exit: 120, grossPnl: 1500, source: 'options-analytics:zerodha' })

    expect(r).toMatchObject({ userName: 'Myil', fetched: 2, newFills: 2, tradesAdded: 1, latestDate: TODAY })
    expect(r.today).toMatchObject({ date: TODAY, closed: 1, wins: 1, losses: 0, gross: 1500 })
    expect(r.today.fees).toBeGreaterThan(0)
    expect(r.today.net).toBeCloseTo(1500 - r.today.fees, 2)
    expect(r.today.open).toEqual([])
  })

  it('is safe to run again: nothing new is saved or imported', async () => {
    const trades = winner() // one set of trades, so both runs see the same trade ids
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades, fetchedAt: 'x' })

    // First sync: everything is new.
    await syncZerodhaToJournal(TODAY)
    const storedFills = vi.mocked(saveFills).mock.calls[0][1]
    const importedTrades = vi.mocked(importTrades).mock.calls[0][0]

    // Second sync, with the store and journal as the first one left them.
    vi.mocked(saveFills).mockClear()
    vi.mocked(importTrades).mockClear()
    vi.mocked(fetchStoredFills).mockResolvedValue(storedFills)
    vi.mocked(fetchJournal).mockResolvedValue({ trades: importedTrades, days: {}, months: [] })

    const again = await syncZerodhaToJournal(TODAY)

    expect(saveFills).not.toHaveBeenCalled()
    expect(importTrades).not.toHaveBeenCalled()
    expect(again).toMatchObject({ newFills: 0, tradesAdded: 0 })
    // The day's report is still produced from what is stored.
    expect(again.today.closed).toBe(1)
  })

  it('closes out a position opened on an earlier day using the stored history', async () => {
    const yesterday = fill({ symbol: CLOSED.call, side: 'BUY', qty: 75, price: 90, date: '2026-09-18', time: '14:50:00' })
    vi.mocked(fetchStoredFills).mockResolvedValue([yesterday])
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: [kt({ tradingsymbol: CLOSED.call, transaction_type: 'SELL', average_price: 130, fill_timestamp: `${TODAY} 09:20:00` })], fetchedAt: 'x' })

    const r = await syncZerodhaToJournal(TODAY)

    const [trade] = vi.mocked(importTrades).mock.calls[0][0]
    expect(trade).toMatchObject({ date: TODAY, entry: 90, exit: 130, grossPnl: 3000, time: '' })
    expect(trade.notes).toMatch(/Opened 2026-09-18/)
    expect(r.today.closed).toBe(1)
  })

  it('leaves a position that is still open out of the journal, and lists it', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: [kt({ tradingsymbol: CALL, transaction_type: 'BUY', quantity: 150 })], fetchedAt: 'x' })

    const r = await syncZerodhaToJournal(TODAY)

    expect(importTrades).not.toHaveBeenCalled()
    expect(r.tradesAdded).toBe(0)
    expect(r.today.open).toEqual([{ symbol: CALL, side: 'BUY', qty: 150 }])
    expect(r.today.closed).toBe(0)
  })

  it('does not pull older history into the journal — that has its own import', async () => {
    const old = [
      fill({ symbol: 'NIFTY2691025000CE', side: 'BUY', qty: 75, price: 100, date: '2026-09-08' }),
      fill({ symbol: 'NIFTY2691025000CE', side: 'SELL', qty: 75, price: 110, date: '2026-09-08', time: '10:00:00' }),
    ]
    vi.mocked(fetchStoredFills).mockResolvedValue(old)
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: winner(), fetchedAt: 'x' })

    await syncZerodhaToJournal(TODAY)

    const sent = vi.mocked(importTrades).mock.calls[0][0]
    expect(sent.map((t) => t.date)).toEqual([TODAY])
  })

  it('handles a day with no option trades', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: [kt({ tradingsymbol: 'RELIANCE', exchange: 'NSE' })], fetchedAt: 'x' })

    const r = await syncZerodhaToJournal(TODAY)

    expect(saveFills).not.toHaveBeenCalled()
    expect(importTrades).not.toHaveBeenCalled()
    expect(r).toMatchObject({ fetched: 0, newFills: 0, tradesAdded: 0 })
    expect(r.today).toMatchObject({ closed: 0, gross: 0, net: 0 })
  })

  it('forgets an expired session so the next click asks to reconnect', async () => {
    vi.mocked(fetchKiteTrades).mockRejectedValue(new KiteTokenExpiredError('expired'))

    await expect(syncZerodhaToJournal(TODAY)).rejects.toBeInstanceOf(KiteTokenExpiredError)
    expect(clearKiteSession).toHaveBeenCalled()
    expect(saveFills).not.toHaveBeenCalled()
  })

  it('uses the charge rates saved on the Options page for fees', async () => {
    localStorage.setItem('options_rates_v1', JSON.stringify({ zerodha: { brokeragePerOrder: 0, brokeragePct: 0, sttSellPct: 0, exchangePct: 0, sebiPerCrore: 0, gstPct: 0, stampBuyPct: 0 } }))
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: winner(), fetchedAt: 'x' })

    const r = await syncZerodhaToJournal(TODAY)

    expect(r.today.fees).toBe(0)
  })

  it('reports trades the server already had as skipped', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: winner(), fetchedAt: 'x' })
    vi.mocked(importTrades).mockResolvedValue({ added: 0, skipped: 1, invalid: 0 })

    const r = await syncZerodhaToJournal(TODAY)

    expect(r).toMatchObject({ tradesAdded: 0, tradesSkipped: 1 })
  })

  it('overlapping calls share one run instead of each syncing and reporting different numbers', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: winner(), fetchedAt: 'x' })

    const [a, b] = await Promise.all([syncZerodhaToJournal(TODAY), syncZerodhaToJournal(TODAY)])

    expect(fetchKiteTrades).toHaveBeenCalledTimes(1)
    expect(saveFills).toHaveBeenCalledTimes(1)
    expect(importTrades).toHaveBeenCalledTimes(1)
    expect(b).toBe(a)
    expect(a.tradesAdded).toBe(1)
  })

  it('runs a fresh sync once the previous one has finished', async () => {
    vi.mocked(fetchKiteTrades).mockResolvedValue({ trades: [], fetchedAt: 'x' })

    await syncZerodhaToJournal(TODAY)
    await syncZerodhaToJournal(TODAY)

    expect(fetchKiteTrades).toHaveBeenCalledTimes(2)
  })

  it('does not get stuck after a failure', async () => {
    vi.mocked(fetchKiteTrades).mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ trades: [], fetchedAt: 'x' })

    await expect(syncZerodhaToJournal(TODAY)).rejects.toThrow('boom')
    await expect(syncZerodhaToJournal(TODAY)).resolves.toMatchObject({ fetched: 0 })
  })
})

