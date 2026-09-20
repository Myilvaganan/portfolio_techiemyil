import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OptionsAnalytics } from './OptionsAnalytics'

const CSV = [
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auto_square,quantity,price,trade_id,order_id,order_execution_time',
  'NIFTY2592324500CE,,2025-09-22,NSE,FO,,buy,false,75,100,1,11,2025-09-22T09:31:10',
  'NIFTY2592324500CE,,2025-09-22,NSE,FO,,sell,false,75,140,2,12,2025-09-22T10:05:00',
  'NIFTY2592324600PE,,2025-09-22,NSE,FO,,sell,false,75,80,3,13,2025-09-22T11:00:00',
  'NIFTY2592324600PE,,2025-09-22,NSE,FO,,buy,false,75,100,4,14,2025-09-22T11:20:00',
].join('\n')

// jsdom's File has no text(); browsers do.
const csvFile = (content: string, name: string) => Object.assign(new File([content], name, { type: 'text/csv' }), { text: async () => content })

describe('OptionsAnalytics', () => {
  beforeEach(() => localStorage.clear())

  it('asks for a tradebook when there is no data', () => {
    render(<OptionsAnalytics />)
    expect(screen.getByRole('heading', { name: /import your options trade history/i })).toBeInTheDocument()
  })

  it('previews sample data with KPIs, breakdowns and a trade log', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await user.click(screen.getByRole('button', { name: /preview with sample data/i }))
    expect(screen.getByText(/showing sample trades/i)).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
    expect(screen.getByText('By weekday')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^orders/i }))
    expect(screen.getAllByText(/BUY|SELL/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /exit preview/i }))
    expect(screen.getByRole('heading', { name: /import your options trade history/i })).toBeInTheDocument()
  })

  it('imports a Console CSV and shows the P&L', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    const file = csvFile(CSV, 'tradebook.csv')
    await user.upload(screen.getByLabelText('Upload tradebook CSV'), file)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/added 4 option trades/i))
    expect(screen.getByText('2 closed trades')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(localStorage.getItem('options_fills_v1')).toBeTruthy()
  })

  it('rejects a file that is not a tradebook', async () => {
    const user = userEvent.setup()
    render(<OptionsAnalytics />)
    await user.upload(screen.getByLabelText('Upload tradebook CSV'), csvFile('a,b\n1,2', 'x.csv'))
    expect(await screen.findByRole('status')).toHaveTextContent(/doesn’t look like a Zerodha Console tradebook/i)
  })
})
