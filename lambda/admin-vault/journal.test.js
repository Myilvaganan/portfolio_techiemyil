import { beforeEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createJournalApi, sanitizeTrade, sanitizeDay, sanitizeSettings } = require('./journal.js')

// In-memory stand-in for S3: enough of Get/Put/List for the journal's storage.
function fakeS3() {
  const objects = new Map()
  return {
    objects,
    async send(cmd) {
      const { Key, Body, Prefix } = cmd.input
      switch (cmd.constructor.name) {
        case 'GetObjectCommand':
          if (!objects.has(Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' })
          return { Body: { transformToString: async () => objects.get(Key) } }
        case 'PutObjectCommand':
          objects.set(Key, Body)
          return {}
        case 'ListObjectsV2Command':
          return {
            Contents: [...objects.keys()].filter((k) => k.startsWith(Prefix)).map((k) => ({ Key: k, Size: objects.get(k).length })),
            IsTruncated: false,
          }
        default:
          throw new Error(`unexpected ${cmd.constructor.name}`)
      }
    },
  }
}

const trade = (over = {}) => ({
  date: '2026-09-15',
  instrument: 'Options',
  symbol: 'NIFTY 25000 CE',
  direction: 'BUY',
  currency: 'INR',
  qty: 75,
  grossPnl: 1500,
  fees: 40,
  ...over,
})

describe('sanitizeTrade', () => {
  it('accepts a valid trade and fills defaults', () => {
    const t = sanitizeTrade(trade())
    expect(t).toMatchObject({ date: '2026-09-15', instrument: 'Options', direction: 'BUY', grossPnl: 1500, fees: 40, fxRate: 1, contractSize: 1 })
    expect(t.id).toMatch(/^[A-Za-z0-9_-]{6,64}$/)
    expect(t.mistakes).toEqual([])
    expect(t.followedPlan).toBeNull()
  })

  it.each([
    ['a missing instrument', { instrument: '  ' }],
    ['an impossible date', { date: '2026-02-31' }],
    ['a bad direction', { direction: 'HOLD' }],
    ['a non-numeric P&L', { grossPnl: 'lots' }],
  ])('rejects %s', (_label, over) => {
    expect(sanitizeTrade(trade(over))).toBeNull()
  })

  it('keeps optional prices null instead of turning them into 0', () => {
    const t = sanitizeTrade(trade({ entry: '', stopLoss: null }))
    expect(t.entry).toBeNull()
    expect(t.stopLoss).toBeNull()
  })

  it('only applies an FX rate to USD trades', () => {
    expect(sanitizeTrade(trade({ currency: 'INR', fxRate: 96 })).fxRate).toBe(1)
    expect(sanitizeTrade(trade({ currency: 'USD', fxRate: 96 })).fxRate).toBe(96)
  })

  it('dedupes and caps mistakes, and clamps the rating', () => {
    const t = sanitizeTrade(trade({ mistakes: ['FOMO', 'FOMO', '', 'Moved stop'], rating: 9 }))
    expect(t.mistakes).toEqual(['FOMO', 'Moved stop'])
    expect(t.rating).toBe(0)
  })
})

describe('sanitizeDay / sanitizeSettings', () => {
  it('validates the day and drops unknown bias values', () => {
    expect(sanitizeDay({ date: 'nope' })).toBeNull()
    expect(sanitizeDay({ date: '2026-09-15', bias: 'Moonshot', plan: ' buy dips ' })).toMatchObject({ bias: '', plan: 'buy dips' })
  })

  it('applies defaults and bounds to settings', () => {
    expect(sanitizeSettings(undefined)).toEqual({ taxRate: 0, taxMode: 'per-trade', taxRules: [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }], startingCapital: 0, dailyLossLimit: 0, maxTradesPerDay: 0 })
    expect(sanitizeSettings({ taxRate: 500, taxMode: 'weird', startingCapital: -5 })).toMatchObject({ taxRate: 0, taxMode: 'per-trade', startingCapital: 0 })
  })
})

describe('sanitizeSettings — per-instrument tax rules', () => {
  it('keeps valid rules and defaults a missing mode', () => {
    const s = sanitizeSettings({ taxRules: [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }, { instrument: 'Options', rate: 15.5, mode: 'net' }, { instrument: 'XAUUSD', rate: 20 }] })
    expect(s.taxRules).toEqual([
      { instrument: 'Bitcoin', rate: 30, mode: 'per-trade' },
      { instrument: 'Options', rate: 15.5, mode: 'net' },
      { instrument: 'XAUUSD', rate: 20, mode: 'per-trade' },
    ])
  })

  it('drops rules with no name, a bad rate, or a repeated instrument (case-insensitive)', () => {
    const s = sanitizeSettings({
      taxRules: [{ instrument: '  ', rate: 10 }, { instrument: 'A', rate: 101 }, { instrument: 'B', rate: 'x' }, { instrument: 'Bitcoin', rate: 30 }, { instrument: 'bitcoin', rate: 5 }, 'junk', null],
    })
    expect(s.taxRules).toEqual([{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }])
  })

  it('uses the default Bitcoin rule when none was ever saved, but respects an explicit empty list', () => {
    expect(sanitizeSettings({ taxRate: 10 }).taxRules).toEqual([{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }])
    expect(sanitizeSettings({ taxRules: [] }).taxRules).toEqual([])
  })

  it('falls back to the default rule for a malformed value and caps the number of rules', () => {
    expect(sanitizeSettings({ taxRules: 'lots' }).taxRules).toEqual([{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }])
    const many = Array.from({ length: 50 }, (_, i) => ({ instrument: `I${i}`, rate: 10 }))
    expect(sanitizeSettings({ taxRules: many }).taxRules).toHaveLength(30)
  })
})

describe('journal API', () => {
  let s3
  let api
  beforeEach(() => {
    s3 = fakeS3()
    api = createJournalApi({ s3, bucket: 'b' })
  })

  const call = (method, path, extra = {}) => api({ method, path, ...extra })

  it('ignores paths that are not journal routes', async () => {
    expect(await call('GET', '/admin/documents')).toBeNull()
  })

  it('saves a trade and returns it from the matching month only', async () => {
    const saved = await call('POST', '/admin/journal/trade', { payload: { trade: trade() } })
    expect(saved.statusCode).toBe(200)

    const inRange = await call('GET', '/admin/journal/data', { query: { from: '2026-09', to: '2026-09' } })
    expect(inRange.body.trades).toHaveLength(1)
    expect(inRange.body.months).toEqual(['2026-09'])

    const other = await call('GET', '/admin/journal/data', { query: { from: '2026-10', to: '2026-10' } })
    expect(other.body.trades).toHaveLength(0)
  })

  it('updates in place when the same id is saved again', async () => {
    const { body } = await call('POST', '/admin/journal/trade', { payload: { trade: trade() } })
    await call('POST', '/admin/journal/trade', { payload: { trade: { ...trade(), id: body.trade.id, grossPnl: -200 } } })

    const { body: data } = await call('GET', '/admin/journal/data', { query: {} })
    expect(data.trades).toHaveLength(1)
    expect(data.trades[0].grossPnl).toBe(-200)
  })

  it('moves a trade to the new month when its date is edited', async () => {
    const { body } = await call('POST', '/admin/journal/trade', { payload: { trade: trade({ date: '2026-08-31' }) } })
    await call('POST', '/admin/journal/trade', {
      payload: { trade: { ...trade({ date: '2026-09-01' }), id: body.trade.id }, previousDate: '2026-08-31' },
    })

    const aug = await call('GET', '/admin/journal/data', { query: { from: '2026-08', to: '2026-08' } })
    const sep = await call('GET', '/admin/journal/data', { query: { from: '2026-09', to: '2026-09' } })
    expect(aug.body.trades).toHaveLength(0)
    expect(sep.body.trades).toHaveLength(1)
  })

  it('rejects an invalid trade', async () => {
    const res = await call('POST', '/admin/journal/trade', { payload: { trade: trade({ direction: 'X' }) } })
    expect(res.statusCode).toBe(400)
  })

  it('deletes a trade', async () => {
    const { body } = await call('POST', '/admin/journal/trade', { payload: { trade: trade() } })
    const res = await call('DELETE', '/admin/journal/trade', { query: { date: '2026-09-15', id: body.trade.id } })
    expect(res.body.removed).toBe(1)

    const { body: data } = await call('GET', '/admin/journal/data', { query: {} })
    expect(data.trades).toHaveLength(0)
  })

  it('stores day notes and removes them when cleared', async () => {
    await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-15', plan: 'Trade the range', mood: 4 } } })
    let { body: data } = await call('GET', '/admin/journal/data', { query: {} })
    expect(data.days['2026-09-15']).toMatchObject({ plan: 'Trade the range', mood: 4 })

    await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-15' } } })
    ;({ body: data } = await call('GET', '/admin/journal/data', { query: {} }))
    expect(data.days['2026-09-15']).toBeUndefined()
  })

  it('keeps trades sorted by date and time across months', async () => {
    await call('POST', '/admin/journal/trade', { payload: { trade: trade({ date: '2026-09-02', time: '10:00' }) } })
    await call('POST', '/admin/journal/trade', { payload: { trade: trade({ date: '2026-08-30', time: '15:00' }) } })
    await call('POST', '/admin/journal/trade', { payload: { trade: trade({ date: '2026-09-02', time: '09:15' }) } })

    const { body } = await call('GET', '/admin/journal/data', { query: {} })
    expect(body.trades.map((t) => `${t.date} ${t.time}`)).toEqual(['2026-08-30 15:00', '2026-09-02 09:15', '2026-09-02 10:00'])
  })

  it('round-trips settings with defaults when nothing is saved', async () => {
    expect((await call('GET', '/admin/journal/settings')).body.settings).toMatchObject({ taxRate: 0, taxRules: [{ instrument: 'Bitcoin', rate: 30 }] })
    await call('POST', '/admin/journal/settings', { payload: { settings: { taxRate: 25, taxMode: 'net', dailyLossLimit: 5000, taxRules: [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }] } } })
    expect((await call('GET', '/admin/journal/settings')).body.settings).toMatchObject({ taxRate: 25, taxMode: 'net', dailyLossLimit: 5000, taxRules: [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }] })
  })

  it('rejects malformed range parameters', async () => {
    const res = await call('GET', '/admin/journal/data', { query: { from: 'Sept' } })
    expect(res.statusCode).toBe(400)
  })

  describe('bulk import (backfill)', () => {
    const imported = (id, over = {}) => trade({ id, source: 'options-analytics:zerodha', ...over })
    const importCall = (trades) => call('POST', '/admin/journal/trades/import', { payload: { trades } })

    it('adds new trades across several months with one write per month', async () => {
      const res = await importCall([
        imported('oa-zerodha-0001', { date: '2026-08-14' }),
        imported('oa-zerodha-0002', { date: '2026-08-15' }),
        imported('oa-zerodha-0003', { date: '2026-09-01' }),
      ])
      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ added: 3, skipped: 0, invalid: 0 })

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.trades.map((t) => t.id)).toEqual(['oa-zerodha-0001', 'oa-zerodha-0002', 'oa-zerodha-0003'])
      expect(body.trades[0].source).toBe('options-analytics:zerodha')
      expect(body.months).toEqual(['2026-08', '2026-09'])
    })

    it('is idempotent: importing the same trades again adds nothing', async () => {
      const batch = [imported('oa-zerodha-0001'), imported('oa-zerodha-0002')]
      await importCall(batch)
      const again = await importCall(batch)
      expect(again.body).toMatchObject({ added: 0, skipped: 2 })

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.trades).toHaveLength(2)
    })

    it('never overwrites a trade the user has since edited', async () => {
      await importCall([imported('oa-zerodha-0001', { grossPnl: 1500 })])
      const { body: stored } = await call('GET', '/admin/journal/data', { query: {} })
      await call('POST', '/admin/journal/trade', { payload: { trade: { ...stored.trades[0], strategy: 'Breakout', notes: 'Textbook.' } } })

      await importCall([imported('oa-zerodha-0001', { grossPnl: 1500 }), imported('oa-zerodha-0002')])

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.trades).toHaveLength(2)
      expect(body.trades.find((t) => t.id === 'oa-zerodha-0001')).toMatchObject({ strategy: 'Breakout', notes: 'Textbook.' })
    })

    it('counts trades without a usable id or valid fields as invalid rather than guessing an id', async () => {
      const res = await importCall([trade(), imported('oa-zerodha-0001', { direction: 'X' }), imported('oa-zerodha-0002'), null, 'junk'])
      expect(res.body).toMatchObject({ added: 1, invalid: 4 })
    })

    it('rejects a non-list and an oversized request', async () => {
      expect((await call('POST', '/admin/journal/trades/import', { payload: { trades: 'all' } })).statusCode).toBe(400)
      const many = Array.from({ length: 2001 }, (_, i) => imported(`oa-zerodha-${String(i).padStart(5, '0')}`))
      expect((await importCall(many)).statusCode).toBe(413)
    })
  })
})
