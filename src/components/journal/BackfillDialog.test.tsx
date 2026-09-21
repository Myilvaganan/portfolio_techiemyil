import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BackfillDialog } from './BackfillDialog'
import { blankTrade, type Trade } from '@/lib/journal'
import { summarise } from '@/lib/journalBackfill'
import { fetchJournal, importTrades } from '@/lib/journalStore'
import { loadBackfillPlan } from '@/lib/journalBackfill'
import { setHidden } from '@/lib/privacy'

vi.mock('@/lib/journalStore', () => ({ fetchJournal: vi.fn(), importTrades: vi.fn() }))
vi.mock('@/lib/journalBackfill', async (orig) => ({ ...(await orig<typeof import('@/lib/journalBackfill')>()), loadBackfillPlan: vi.fn() }))

function imported(id: string, date: string, grossPnl: number, broker = 'zerodha'): Trade {
  return { ...blankTrade(date), id, instrument: 'Options', grossPnl, fees: 40, source: `options-analytics:${broker}` }
}

const zerodha = summarise('zerodha', [imported('oa-zerodha-1', '2026-08-10', 1000), imported('oa-zerodha-2', '2026-09-08', -400)])
const dhan = summarise('dhan', [imported('oa-dhan-1', '2026-09-12', 250, 'dhan')])

function setup(props: Partial<Parameters<typeof BackfillDialog>[0]> = {}) {
  const onImported = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <MemoryRouter>
      <BackfillDialog open onOpenChange={onOpenChange} asOf="2026-09-21" onImported={onImported} {...props} />
    </MemoryRouter>,
  )
  return { onImported, onOpenChange, user: userEvent.setup() }
}

describe('BackfillDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    setHidden(false)
    vi.mocked(loadBackfillPlan).mockResolvedValue([zerodha])
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [], days: {}, months: [] })
    vi.mocked(importTrades).mockImplementation(async (t) => ({ added: t.length, skipped: 0, invalid: 0 }))
  })

  afterEach(() => vi.clearAllMocks())

  it('previews each broker: closed trades, date span, new vs already imported', async () => {
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [imported('oa-zerodha-1', '2026-08-10', 1000)], days: {}, months: ['2026-08'] })
    setup()

    expect(await screen.findByText('Zerodha')).toBeInTheDocument()
    expect(screen.getByText(/Aug 10, 2026 – Sep 8, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/2 closed trades/)).toBeInTheDocument()
    expect(screen.getByText(/1 new/)).toBeInTheDocument()
    expect(screen.getByText(/1 already in journal/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import 1 trade' })).toBeEnabled()
  })

  it('imports only the trades that are not in the journal yet, then reports the result', async () => {
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [imported('oa-zerodha-1', '2026-08-10', 1000)], days: {}, months: ['2026-08'] })
    const { user, onImported } = setup()

    await user.click(await screen.findByRole('button', { name: 'Import 1 trade' }))

    await waitFor(() => expect(importTrades).toHaveBeenCalledTimes(1))
    expect(vi.mocked(importTrades).mock.calls[0][0].map((t) => t.id)).toEqual(['oa-zerodha-2'])
    expect(await screen.findByText('Added 1 trade to your journal')).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledWith({ added: 1, skipped: 0, invalid: 0, latestDate: '2026-09-08' })
  })

  it('mentions trades the server skipped as already present', async () => {
    vi.mocked(importTrades).mockResolvedValue({ added: 1, skipped: 1, invalid: 0 })
    const { user } = setup()

    await user.click(await screen.findByRole('button', { name: 'Import 2 trades' }))

    expect(await screen.findByText(/1 trade were already there/)).toBeInTheDocument()
  })

  it('has nothing to import when every trade is already in the journal', async () => {
    vi.mocked(fetchJournal).mockResolvedValue({ trades: zerodha.trades, days: {}, months: ['2026-08', '2026-09'] })
    setup()

    expect(await screen.findByRole('button', { name: 'Nothing to import' })).toBeDisabled()
    expect(screen.getByText(/already in your journal/i)).toBeInTheDocument()
  })

  it('lets you leave a broker out', async () => {
    vi.mocked(loadBackfillPlan).mockResolvedValue([zerodha, dhan])
    const { user } = setup()

    expect(await screen.findByRole('button', { name: 'Import 3 trades' })).toBeInTheDocument()
    await user.click(screen.getByLabelText('Import Zerodha trades'))
    await user.click(screen.getByRole('button', { name: 'Import 1 trade' }))

    await waitFor(() => expect(importTrades).toHaveBeenCalled())
    expect(vi.mocked(importTrades).mock.calls[0][0].map((t) => t.id)).toEqual(['oa-dhan-1'])
  })

  it('points to Options Analytics when there is nothing to import from', async () => {
    vi.mocked(loadBackfillPlan).mockResolvedValue([])
    setup()

    expect(await screen.findByText(/No closed options trades were found/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open options analytics/i })).toHaveAttribute('href', '/admin/options-analytics')
  })

  it('shows a retry when the trades cannot be read', async () => {
    const { user } = setup()
    await screen.findByText('Zerodha')
    vi.mocked(loadBackfillPlan).mockRejectedValueOnce(new Error('Could not reach the trade vault.'))
    // A fresh open re-reads everything.
    const again = render(
      <MemoryRouter>
        <BackfillDialog open onOpenChange={vi.fn()} asOf="2026-09-22" onImported={vi.fn()} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Could not reach the trade vault.')).toBeInTheDocument()

    await user.click(within(again.baseElement).getAllByRole('button', { name: /try again/i })[0])
    expect((await screen.findAllByText('Zerodha')).length).toBeGreaterThan(0)
  })

  it('keeps the import failure visible and changes nothing', async () => {
    vi.mocked(importTrades).mockRejectedValue(new Error('This month has too many trades to store.'))
    const { user, onImported } = setup()

    await user.click(await screen.findByRole('button', { name: 'Import 2 trades' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many trades/)
    expect(onImported).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Import 2 trades' })).toBeEnabled()
  })

  it('warns when earlier imports no longer match Options Analytics, listing the days to check', async () => {
    const stale = imported('oa-zerodha-OLD', '2026-09-05', 900)
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [imported('oa-zerodha-1', '2026-08-10', 1000), stale], days: {}, months: ['2026-08', '2026-09'] })
    setup()

    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(/1 trade imported earlier no longer match Options Analytics/)
    expect(note).toHaveTextContent(/Sep 5, 2026/)
  })

  it('shows no warning when every earlier import still matches', async () => {
    vi.mocked(fetchJournal).mockResolvedValue({ trades: [imported('oa-zerodha-1', '2026-08-10', 1000)], days: {}, months: ['2026-08'] })
    setup()

    await screen.findByText('Zerodha')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('stars out the P&L and fees in hidden mode', async () => {
    setHidden(true)
    setup()

    await screen.findByText('Zerodha')
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('₹****')
    expect(dialog.textContent).not.toMatch(/₹\s?[+-]?\d/)
    setHidden(false)
  })
})
