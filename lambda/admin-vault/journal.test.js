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

  it('dedupes and caps tags, and defaults them to an empty list', () => {
    expect(sanitizeTrade(trade()).tags).toEqual([])
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`)
    expect(sanitizeTrade(trade({ tags: ['gap-up', 'gap-up', '', ...many] })).tags).toHaveLength(12)
  })

  it('stores hold time as a non-negative whole number of minutes', () => {
    expect(sanitizeTrade(trade({ holdMinutes: 45.6 })).holdMinutes).toBe(46)
    expect(sanitizeTrade(trade({ holdMinutes: -5 })).holdMinutes).toBe(0)
    expect(sanitizeTrade(trade()).holdMinutes).toBe(0)
  })
})

describe('sanitizeDay / sanitizeSettings', () => {
  it('validates the day and drops unknown bias values', () => {
    expect(sanitizeDay({ date: 'nope' })).toBeNull()
    expect(sanitizeDay({ date: '2026-09-15', bias: 'Moonshot', plan: ' buy dips ' })).toMatchObject({ bias: '', plan: 'buy dips' })
  })

  it('applies defaults and bounds to settings', () => {
    expect(sanitizeSettings(undefined)).toEqual({ taxRate: 0, taxMode: 'per-trade', taxRules: [{ instrument: 'Bitcoin', rate: 30, mode: 'per-trade' }], startingCapital: 0, dailyLossLimit: 0, maxTradesPerDay: 0, maxConsecutiveLosses: 0 })
    expect(sanitizeSettings({ taxRate: 500, taxMode: 'weird', startingCapital: -5 })).toMatchObject({ taxRate: 0, taxMode: 'per-trade', startingCapital: 0 })
  })

  it('bounds the max-consecutive-losses risk rule', () => {
    expect(sanitizeSettings({ maxConsecutiveLosses: 3.7 }).maxConsecutiveLosses).toBe(4)
    expect(sanitizeSettings({ maxConsecutiveLosses: -1 }).maxConsecutiveLosses).toBe(0)
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

  describe('MT5 accounts: separate calendars per account', () => {
    it('keeps the account on a trade, stripping characters that could break a storage key', async () => {
      expect(sanitizeTrade(trade({ account: '62280161' })).account).toBe('62280161')
      expect(sanitizeTrade(trade({ account: '622 80#161/../x' })).account).toBe('62280161..x')
      expect(sanitizeTrade(trade()).account).toBe('')
    })

    it('stores day notes per account, so the same date can carry a note in each book', async () => {
      await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-22', plan: 'Options plan' } } })
      await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-22', account: '62280161', plan: 'Forex plan' } } })

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.days['2026-09-22']).toMatchObject({ plan: 'Options plan', account: '' })
      expect(body.days['2026-09-22#62280161']).toMatchObject({ plan: 'Forex plan', account: '62280161' })
    })

    it('clearing one book’s note leaves the other book’s note alone', async () => {
      await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-22', plan: 'Options plan' } } })
      await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-22', account: '62280161', plan: 'Forex plan' } } })

      await call('POST', '/admin/journal/day', { payload: { day: { date: '2026-09-22', account: '62280161' } } })

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.days['2026-09-22#62280161']).toBeUndefined()
      expect(body.days['2026-09-22']).toMatchObject({ plan: 'Options plan' })
    })

    it('imports MT5 trades with their account, without touching the main journal’s trades', async () => {
      await call('POST', '/admin/journal/trade', { payload: { trade: trade({ id: 'opt-trade-1' }) } })
      const res = await call('POST', '/admin/journal/trades/import', {
        payload: { trades: [trade({ id: 'mt5-62280161-2155367444', account: '62280161', source: 'mt5:62280161', instrument: 'Bitcoin', currency: 'USD', fxRate: 1 })] },
      })
      expect(res.body).toMatchObject({ added: 1 })

      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.trades.map((t) => [t.id, t.account])).toEqual([
        ['mt5-62280161-2155367444', '62280161'],
        ['opt-trade-1', ''],
      ].sort((a, b) => a[0].localeCompare(b[0])))
    })
  })

  describe('MT5 account details', () => {
    const account = (over = {}) => ({
      account: '62280161',
      name: 'Test Trader',
      currency: 'USD',
      server: 'OctaFX-Real',
      accountType: 'real',
      marginMode: 'Hedge',
      company: 'Octa Markets Incorporated',
      balance: 141.57,
      equity: 141.57,
      floating: 0,
      credit: 0,
      margin: 0,
      freeMargin: 141.57,
      marginLevel: 0,
      balanceOps: [{ time: '2026-09-21 19:34:40', type: 'balance', amount: 150.44, comment: 'D/D39066315/INR15000', balance: 150.44 }],
      summary: { 'Total Net Profit': '-179.75', 'Profit Factor': '0.57' },
      report: { time: '2026-09-26 08:12:00', from: '2026-09-22', to: '2026-09-25', trades: 45 },
      ...over,
    })
    const save = (a, html) => call('POST', '/admin/journal/accounts', { payload: { account: a, html } })

    it('saves and lists an account with all its details', async () => {
      const res = await save(account())
      expect(res.statusCode).toBe(200)

      const { body } = await call('GET', '/admin/journal/accounts')
      expect(body.accounts).toHaveLength(1)
      expect(body.accounts[0]).toMatchObject({
        account: '62280161',
        name: 'Test Trader',
        currency: 'USD',
        server: 'OctaFX-Real',
        marginMode: 'Hedge',
        company: 'Octa Markets Incorporated',
        balance: 141.57,
        equity: 141.57,
        summary: { 'Total Net Profit': '-179.75' },
        report: { time: '2026-09-26 08:12:00', from: '2026-09-22', to: '2026-09-25', trades: 45 },
      })
    })

    it('lists nothing before any upload', async () => {
      expect((await call('GET', '/admin/journal/accounts')).body.accounts).toEqual([])
    })

    it('keeps the original report file alongside the account', async () => {
      const res = await save(account(), '<html>the report</html>')
      expect(res.body.savedReport).toBe(true)
      expect(s3.objects.get('_data/journal/mt5-reports/62280161/20260926081200.html')).toBe('<html>the report</html>')
    })

    it('does not treat the stored report files as journal months', async () => {
      await save(account(), '<html>x</html>')
      const { body } = await call('GET', '/admin/journal/data', { query: {} })
      expect(body.months).toEqual([])
    })

    it('merges deposits from a later report instead of replacing them', async () => {
      await save(account())
      await save(
        account({
          balanceOps: [
            { time: '2026-09-21 19:34:40', type: 'balance', amount: 150.44, comment: 'D/D39066315/INR15000', balance: 150.44 },
            { time: '2026-09-23 12:19:51', type: 'balance', amount: 150.82, comment: 'D/D39076390/INR15000', balance: 197.77 },
          ],
          report: { time: '2026-09-30 09:00:00', from: '2026-09-26', to: '2026-09-29', trades: 5 },
        }),
      )

      const [acc] = (await call('GET', '/admin/journal/accounts')).body.accounts
      expect(acc.balanceOps.map((o) => o.amount)).toEqual([150.44, 150.82])
    })

    it('takes the balance and summary from the newest report', async () => {
      await save(account())
      await save(account({ balance: 300, equity: 310, summary: { 'Total Net Profit': '12.00' }, report: { time: '2026-10-01 09:00:00', from: '2026-09-29', to: '2026-10-01', trades: 3 } }))

      const [acc] = (await call('GET', '/admin/journal/accounts')).body.accounts
      expect(acc).toMatchObject({ balance: 300, equity: 310, summary: { 'Total Net Profit': '12.00' } })
    })

    it('does not let an older report overwrite a newer one’s balance, but still merges its deposits', async () => {
      await save(account({ balance: 300, report: { time: '2026-10-01 09:00:00', from: '2026-09-29', to: '2026-10-01', trades: 3 } }))
      await save(
        account({
          balance: 50,
          balanceOps: [{ time: '2026-08-01 10:00:00', type: 'balance', amount: 100, comment: 'first deposit', balance: 100 }],
          report: { time: '2026-08-05 09:00:00', from: '2026-08-01', to: '2026-08-05', trades: 2 },
        }),
      )

      const [acc] = (await call('GET', '/admin/journal/accounts')).body.accounts
      expect(acc.balance).toBe(300)
      expect(acc.report.time).toBe('2026-10-01 09:00:00')
      expect(acc.balanceOps.some((o) => o.comment === 'first deposit')).toBe(true)
    })

    it('keeps several accounts separate', async () => {
      await save(account())
      await save(account({ account: '70000001', name: 'Second' }))
      const { body } = await call('GET', '/admin/journal/accounts')
      expect(body.accounts.map((a) => a.account)).toEqual(['62280161', '70000001'])
    })

    it('stores a missing figure as null, never as zero', async () => {
      await save(account({ equity: null, freeMargin: undefined, marginLevel: 'n/a' }))
      const [acc] = (await call('GET', '/admin/journal/accounts')).body.accounts
      expect(acc.equity).toBeNull()
      expect(acc.freeMargin).toBeNull()
      expect(acc.marginLevel).toBeNull()
    })

    it('drops malformed deposits and clips oversized text', async () => {
      await save(account({ name: 'x'.repeat(500), balanceOps: [{ time: 'yesterday', type: 'balance', amount: 5 }, null, { time: '2026-09-21 19:34:40', type: 'balance', amount: 'abc', comment: 'ok' }] }))
      const [acc] = (await call('GET', '/admin/journal/accounts')).body.accounts
      expect(acc.name).toHaveLength(80)
      expect(acc.balanceOps).toEqual([{ time: '2026-09-21 19:34:40', type: 'balance', amount: 0, comment: 'ok', balance: null }])
    })

    it('rejects a request with no account number', async () => {
      expect((await save({ ...account(), account: '' })).statusCode).toBe(400)
      expect((await save(null)).statusCode).toBe(400)
    })

    it('rejects an oversized report file without saving anything', async () => {
      const res = await save(account(), 'x'.repeat(3_000_001))
      expect(res.statusCode).toBe(413)
      expect((await call('GET', '/admin/journal/accounts')).body.accounts).toEqual([])
    })
  })
})

