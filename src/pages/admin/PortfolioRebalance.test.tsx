import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortfolioRebalance } from './PortfolioRebalance'

describe('PortfolioRebalance', () => {
  it('shows the snapshot total and commodity exposure', () => {
    render(<PortfolioRebalance />)
    expect(screen.getAllByText('₹1,04,277').length).toBeGreaterThan(0)
    expect(screen.getByText('51.7%')).toBeInTheDocument()
  })

  it('flags targets that do not add up to 100%', async () => {
    const user = userEvent.setup()
    render(<PortfolioRebalance />)
    const input = screen.getByLabelText('Gold ETF target percent')
    await user.clear(input)
    await user.type(input, '20')
    expect(screen.getByText(/must equal 100%/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reset to default/i }))
    expect(screen.queryByText(/must equal 100%/)).not.toBeInTheDocument()
  })
})
