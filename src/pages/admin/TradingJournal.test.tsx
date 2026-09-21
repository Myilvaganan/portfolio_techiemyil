import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TradingJournal } from './TradingJournal'
import { DEFAULT_SETTINGS, blankTrade, type Trade } from '@/lib/journal'
import { setHidden } from '@/lib/privacy'
import { deleteTrade, fetchJournal, fetchSettings, importTrades, saveDayNote, saveSettings, saveTrade } from '@/lib/journalStore'
import { loadBackfillPlan, summarise } from '@/lib/journalBackfill'
import { MemoryRouter } from 'react-router-dom'
import { fetchUsdInr } from '@/lib/livePrices'

vi.mock('@/lib/journalStore', () => ({
  fetchJournal: vi.fn(),
  fetchSettings: vi.fn(),
  saveTrade: vi.fn(),
  deleteTrade: vi.fn(),
  saveDayNote: vi.fn(),
  saveSettings: vi.fn(),
  importTrades: vi.fn(),
}))
vi.mock('@/lib/journalBackfill', async (orig) => ({ ...(await orig<typeof import('@/lib/journalBackfill')>()), loadBackfillPlan: vi.fn() }))
vi.mock('@/lib/livePrices', () => ({ fetchUsdInr: vi.fn() }))

const TODAY = '2026-09-15'

function stored(over: Partial<Trade>): Trade {
  return { ...blankTrade(TODAY), createdAt: '2026-09-15T05:00:00Z', updatedAt: '2026-09-15T05:00:00Z', ...over }
}

// Options: +1,500 − 40 fees = ₹1,460. Bitcoin: $10 × ₹90 = ₹900. Day = ₹2,360; 30% tax on both winners = ₹708.
const OPTIONS = stored({ id: 'opt-1', instrument: 'Options', symbol: 'NIFTY 25000 CE', grossPnl: 1500, fees: 40, strategy: 'Breakout' })
const BITCOIN = stored({ id: 'btc-1', instrument: 'Bitcoin', currency: 'USD', fxRate: 90, grossPnl: 10, time: '21:30' })

// jsdom has no layout: say whether the screen counts as a large display (the side panel) or a phone (pop-up).
function mockViewport(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function load(trades: Trade[]) {
  vi.mocked(fetchJournal).mockResolvedValue({ trades, days: {}, months: ['2026-09'] })
}

describe('TradingJournal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0))
    localStorage.clear()
    setHidden(false)
    mockViewport(true)
    // Flat 30% on everything: the fixtures below were worked out that way, and one test covers the real defaults.
    vi.mocked(fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, taxRate: 30, taxRules: [] })
    vi.mocked(fetchUsdInr).mockResolvedValue(96)
    vi.mocked(saveTrade).mockImplementation(async (t) => ({ ...t, createdAt: '2026-09-15T06:00:00Z' }))
    vi.mocked(deleteTrade).mockResolvedValue()
    vi.mocked(saveDayNote).mockImplementation(async (d) => d)
    vi.mocked(loadBackfillPlan).mockResolvedValue([])
    vi.mocked(importTrades).mockImplementation(async (t) => ({ added: t.length, skipped: 0, invalid: 0 }))
    load([OPTIONS, BITCOIN])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('shows the month with each day’s result and totals before and after tax', async () => {
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)

    expect(await screen.findByRole('button', { name: /Tuesday, Sep 15, 2026: 2 trades, net \+₹2,360/ })).toBeInTheDocument()
    expect(fetchJournal).toHaveBeenCalledWith('2026-09', '2026-09')

    // Summary strip: before tax, 30% tax, after tax.
    expect(screen.getAllByText('+₹2,360').length).toBeGreaterThan(0)
    expect(screen.getAllByText('-₹708').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+₹1,652').length).toBeGreaterThan(0)
  })

  it('lists the selected day’s trades, with USD trades converted', async () => {
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)

    expect(await screen.findByText('NIFTY 25000 CE')).toBeInTheDocument()
    expect(screen.getByText('Bitcoin')).toBeInTheDocument()
    expect(screen.getByText('+₹900')).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument()
  })

  it('logs a new trade: P&L from prices, live net preview, then saves it', async () => {
    const user = userEvent.setup()
    load([])
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText(/No trades logged/)

    await user.click(screen.getAllByRole('button', { name: /^add trade$/i })[0])
    const dialog = await screen.findByRole('dialog', { name: /add trade/i })

    await user.type(within(dialog).getByLabelText(/^Instrument/), 'Options')
    await user.type(within(dialog).getByLabelText('Entry'), '100')
    await user.type(within(dialog).getByLabelText('Exit'), '120')
    await user.type(within(dialog).getByLabelText(/^Quantity/), '75')
    await user.type(within(dialog).getByLabelText(/^Fees/), '40')

    // (120 − 100) × 75 = 1,500 gross → 1,460 net → 1,022 after 30% tax.
    expect(within(dialog).getByText('+₹1,460')).toBeInTheDocument()
    expect(within(dialog).getByText('+₹1,022')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /^add trade$/i }))

    await waitFor(() => expect(saveTrade).toHaveBeenCalledTimes(1))
    const [sent, previousDate] = vi.mocked(saveTrade).mock.calls[0]
    expect(sent).toMatchObject({ date: TODAY, instrument: 'Options', direction: 'BUY', grossPnl: 1500, fees: 40, qty: 75, entry: 100, exit: 120, currency: 'INR' })
    expect(previousDate).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await screen.findAllByText('+₹1,460')).length).toBeGreaterThan(0)
  })

  it('applies the preset when a known instrument is typed (Bitcoin trades in USD)', async () => {
    const user = userEvent.setup()
    load([])
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText(/No trades logged/)

    await user.click(screen.getAllByRole('button', { name: /^add trade$/i })[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Instrument/), 'Bitcoin')

    expect(within(dialog).getByLabelText(/^1 USD/)).toHaveValue(96)
  })

  it('asks for a P&L before saving when prices are missing', async () => {
    const user = userEvent.setup()
    load([])
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText(/No trades logged/)

    await user.click(screen.getAllByRole('button', { name: /^add trade$/i })[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Instrument/), 'Options')
    await user.click(within(dialog).getByRole('button', { name: /^add trade$/i }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent(/entry, exit and quantity/i)
    expect(saveTrade).not.toHaveBeenCalled()
  })

  it('accepts a typed P&L with no prices', async () => {
    const user = userEvent.setup()
    load([])
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText(/No trades logged/)

    await user.click(screen.getAllByRole('button', { name: /^add trade$/i })[0])
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Instrument/), 'Options')
    await user.click(within(dialog).getByLabelText(/type the p&l myself/i))
    await user.type(within(dialog).getByLabelText('Gross P&L'), '-800')
    await user.click(within(dialog).getByRole('button', { name: /^add trade$/i }))

    await waitFor(() => expect(saveTrade).toHaveBeenCalled())
    expect(vi.mocked(saveTrade).mock.calls[0][0]).toMatchObject({ grossPnl: -800, manualPnl: true, entry: null })
  })

  it('deletes a trade after confirmation', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')

    await user.click(screen.getAllByRole('button', { name: /delete trade/i })[0])
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))

    await waitFor(() => expect(deleteTrade).toHaveBeenCalledWith(expect.objectContaining({ id: 'opt-1', date: TODAY })))
    await waitFor(() => expect(screen.queryByText('NIFTY 25000 CE')).not.toBeInTheDocument())
  })

  it('hidden mode replaces every amount with stars and can be turned back off', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')
    expect(document.body.textContent).toContain('2,360')

    await user.click(screen.getByRole('button', { name: /hide numbers/i }))

    expect(document.body.textContent).not.toMatch(/₹\s?[+-]?\d/)
    expect(document.body.textContent).not.toContain('2,360')
    expect(document.body.textContent).not.toContain('1,460')
    expect(document.body.textContent).toContain('₹****')
    expect(screen.getByRole('button', { name: /Tuesday, Sep 15, 2026: 2 trades, net \+₹\*\*\*\*/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show numbers/i }))
    expect(document.body.textContent).toContain('2,360')
  })

  it('remembers hidden mode between visits', async () => {
    const user = userEvent.setup()
    const first = render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')
    await user.click(screen.getByRole('button', { name: /hide numbers/i }))
    first.unmount()

    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')
    expect(screen.getByRole('button', { name: /show numbers/i })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('2,360')
  })

  it('moves between months and loads each one', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')

    await user.click(screen.getByRole('button', { name: /previous month/i }))

    await waitFor(() => expect(fetchJournal).toHaveBeenCalledWith('2026-08', '2026-08'))
    expect(await screen.findByText('August 2026')).toBeInTheDocument()
  })

  it('shows the overall dashboard: before tax, tax and after tax', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)
    await screen.findByText('NIFTY 25000 CE')

    await user.click(screen.getByRole('tab', { name: /dashboard/i }))

    expect(await screen.findByText('Net P&L · before tax')).toBeInTheDocument()
    expect(fetchJournal).toHaveBeenLastCalledWith(undefined, undefined)
    expect(screen.getByText('Net P&L · after tax')).toBeInTheDocument()
    expect(screen.getAllByText('+₹1,652').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /reports/i })).toBeInTheDocument()
  })

  it('shows a retry when the journal cannot be loaded', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchJournal).mockRejectedValueOnce(new Error('Could not reach the trading journal. Please try again.'))
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)

    expect(await screen.findByText(/could not reach the trading journal/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('NIFTY 25000 CE')).toBeInTheDocument()
  })

  describe('default tax (Bitcoin only)', () => {
    it('taxes just the Bitcoin trade and leaves options untaxed', async () => {
      vi.mocked(fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS })
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      // Options ₹1,460 untaxed + Bitcoin ₹900 × 30% = ₹270 tax → ₹2,360 − ₹270 = ₹2,090 after tax.
      await waitFor(() => expect(screen.getAllByText('-₹270').length).toBeGreaterThan(0))
      expect(screen.getAllByText('+₹2,090').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Tax · by instrument').length).toBeGreaterThan(0)
      expect(screen.queryByText('-₹708')).not.toBeInTheDocument()
    })

    it('shows no tax at all for a day with only options trades', async () => {
      vi.mocked(fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS })
      load([OPTIONS])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await waitFor(() => expect(screen.getAllByText('+₹1,460').length).toBeGreaterThan(1))
      expect(screen.queryByText(/^-₹\d/)).not.toBeInTheDocument()
    })
  })

  describe('different tax per instrument', () => {
    it('applies each instrument’s own rate and labels the tax as by-instrument', async () => {
      vi.mocked(fetchSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, taxRate: 30, taxRules: [{ instrument: 'Bitcoin', rate: 20, mode: 'per-trade' }] })
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      // Options ₹1,460 @ 30% = 438; Bitcoin ₹900 @ 20% = 180 → tax 618, after tax 1,742.
      await waitFor(() => expect(screen.getAllByText('-₹618').length).toBeGreaterThan(0))
      expect(screen.getAllByText('+₹1,742').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Tax · by instrument').length).toBeGreaterThan(0)
    })

    it('adds a rule for an instrument in the settings dialog and saves it', async () => {
      const user = userEvent.setup()
      vi.mocked(saveSettings).mockImplementation(async (s) => s)
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await user.click(screen.getByRole('button', { name: /journal settings/i }))
      const dialog = await screen.findByRole('dialog', { name: /journal settings/i })

      await user.click(within(dialog).getByRole('button', { name: 'Bitcoin' }))
      const rate = within(dialog).getByLabelText('Tax rate for Bitcoin')
      await user.clear(rate)
      await user.type(rate, '20')
      await user.click(within(dialog).getByRole('button', { name: /save settings/i }))

      await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1))
      expect(vi.mocked(saveSettings).mock.calls[0][0]).toMatchObject({ taxRate: 30, taxRules: [{ instrument: 'Bitcoin', rate: 20, mode: 'per-trade' }] })
      await waitFor(() => expect(screen.getAllByText('-₹618').length).toBeGreaterThan(0))
    })

    it('rejects a rule with no rate and the same instrument twice', async () => {
      const user = userEvent.setup()
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await user.click(screen.getByRole('button', { name: /journal settings/i }))
      const dialog = await screen.findByRole('dialog', { name: /journal settings/i })

      await user.click(within(dialog).getByRole('button', { name: 'Bitcoin' }))
      await user.clear(within(dialog).getByLabelText('Tax rate for Bitcoin'))
      await user.click(within(dialog).getByRole('button', { name: /save settings/i }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/tax rate between 0 and 100 for Bitcoin/i)

      await user.type(within(dialog).getByLabelText('Tax rate for Bitcoin'), '20')
      await user.click(within(dialog).getByRole('button', { name: /other instrument/i }))
      await user.type(within(dialog).getByLabelText('Instrument 2'), 'bitcoin')
      await user.click(within(dialog).getByRole('button', { name: /save settings/i }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/bitcoin has more than one tax rule/i)
      expect(saveSettings).not.toHaveBeenCalled()
    })
  })

  describe('adding and viewing trades from a date', () => {
    it('adds a trade for a date by clicking its “+”, prefilled with that date', async () => {
      const user = userEvent.setup()
      load([])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText(/No trades logged/)

      await user.click(screen.getByRole('button', { name: 'Add trade on Wednesday, Sep 9, 2026' }))
      const dialog = await screen.findByRole('dialog', { name: /add trade/i })
      expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-09-09')

      await user.type(within(dialog).getByLabelText(/^Instrument/), 'Options')
      await user.click(within(dialog).getByLabelText(/type the p&l myself/i))
      await user.type(within(dialog).getByLabelText('Gross P&L'), '500')
      await user.click(within(dialog).getByRole('button', { name: /^add trade$/i }))

      await waitFor(() => expect(saveTrade).toHaveBeenCalledTimes(1))
      expect(vi.mocked(saveTrade).mock.calls[0][0]).toMatchObject({ date: '2026-09-09', grossPnl: 500 })
      // The panel follows the date the trade was added on.
      expect(await screen.findByRole('heading', { name: 'Wednesday, Sep 9, 2026' })).toBeInTheDocument()
    })

    it('adds a trade for a date by double-clicking it', async () => {
      const user = userEvent.setup()
      load([])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText(/No trades logged/)

      const date = screen.getByRole('button', { name: /Thursday, Sep 10, 2026: no trades/ })
      await user.dblClick(date)

      const dialog = await screen.findByRole('dialog', { name: /add trade/i })
      expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-09-10')
    })

    it('does not offer to add on days outside the month', async () => {
      load([])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText(/No trades logged/)

      // Sep 2026 starts on a Tuesday, so Monday Aug 31 is only padding in the grid.
      expect(screen.queryByRole('button', { name: /Add trade on Monday, Aug 31, 2026/ })).not.toBeInTheDocument()
    })

    it('on a large screen a clicked date shows its trades in the side panel, no pop-up', async () => {
      const user = userEvent.setup()
      load([OPTIONS, BITCOIN, stored({ id: 'old-1', date: '2026-09-09', instrument: 'XAUUSD', grossPnl: 320 })])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await user.click(screen.getByRole('button', { name: /Wednesday, Sep 9, 2026: 1 trade/ }))

      expect(await screen.findByText('XAUUSD')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('on a phone a tapped date opens a pop-up with that day’s trades and an add button', async () => {
      const user = userEvent.setup()
      mockViewport(false)
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      // Nothing inline on a phone until a date is tapped.
      const date = await screen.findByRole('button', { name: /Tuesday, Sep 15, 2026: 2 trades/ })
      expect(screen.queryByText('NIFTY 25000 CE')).not.toBeInTheDocument()

      await user.click(date)

      const sheet = await screen.findByRole('dialog', { name: /Tuesday, Sep 15, 2026/ })
      expect(within(sheet).getByText('NIFTY 25000 CE')).toBeInTheDocument()
      expect(within(sheet).getByText('+₹900')).toBeInTheDocument()

      await user.click(within(sheet).getByRole('button', { name: /^add trade$/i }))
      const form = await screen.findByRole('dialog', { name: /add trade/i })
      expect(within(form).getByLabelText('Date')).toHaveValue('2026-09-15')
    })

    it('closes the phone pop-up', async () => {
      const user = userEvent.setup()
      mockViewport(false)
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await user.click(await screen.findByRole('button', { name: /Tuesday, Sep 15, 2026: 2 trades/ }))
      await screen.findByRole('dialog', { name: /Tuesday, Sep 15, 2026/ })

      await user.click(screen.getByRole('button', { name: /close day details/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
  })

  describe('backfill from Options Analytics', () => {
    const july = stored({ id: 'oa-zerodha-abc123', date: '2026-08-10', instrument: 'Options', grossPnl: 1200, source: 'options-analytics:zerodha' })

    it('opens the import dialog from the header', async () => {
      const user = userEvent.setup()
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await user.click(screen.getByRole('button', { name: /import from options/i }))

      expect(await screen.findByRole('dialog', { name: /import from options analytics/i })).toBeInTheDocument()
      expect(await screen.findByText(/No closed options trades were found/)).toBeInTheDocument()
    })

    it('imports, then jumps to the month of the newest imported trade', async () => {
      const user = userEvent.setup()
      vi.mocked(loadBackfillPlan).mockResolvedValue([summarise('zerodha', [july])])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')

      await user.click(screen.getByRole('button', { name: /import from options/i }))
      await user.click(await screen.findByRole('button', { name: 'Import 1 trade' }))

      await waitFor(() => expect(importTrades).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('Added 1 trade to your journal')).toBeInTheDocument()
      await waitFor(() => expect(fetchJournal).toHaveBeenCalledWith('2026-08', '2026-08'))
      expect(await screen.findByText('August 2026')).toBeInTheDocument()
    })

    it('marks imported trades so they are easy to tell apart', async () => {
      load([july])
      const user = userEvent.setup()
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByRole('button', { name: /Monday, Aug 10, 2026: 1 trade/ }).catch(() => undefined)

      await user.click(await screen.findByRole('button', { name: /previous month/i }))
      await user.click(await screen.findByRole('button', { name: /Monday, Aug 10, 2026: 1 trade/ }))

      expect(await screen.findByText('imported')).toBeInTheDocument()
    })
  })

  it('still renders trades that were saved before the source field existed', async () => {
    const legacy = { ...OPTIONS } as Partial<Trade>
    delete legacy.source
    // Even if such a trade reaches the UI without being normalised, the page must not crash.
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [legacy as Trade], days: {}, months: ['2026-09'] })
    render(<MemoryRouter><TradingJournal /></MemoryRouter>)

    expect(await screen.findByText('NIFTY 25000 CE')).toBeInTheDocument()
    expect(screen.queryByText('imported')).not.toBeInTheDocument()
  })

  describe('new options trades badge', () => {
    const oa = (id: string, date: string, pnl: number) => stored({ id, date, instrument: 'Options', grossPnl: pnl, source: 'options-analytics:zerodha' })
    const planTrades = () => [oa('oa-zerodha-aaa111', '2026-08-10', 1200), oa('oa-zerodha-bbb222', '2026-08-11', -300)]
    const importButton = () => screen.getByRole('button', { name: /import from options/i })

    it('says how many Options Analytics trades are not in the journal yet', async () => {
      vi.mocked(loadBackfillPlan).mockResolvedValue([summarise('zerodha', planTrades())])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)

      expect(await screen.findByLabelText('2 new trades')).toBeInTheDocument()
      expect(importButton()).toHaveTextContent('2 new')
    })

    it('shows no badge when everything is already in the journal', async () => {
      const trades = planTrades()
      vi.mocked(loadBackfillPlan).mockResolvedValue([summarise('zerodha', trades)])
      load([OPTIONS, ...trades])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')
      await waitFor(() => expect(loadBackfillPlan).toHaveBeenCalled())

      expect(importButton()).not.toHaveTextContent('new')
    })

    it('clears the badge once the trades have been imported', async () => {
      const user = userEvent.setup()
      const journal: Trade[] = [OPTIONS]
      vi.mocked(fetchJournal).mockImplementation(async () => ({ trades: [...journal], days: {}, months: ['2026-08', '2026-09'] }))
      vi.mocked(importTrades).mockImplementation(async (t) => {
        journal.push(...t)
        return { added: t.length, skipped: 0, invalid: 0 }
      })
      vi.mocked(loadBackfillPlan).mockResolvedValue([summarise('zerodha', planTrades())])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      expect(await screen.findByLabelText('2 new trades')).toBeInTheDocument()

      await user.click(importButton())
      await user.click(await screen.findByRole('button', { name: 'Import 2 trades' }))
      await user.click(await screen.findByRole('button', { name: 'Done' }))

      await waitFor(() => expect(screen.queryByLabelText('2 new trades')).not.toBeInTheDocument())
    })

    it('marks the button when earlier imports no longer match Options Analytics', async () => {
      const trades = planTrades()
      vi.mocked(loadBackfillPlan).mockResolvedValue([summarise('zerodha', trades)])
      load([...trades, oa('oa-zerodha-STALE9', '2026-08-09', 400)])
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)

      expect(await screen.findByLabelText('Some earlier imports need checking')).toBeInTheDocument()
    })

    it('stays quiet if Options Analytics cannot be read — the button still opens the dialog', async () => {
      const user = userEvent.setup()
      vi.mocked(loadBackfillPlan).mockRejectedValue(new Error('vault unreachable'))
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)
      await screen.findByText('NIFTY 25000 CE')
      await waitFor(() => expect(loadBackfillPlan).toHaveBeenCalled())

      expect(importButton()).not.toHaveTextContent('new')
      await user.click(importButton())
      expect(await screen.findByRole('dialog', { name: /import from options analytics/i })).toBeInTheDocument()
    })

    it('waits for the month to load before doing the heavier check', async () => {
      let release: (v: { trades: Trade[]; days: Record<string, never>; months: string[] }) => void = () => {}
      vi.mocked(fetchJournal).mockImplementationOnce(() => new Promise((res) => (release = res)))
      render(<MemoryRouter><TradingJournal /></MemoryRouter>)

      await new Promise((r) => setTimeout(r, 30))
      expect(loadBackfillPlan).not.toHaveBeenCalled()

      release({ trades: [OPTIONS], days: {}, months: ['2026-09'] })
      await waitFor(() => expect(loadBackfillPlan).toHaveBeenCalled())
    })
  })
})

