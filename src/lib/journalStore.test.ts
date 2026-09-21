import { afterEach, describe, expect, it, vi } from 'vitest'
import { blankTrade } from './journal'
import { deleteTrade, fetchJournal, fetchSettings, importTrades, saveDayNote, saveSettings, saveTrade } from './journalStore'

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({ ok, status, json: async () => body }))
  vi.stubGlobal('fetch', fn)
  return fn
}

const lastCall = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls[fn.mock.calls.length - 1] as unknown as [string, RequestInit]

describe('journalStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('requests a month range with the session token', async () => {
    localStorage.setItem('admin_vault_token', 'tok')
    localStorage.setItem('admin_vault_token_expires', String(Date.now() + 60_000))
    const fn = mockFetch({ trades: [], days: {}, months: [] })

    await fetchJournal('2026-09', '2026-09')

    const [url, init] = lastCall(fn)
    expect(url).toMatch(/\/admin\/journal\/data\?from=2026-09&to=2026-09$/)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('fills in fields that older saved trades do not have', async () => {
    const legacy = { ...blankTrade('2026-09-15'), id: 'legacy-1' } as Partial<ReturnType<typeof blankTrade>>
    delete legacy.source
    mockFetch({ trades: [legacy], days: {}, months: ['2026-09'] })

    const { trades } = await fetchJournal('2026-09', '2026-09')

    expect(trades[0].source).toBe('')
  })

  it('omits the query when no range is given', async () => {
    const fn = mockFetch({ trades: [], days: {}, months: [] })
    await fetchJournal()
    expect(lastCall(fn)[0]).toMatch(/\/admin\/journal\/data$/)
  })

  it('posts a trade with its previous date and returns the stored copy', async () => {
    const stored = { ...blankTrade('2026-09-15'), instrument: 'Options' }
    const fn = mockFetch({ trade: stored })

    const result = await saveTrade(stored, '2026-08-31')

    const [url, init] = lastCall(fn)
    expect(url).toMatch(/\/admin\/journal\/trade$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({ previousDate: '2026-08-31', trade: { instrument: 'Options' } })
    expect(result).toEqual(stored)
  })

  it('deletes by date and id', async () => {
    const fn = mockFetch({ ok: true })
    await deleteTrade({ id: 'abc 1', date: '2026-09-15' })
    const [url, init] = lastCall(fn)
    expect(url).toMatch(/trade\?date=2026-09-15&id=abc%201$/)
    expect(init.method).toBe('DELETE')
  })

  it('resolves null when a day note is cleared', async () => {
    mockFetch({ day: null })
    await expect(saveDayNote({ date: '2026-09-15', bias: '', plan: '', review: '', lessons: '', mood: 0, discipline: 0 })).resolves.toBeNull()
  })

  it('fills missing settings with defaults', async () => {
    mockFetch({ settings: { taxRate: 25 } })
    await expect(fetchSettings()).resolves.toMatchObject({ taxRate: 25, taxMode: 'per-trade' })
  })

  it('saves settings', async () => {
    mockFetch({ settings: { taxRate: 20, taxMode: 'net', startingCapital: 0, dailyLossLimit: 0, maxTradesPerDay: 0 } })
    await expect(saveSettings({ taxRate: 20, taxMode: 'net', startingCapital: 0, dailyLossLimit: 0, maxTradesPerDay: 0 })).resolves.toMatchObject({ taxMode: 'net' })
  })

  it('surfaces the server error message', async () => {
    mockFetch({ error: 'This month has too many trades to store.' }, false, 413)
    await expect(saveTrade(blankTrade('2026-09-15'))).rejects.toThrow('too many trades')
  })

  it('clears the stored token on 401', async () => {
    localStorage.setItem('admin_vault_token', 'tok')
    localStorage.setItem('admin_vault_token_expires', String(Date.now() + 60_000))
    mockFetch({ error: 'Not authenticated.' }, false, 401)
    await expect(fetchJournal()).rejects.toThrow()
    expect(localStorage.getItem('admin_vault_token')).toBeNull()
  })

  it('imports in chunks and adds up the results', async () => {
    const fn = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => {
        const n = JSON.parse(init.body as string).trades.length
        return { added: n - 1, skipped: 1, invalid: 0 }
      },
    }))
    vi.stubGlobal('fetch', fn)
    const trades = Array.from({ length: 1200 }, (_, i) => ({ ...blankTrade('2026-09-15'), id: `oa-zerodha-${i}` }))

    const result = await importTrades(trades)

    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn.mock.calls.map((c) => JSON.parse(c[1].body as string).trades.length)).toEqual([500, 500, 200])
    expect(fn.mock.calls[0][0]).toMatch(/\/admin\/journal\/trades\/import$/)
    expect(result).toEqual({ added: 1197, skipped: 3, invalid: 0 })
  })

  it('does nothing when there is nothing to import', async () => {
    const fn = mockFetch({})
    await expect(importTrades([])).resolves.toEqual({ added: 0, skipped: 0, invalid: 0 })
    expect(fn).not.toHaveBeenCalled()
  })
})
