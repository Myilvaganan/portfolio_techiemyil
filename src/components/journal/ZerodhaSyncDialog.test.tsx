import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ZerodhaSyncDialog } from './ZerodhaSyncDialog'
import { KiteTokenExpiredError } from '@/lib/kite'
import { NotConnectedError, syncZerodhaToJournal, type SyncResult } from '@/lib/kiteSync'
import { setHidden } from '@/lib/privacy'

vi.mock('@/lib/kiteSync', async (orig) => ({ ...(await orig<typeof import('@/lib/kiteSync')>()), syncZerodhaToJournal: vi.fn() }))

const RESULT: SyncResult = {
  userName: 'Myil',
  fetched: 6,
  newFills: 4,
  tradesAdded: 2,
  tradesSkipped: 0,
  latestDate: '2026-09-21',
  today: { date: '2026-09-21', closed: 3, wins: 2, losses: 1, gross: 1800, fees: 240, net: 1560, open: [] },
}

function setup() {
  const onSynced = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <MemoryRouter>
      <ZerodhaSyncDialog open onOpenChange={onOpenChange} asOf="2026-09-21" onSynced={onSynced} />
    </MemoryRouter>,
  )
  return { onSynced, onOpenChange, user: userEvent.setup() }
}

describe('ZerodhaSyncDialog', () => {
  beforeEach(() => {
    setHidden(false)
    vi.mocked(syncZerodhaToJournal).mockResolvedValue(RESULT)
  })
  afterEach(() => vi.clearAllMocks())

  it('starts syncing as soon as it opens and reports today’s options result', async () => {
    const { onSynced } = setup()

    expect(screen.getByRole('status')).toHaveTextContent(/fetching today’s trades from zerodha/i)
    expect(await screen.findByText('Fetched 6 option fills from Zerodha')).toBeInTheDocument()
    expect(syncZerodhaToJournal).toHaveBeenCalledWith('2026-09-21')
    expect(screen.getByText(/4 new · 2 closed trades added to your journal/)).toBeInTheDocument()

    expect(screen.getByText('2W · 1L')).toBeInTheDocument()
    expect(screen.getByText('+₹1,800')).toBeInTheDocument()
    expect(screen.getByText('+₹1,560')).toBeInTheDocument()
    expect(screen.getByText(/Today’s options report/)).toBeInTheDocument()
    expect(onSynced).toHaveBeenCalledWith(RESULT)
  })

  it('says the journal is already up to date when nothing new closed', async () => {
    vi.mocked(syncZerodhaToJournal).mockResolvedValue({ ...RESULT, newFills: 0, tradesAdded: 0, tradesSkipped: 1 })
    setup()

    expect(await screen.findByText(/your journal is already up to date · 1 already there/)).toBeInTheDocument()
  })

  it('explains an empty day', async () => {
    vi.mocked(syncZerodhaToJournal).mockResolvedValue({ ...RESULT, fetched: 0, newFills: 0, tradesAdded: 0, today: { ...RESULT.today, closed: 0, wins: 0, losses: 0, gross: 0, fees: 0, net: 0 } })
    setup()

    expect(await screen.findByText('No option trades from Zerodha today')).toBeInTheDocument()
    expect(screen.getByText(/only reports the current trading day/i)).toBeInTheDocument()
  })

  it('lists positions that are still open', async () => {
    vi.mocked(syncZerodhaToJournal).mockResolvedValue({ ...RESULT, today: { ...RESULT.today, open: [{ symbol: 'NIFTY2692925000CE', side: 'BUY', qty: 150 }] } })
    setup()

    expect(await screen.findByText(/Still open — added to the journal when closed/)).toBeInTheDocument()
    expect(screen.getByText(/NIFTY2692925000CE × 150/)).toBeInTheDocument()
  })

  it('asks to connect when there is no Zerodha session, linking to the Zerodha page', async () => {
    vi.mocked(syncZerodhaToJournal).mockRejectedValue(new NotConnectedError())
    setup()

    expect(await screen.findByText('Connect Zerodha first')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect Zerodha' })).toHaveAttribute('href', '/admin/zerodha')
  })

  it('says so when the Zerodha session has expired', async () => {
    vi.mocked(syncZerodhaToJournal).mockRejectedValue(new KiteTokenExpiredError('expired'))
    setup()

    expect(await screen.findByText('Your Zerodha session has expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect Zerodha' })).toBeInTheDocument()
  })

  it('shows other failures with a retry that runs the sync again', async () => {
    vi.mocked(syncZerodhaToJournal).mockRejectedValueOnce(new Error('Could not fetch today’s trades from Zerodha. Please try again shortly.'))
    const { user } = setup()

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not fetch today’s trades/i)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Fetched 6 option fills from Zerodha')).toBeInTheDocument()
    expect(syncZerodhaToJournal).toHaveBeenCalledTimes(2)
  })

  it('can sync again from the result', async () => {
    const { user } = setup()
    await screen.findByText('Fetched 6 option fills from Zerodha')

    await user.click(screen.getByRole('button', { name: /sync again/i }))

    await waitFor(() => expect(syncZerodhaToJournal).toHaveBeenCalledTimes(2))
  })

  it('stars out every amount in hidden mode', async () => {
    setHidden(true)
    setup()

    await screen.findByText('Fetched 6 option fills from Zerodha')
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('₹****')
    expect(dialog.textContent).not.toMatch(/₹\s?[+-]?\d/)
    setHidden(false)
  })
})
