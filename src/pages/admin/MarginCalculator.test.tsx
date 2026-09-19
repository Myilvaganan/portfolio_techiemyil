import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MarginCalculator } from './MarginCalculator'
import { fetchLivePrices } from '@/lib/livePrices'

vi.mock('@/lib/livePrices', () => ({ fetchLivePrices: vi.fn() }))

describe('MarginCalculator', () => {
  beforeEach(() => {
    vi.mocked(fetchLivePrices).mockResolvedValue({})
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
})
