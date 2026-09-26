import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { Txn } from '@/lib/statements'
import type { TaxReturn } from '@/lib/tax'
import { TaxInformation } from './TaxInformation'

const ret = (ay: string, over: Partial<TaxReturn> = {}): TaxReturn => ({
  ay,
  form: 'ITR-1',
  filedOn: `${ay}-07-20`,
  dueDate: `${ay}-07-31`,
  regime: 'new',
  source: 'x.json',
  income: { grossSalary: 1000000, exemptAllowances: 0, standardDeduction: 75000, salary: 925000, houseProperty: 0, business: 0, shortTermGains: 0, longTermGains: 0, otherSources: 0, grossTotal: 925000, deductions: 0, taxable: 925000 },
  allowances: [],
  deductions: [],
  tax: { beforeRebate: 50000, rebate87A: 0, surcharge: 0, cess: 2000, relief: 0, liability: 52000, interest234A: 0, interest234B: 1000, interest234C: 0, fee234F: 0, total: 53000 },
  paid: { tds: 40000, tcs: 0, advance: 0, selfAssessment: 13000, total: 53000 },
  refund: 0,
  payable: 0,
  employers: [],
  otherTds: [],
  challans: [{ date: `${ay}-07-20`, bsr: '0510002', serial: 4, amount: 13000 }],
  trading: null,
  lossCarriedForward: 0,
  foreignAssets: false,
  ...over,
})

vi.mock('@/lib/taxApi', () => ({
  fetchReturns: vi.fn(async () => [ret('2025'), ret('2027', { refund: 900 })]),
  saveReturns: vi.fn(),
  deleteReturn: vi.fn(),
  readReturnFiles: vi.fn(),
}))
vi.mock('@/lib/statementsApi', () => ({
  fetchStatements: vi.fn(async (kind: string) => ({
    statements: [],
    insights: null,
    transactions:
      kind === 'bank'
        ? ([{ id: 'b1', statementId: 's', accountKey: 'a', date: '2025-07-21', description: 'UPI/INCOME TAX DEPT/CHALLAN', merchant: 'ITD', debit: 13000, credit: 0, category: 'Taxes' }] as Txn[])
        : [],
  })),
}))

describe('TaxInformation', () => {
  it('lists every return with what it cost, and flags the year that is missing', async () => {
    render(
      <MemoryRouter>
        <TaxInformation />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'FY 2026-27' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'FY 2024-25' })).toBeInTheDocument()
    expect(screen.getByText(/No return uploaded for AY 2026-27/)).toBeInTheDocument()
    expect(screen.getAllByText('₹1,06,000').length).toBeGreaterThan(0)
  })

  it('opens a return and finds its challan in the bank statements', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TaxInformation />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: 'FY 2024-25' }))
    expect(await screen.findByText(/Found in bank on/)).toBeInTheDocument()
    expect(screen.getByText('Tax liability')).toBeInTheDocument()
  })

  it('shows the transactions considered for tax and why', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TaxInformation />
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('tab', { name: 'Transactions' }))
    expect(await screen.findByText('UPI/INCOME TAX DEPT/CHALLAN')).toBeInTheDocument()
    expect(screen.getByText('What counts for tax')).toBeInTheDocument()
  })
})
