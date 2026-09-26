import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LendingEntry } from '@/lib/lending'

const api = vi.hoisted(() => ({ fetchLending: vi.fn(), saveLending: vi.fn(), deleteLending: vi.fn() }))
vi.mock('@/lib/lendingApi', () => api)

import { Lending } from './Lending'

const today = new Date().toISOString().slice(0, 10)
const ago = (months: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}
const entry = (over: Partial<LendingEntry> = {}): LendingEntry => ({
  id: 'e1abcd', name: 'Ravi', phone: '', amount: 650000, date: ago(14), dueDate: '', interestRatePct: 0, note: 'Bike loan share', repayments: [],
  passThrough: { loanAmount: 1500000, ratePct: 9.99, tenureMonths: 72, firstEmiDate: ago(13) }, createdAt: '', updatedAt: '', ...over,
})

describe('Lending', () => {
  it('shows what each person still owes and the totals', async () => {
    api.fetchLending.mockResolvedValue([entry(), entry({ id: 'e2abcd', name: 'Meena', amount: 20000, dueDate: ago(1), passThrough: null, note: '' })])
    render(<Lending />)
    expect(await screen.findByText('Ravi')).toBeInTheDocument()
    expect(screen.getByText('Meena')).toBeInTheDocument()
    expect(screen.getByText('₹6,70,000')).toBeInTheDocument()
    expect(screen.getByText(/days late/)).toBeInTheDocument()
  })

  it('records a payment on a person', async () => {
    const e = entry({ passThrough: null })
    api.fetchLending.mockResolvedValue([e])
    api.saveLending.mockImplementation(async (x: LendingEntry) => [{ ...x }])
    const user = userEvent.setup()
    render(<Lending />)
    await user.click(await screen.findByRole('button', { name: /Payment received/ }))
    await user.type(screen.getByLabelText('Payment amount'), '50000')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.saveLending).toHaveBeenCalledWith(expect.objectContaining({ repayments: [expect.objectContaining({ amount: 50000 })] }))
    expect((await screen.findAllByText('₹6,00,000')).length).toBeGreaterThan(0)
  })

  it('works out what they owe on the EMI split calculator from the saved loan', async () => {
    api.fetchLending.mockResolvedValue([entry({ repayments: [{ id: 'r1', date: ago(2), amount: 100000, note: '' }] })])
    const user = userEvent.setup()
    render(<Lending />)
    await user.click(await screen.findByRole('button', { name: /EMI split/ }))
    const card = (await screen.findByText('They owe you now')).closest('div')!.parentElement!
    expect(within(card).getByText(/months? behind|Up to date|Paid ahead/)).toBeInTheDocument()
    expect(screen.getByText('Their EMI a month')).toBeInTheDocument()
    expect(screen.getByText(/of ₹27,\d{3}/)).toBeInTheDocument()
    expect(screen.getByLabelText('They paid so far (₹)')).toHaveValue('100000')
  })

  it('adds a new person from the dialog', async () => {
    api.fetchLending.mockResolvedValue([])
    api.saveLending.mockResolvedValue([entry({ name: 'Suresh', passThrough: null })])
    const user = userEvent.setup()
    render(<Lending />)
    await user.click(await screen.findByRole('button', { name: /Add the first one/ }))
    await user.type(screen.getByLabelText('Name'), 'Suresh')
    await user.type(screen.getByLabelText('Amount lent (₹)'), '25000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.saveLending).toHaveBeenCalledWith(expect.objectContaining({ name: 'Suresh', amount: 25000, passThrough: null }))
    expect(today).toBeTruthy()
  })
})
