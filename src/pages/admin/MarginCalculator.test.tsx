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

  it('shows the default gold margin: 0.10 lot at 4300 with 1:1000', async () => {
    render(<MarginCalculator />)

    expect(screen.getByText('$43.00')).toBeInTheDocument()
    expect(screen.getByText('at 1:1000 leverage')).toBeInTheDocument()
    await screen.findByText(/manual mode/i)
  })

  it('recomputes margin when the lot size changes', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.click(screen.getByRole('button', { name: '1.00' }))

    expect(screen.getByText('$430.00')).toBeInTheDocument()
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

    await user.type(screen.getByPlaceholderText('your TP'), '4310')
    await user.type(screen.getByPlaceholderText('your SL'), '4295')

    expect(screen.getByText('+$100.00')).toBeInTheDocument()
    expect(screen.getByText('-$50.00')).toBeInTheDocument()
    expect(screen.getByText('1 : 2.00')).toBeInTheDocument()
  })

  it('flips profit direction for a SELL', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.click(screen.getByRole('button', { name: /sell/i }))
    await user.type(screen.getByPlaceholderText('your TP'), '4290')

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

  it('switches US30 to its own 1:500 leverage, matching real broker margins', async () => {
    const user = userEvent.setup()
    render(<MarginCalculator />)

    await user.click(screen.getByRole('button', { name: /US30/ }))

    expect(screen.getByRole('combobox', { name: /leverage/i })).toHaveValue('500')
    // 0.1 lot × 1 × 50,000 ÷ 500
    expect(screen.getByText('$10.00')).toBeInTheDocument()
  })

  describe('INR equivalents', () => {
    it('shows the live USD→INR rate and converts margin with it', async () => {
      vi.mocked(fetchUsdInr).mockResolvedValue(100)
      render(<MarginCalculator />)

      expect(await screen.findByText('1 USD = ₹100.00')).toBeInTheDocument()
      // margin $43.00 × 100
      expect(screen.getByText('≈ ₹4,300.00')).toBeInTheDocument()
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

      await user.type(screen.getByPlaceholderText('your SL'), '4295')

      // SL loss $50.00 × 100
      expect(screen.getByText('≈ -₹5,000.00')).toBeInTheDocument()
    })
  })

  describe('after-tax profit', () => {
    it('shows the profit after 30% tax on a winning target', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByPlaceholderText('your TP'), '4310')

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
      await user.type(screen.getByPlaceholderText('your TP'), '4290')
      first.unmount()

      render(<MarginCalculator />)

      // 1.00 lot on gold → $430.00 margin, SELL target 4290 (10 pts below the 4300 entry) → +$1,000.00
      expect(screen.getByText('$430.00')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('your TP')).toHaveValue(4290)
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

      expect(screen.getByText('$43.00')).toBeInTheDocument()
    })
  })

  describe('calibrating to a broker\'s real margin', () => {
    it('overrides the leverage dropdown and matches the entered margin exactly', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '5.00')

      expect(screen.getByText('$5.00')).toBeInTheDocument()
      // 0.1 × 100 oz × $4,300 ÷ $5.00 = 1:8,600
      expect(screen.getByText(/at ≈1:8,600 leverage \(your broker\)/)).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /leverage/i })).toBeDisabled()
    })

    it('scales the calibrated leverage to other lot sizes', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '5.00')
      await user.click(screen.getByRole('button', { name: '1.00' }))

      expect(screen.getByText('$50.00')).toBeInTheDocument()
    })

    it('clearing it hands control back to the leverage dropdown', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '5.00')
      await user.click(screen.getByRole('button', { name: /clear/i }))

      expect(screen.getByText('$43.00')).toBeInTheDocument()
      expect(screen.getByText('at 1:1000 leverage')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /leverage/i })).toBeEnabled()
    })

    it('is ignored while zero, negative or not a number — the dropdown still applies', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '0')

      expect(screen.getByText('$43.00')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /leverage/i })).toBeEnabled()
      expect(screen.getByText(/enter a positive number/i)).toBeInTheDocument()
    })

    it('is kept separately per instrument', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '5.00')
      await user.click(screen.getByRole('button', { name: /BITCOIN/ }))

      // Bitcoin has no calibration of its own, so it still uses the leverage dropdown.
      expect(screen.getByLabelText(/broker's margin for 0.1 lot/i)).toHaveValue(null)
      expect(screen.getByText('$6.30')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: /leverage/i })).toBeEnabled()

      await user.click(screen.getByRole('button', { name: /XAUUSD/ }))

      expect(screen.getByLabelText(/broker's margin for 0.1 lot/i)).toHaveValue(5)
      expect(screen.getByText('$5.00')).toBeInTheDocument()
    })

    it('survives a reload', async () => {
      const user = userEvent.setup()
      const first = render(<MarginCalculator />)

      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '5.00')
      first.unmount()

      render(<MarginCalculator />)

      expect(screen.getByLabelText(/broker's margin for 0.1 lot/i)).toHaveValue(5)
      expect(screen.getByText('$5.00')).toBeInTheDocument()
    })

    it('matches the exact figure from a real broker screenshot for US30', async () => {
      const user = userEvent.setup()
      render(<MarginCalculator />)

      await user.click(screen.getByRole('button', { name: /US30/ }))
      await user.type(screen.getByLabelText(/broker's margin for 0.1 lot/i), '10.31')

      expect(screen.getByText('$10.31')).toBeInTheDocument()
    })
  })
})
