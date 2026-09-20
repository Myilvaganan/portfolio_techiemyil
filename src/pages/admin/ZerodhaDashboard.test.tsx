import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ZerodhaDashboard } from './ZerodhaDashboard'
import * as kite from '@/lib/kite'
import { demoSnapshot } from '@/lib/kiteDemo'

vi.mock('@/lib/kite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/kite')>()),
  createKiteSession: vi.fn(),
  fetchKiteSnapshot: vi.fn(),
  getKiteLoginUrl: vi.fn(),
  endKiteSession: vi.fn(),
}))

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ZerodhaDashboard />
    </MemoryRouter>,
  )
}

describe('ZerodhaDashboard', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('shows the connect screen when there is no session', () => {
    renderAt('/admin/zerodha')
    expect(screen.getByRole('button', { name: /connect zerodha/i })).toBeInTheDocument()
  })

  it('previews sample data and can exit', async () => {
    const user = userEvent.setup()
    renderAt('/admin/zerodha')
    await user.click(screen.getByRole('button', { name: /preview with sample data/i }))
    expect(screen.getByText(/showing sample data/i)).toBeInTheDocument()
    expect(screen.getAllByText('GOLDBEES').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /exit preview/i }))
    expect(screen.getByRole('button', { name: /connect zerodha/i })).toBeInTheDocument()
  })

  it('exchanges the request token from the Kite redirect and loads the portfolio', async () => {
    vi.mocked(kite.createKiteSession).mockResolvedValue({ accessToken: 'AT', userId: 'AB1', userName: 'Myil' })
    vi.mocked(kite.fetchKiteSnapshot).mockResolvedValue(demoSnapshot())
    renderAt('/admin/zerodha?status=success&request_token=RT123')

    await waitFor(() => expect(kite.createKiteSession).toHaveBeenCalledWith('RT123'))
    expect(await screen.findByText(/Sample Trader's portfolio/)).toBeInTheDocument()
    expect(kite.fetchKiteSnapshot).toHaveBeenCalledWith('AT')
  })

  it('shows an error when the Kite login fails', async () => {
    renderAt('/admin/zerodha?status=error')
    expect(await screen.findByRole('alert')).toHaveTextContent(/login was cancelled or failed/i)
    expect(kite.createKiteSession).not.toHaveBeenCalled()
  })

  it('returns to the connect screen when the Kite session has expired', async () => {
    kite.storeKiteSession({ accessToken: 'OLD', userId: 'AB1', userName: 'Myil' })
    vi.mocked(kite.fetchKiteSnapshot).mockRejectedValue(new kite.KiteTokenExpiredError('Your Zerodha session has expired. Please reconnect.'))
    renderAt('/admin/zerodha')
    expect(await screen.findByRole('button', { name: /connect zerodha/i })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i)
  })
})
