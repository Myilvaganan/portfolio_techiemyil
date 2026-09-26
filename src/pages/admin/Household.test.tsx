import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Txn } from '@/lib/statements'
import { lastMonths } from '@/lib/household'
import { Household } from './Household'

const month = new Date().toISOString().slice(0, 7)
const prev = lastMonths(month, 2)[0]
const txn = (date: string, description: string, merchant: string, debit: number, category = 'Other') =>
  ({ id: date + description, statementId: 's', accountKey: 'a', date, description, merchant, debit, credit: 0, category }) as Txn

vi.mock('@/lib/statementsApi', () => ({
  fetchStatements: vi.fn(async (kind: string) => ({
    statements: [],
    insights: null,
    transactions:
      kind === 'bank'
        ? [
            txn(`${prev}-05`, 'UPI/Appu Samy/XXXX8921@IDIB', 'Appu Samy', 10000, 'Transfer'),
            txn(`${month}-05`, 'UPI/C VISHALAK/jagannatht863@/Home Rent', 'C VISHALAK', 15750, 'Rent'),
            txn(`${month}-06`, 'UPI/Zomato/order', 'Zomato', 450, 'Food & Dining'),
            txn(`${month}-07`, 'BIL/XXXX1168/ICICI BANK CREDIT CA', 'ICICI', 20000, 'Bills & Utilities'),
          ]
        : [txn(`${month}-08`, 'RAPIDO BANGALORE', 'Rapido', 120, 'Transport')],
  })),
}))

describe('Household', () => {
  it('shows each household card from the statements and leaves card bill payments out', async () => {
    render(
      <MemoryRouter>
        <Household />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: /Salem house rent/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bengaluru house rent/ })).toBeInTheDocument()
    expect(screen.getAllByText('₹16,320').length).toBeGreaterThan(0)
    expect(screen.queryByText('₹36,320')).not.toBeInTheDocument()
  })

  it('opens a card to list its transactions and filters by section', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Household />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: /Food delivery/ }))
    expect(screen.getByText('UPI/Zomato/order')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Bike' }))
    expect(screen.queryByRole('button', { name: /Salem house rent/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bike petrol/ })).toBeInTheDocument()
  })
})
