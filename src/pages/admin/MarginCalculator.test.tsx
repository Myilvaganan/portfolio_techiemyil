import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarginCalculator } from './MarginCalculator'
import { fetchLivePrices, fetchUsdInr } from '@/lib/livePrices'

vi.mock('@/lib/livePrices', () => ({ fetchLivePrices: vi.fn(), fetchUsdInr: vi.fn() }))

describe('MarginCalculator', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(fetchLivePrices).mockResolvedValue({})
    vi.mocked(fetchUsdInr).mockResolvedValue(null)
  })

  it('shows the default gold margin: 0.10 lot at 4378 with 1:1000', async () => {
    render(<MarginCalculator />)

    expect(screen.getByText('$43.78')).toBeInTheDocument()
    expect(screen.getByText('at 1:1000 leverage')).toBeInTheDocument()
    await screen.findByText(/manual mode/i)
  })

  it('recomputes margin when the lot size changes', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.click(screen.getByRole('button', { name: '1.00' }))

    expect(screen.getByText('$437.80')).toBeInTheDocument()
  })

  it('uses a live price when one arrives and labels it live', async () => {
    vi.mocked(fetchLivePrices).mockResolvedValue({ XAUUSD: 5000 })
    render(<MarginCalculator />)

    // 0.1 lot × 100 oz × 5000 ÷ 1000
    expect(await screen.findByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText(/1\/3 live/)).toBeInTheDocument()
  })

  it('computes TP profit, SL loss and risk:reward for a BUY', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.type(screen.getByPlaceholderText('your TP'), '4388')
    await user.type(screen.getByPlaceholderText('your SL'), '4373')

    expect(screen.getByText('+$100.00')).toBeInTheDocument()
    expect(screen.getByText('-$50.00')).toBeInTheDocument()
    expect(screen.getByText('1 : 2.00')).toBeInTheDocument()
  })

  it('flips profit direction for a SELL', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.click(screen.getByRole('button', { name: /sell/i }))
    await user.type(screen.getByPlaceholderText('your TP'), '4368')

    expect(screen.getByText('+$100.00')).toBeInTheDocument()
  })

  it('switches instrument and clears the previous TP/SL', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.type(screen.getByPlaceholderText('your TP'), '4388')
    await user.click(screen.getByRole('button', { name: /BITCOIN/ }))

    // 0.1 lot × 1 BTC × 63000 ÷ 1000
    expect(screen.getByText('$6.30')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your TP')).toHaveValue(null)
  })

  describe('INR equivalents', () => {
    it('shows the live USD→INR rate and converts margin with it', async () => {
      vi.mocked(fetchUsdInr).mockResolvedValue(100)
      render(<MarginCalculator />)

      expect(await screen.findByText('1 USD = ₹100.00')).toBeInTheDocument()
      // margin $43.78 × 100
      expect(screen.getByText('≈ ₹4,378.00')).toBeInTheDocument()
    })

    it('falls back to an estimated rate and says so when the fetch fails', async () => {
      render(<MarginCalculator />)

      expect(await screen.findByText(/\(est\)/)).toBeInTheDocument()
      expect(screen.getByText(/1 USD = ₹96\.00/)).toBeInTheDocument()
    })

    it('keeps the sign on a stop-loss loss', async () => {
      vi.mocked(fetchUsdInr).mockResolvedValue(100)
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByPlaceholderText('your SL'), '4373')

      // SL loss $50.00 × 100
      expect(screen.getByText('≈ -₹5,000.00')).toBeInTheDocument()
    })
  })

  describe('after-tax profit', () => {
    it('shows the profit after 30% tax on a winning target', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByPlaceholderText('your TP'), '4388')

      // $100.00 profit − 30% tax = $70.00
      expect(screen.getByText(/After tax: \+\$70\.00/)).toBeInTheDocument()
    })

    it('shows no after-tax line when there is no profit', () => {
      render(<MarginCalculator />)

      expect(screen.queryByText(/After tax/)).not.toBeInTheDocument()
    })
  })

  describe('remembered inputs', () => {
    it('restores the previous session after a reload', async () => {
      const user = userEvent.setup()
      const first = render(<MarginCalculator />)

      await user.click(screen.getByRole('button', { name: '1.00' }))
      await user.click(screen.getByRole('button', { name: /sell/i }))
      await user.type(screen.getByPlaceholderText('your TP'), '4368')
      first.unmount()

      render(<MarginCalculator />)

      // 1.00 lot on gold → $437.80 margin, SELL target 4368 → +$1,000.00
      expect(screen.getByText('$437.80')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('your TP')).toHaveValue(4368)
      expect(screen.getByRole('textbox', { name: 'Lot size' })).toHaveValue('1.00')
    })

    it('restores the selected instrument', async () => {
      const user = userEvent.setup()
      const first = render(<MarginCalculator />)

      await user.click(screen.getByRole('button', { name: /BITCOIN/ }))
      first.unmount()

      render(<MarginCalculator />)

      // 0.1 lot × 1 BTC × 63000 ÷ 1000
      expect(screen.getByText('$6.30')).toBeInTheDocument()
    })

    it('ignores corrupt saved data', () => {
      localStorage.setItem('margin-calculator-inputs', '{not json')
      render(<MarginCalculator />)

      expect(screen.getByText('$43.78')).toBeInTheDocument()
    })
  })
})
