import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Loans } from './Loans'
import * as api from '@/lib/statementsApi'
import { allLoanDocs } from '@/test/loanDocs'
import { loanFingerprint, type LoanData } from '@/lib/loans'
import type { AiInsights } from '@/lib/statements'

vi.mock('@/lib/statementsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/statementsApi')>()),
  fetchLoanDocs: vi.fn(),
  generateInsights: vi.fn(),
  askAi: vi.fn(),
  deleteStatement: vi.fn(),
  statementFileUrl: vi.fn(),
  processStatementFile: vi.fn(),
}))

const insights: AiInsights = { fingerprint: 'x', generatedAt: '2026-09-20T00:00:00Z', model: 'gpt-5.4-mini', headline: 'Two loans, one bounce, plenty of room to prepay', summary: 's', score: { value: 72, label: 'Good' }, highlights: [], tips: [], risks: [] }

// Rendering the 72-row schedule is slow on a busy machine.
vi.setConfig({ testTimeout: 20000 })

describe('Loans', () => {
  let data: LoanData
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    data = { statements: allLoanDocs(), insights: null }
    vi.mocked(api.fetchLoanDocs).mockImplementation(async () => data)
    // The real server stores the fingerprint it is given (previously it cut it to 64 characters).
    vi.mocked(api.generateInsights).mockImplementation(async (_k, _c, fp) => ({ ...insights, fingerprint: fp }))
  })

  it('asks for loan documents when there are none', async () => {
    vi.mocked(api.fetchLoanDocs).mockResolvedValue({ statements: [], insights: null })
    render(<Loans />)
    expect(await screen.findByText(/add your loan documents/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Upload statements')).toHaveAttribute('multiple')
  })

  it('shows portfolio KPIs and a details card per loan', async () => {
    render(<Loans />)
    expect((await screen.findAllByText('Outstanding')).length).toBeGreaterThan(0)
    expect(screen.getByText('Interest still to pay')).toBeInTheDocument()
    expect(screen.getByText('Debt-free in')).toBeInTheDocument()
    expect(screen.getAllByText('Personal Loan ••0001').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Personal Loan ••0002').length).toBeGreaterThan(0)
    expect(screen.getByText('11 of 72 EMIs paid')).toBeInTheDocument()
    expect(screen.getByText('4 of 72 EMIs paid')).toBeInTheDocument()
    expect(screen.getByText('1 bounced EMI')).toBeInTheDocument()
  })

  it('marks paid EMIs green, highlights the next due, and filters', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await screen.findByText(/EMI schedule/)
    // The table opens on the page that holds the next EMI (instalment 12).
    expect(screen.getByRole('row', { name: 'Instalment 12 Next due' })).toBeInTheDocument()
    expect(screen.getAllByRole('row', { name: /Instalment \d+ Paid/ }).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /^Paid 11$/ }))
    const paidRows = screen.getAllByRole('row', { name: /Instalment \d+ Paid/ })
    expect(paidRows).toHaveLength(11)
    expect(screen.queryByRole('row', { name: /Upcoming/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Upcoming 61$/ }))
    expect(screen.queryByRole('row', { name: /Instalment \d+ Paid/ })).not.toBeInTheDocument()
  })

  it('paginates the schedule', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await screen.findByText(/EMI schedule/)
    await user.click(screen.getByRole('button', { name: /^All 72$/ }))
    const nav = screen.getAllByRole('navigation', { name: 'Pagination' })[0]
    expect(within(nav).getByText(/of 72/)).toBeInTheDocument()
  })

  it('switches to the second loan', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await screen.findByText(/EMI schedule/)
    await user.click(screen.getByRole('button', { name: 'Personal Loan ••0002' }))
    expect(await screen.findByText(/EMI schedule — Personal Loan ••0002/)).toBeInTheDocument()
    expect(screen.getByText(/4 paid/)).toBeInTheDocument()
  })

  it('runs the calculators', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await screen.findByText('Prepayment & closure calculators')
    expect(screen.getByText('Net saving after fee')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close it now' }))
    expect(await screen.findByText('Pay to close today')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Extra every month' }))
    expect(await screen.findByText('Time saved')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Debt-free by a date' }))
    expect(await screen.findByText(/Option A — pay a little extra every month/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Which loan first?' }))
    expect(await screen.findByText('BEST')).toBeInTheDocument()
    expect(screen.getByText('Highest rate first')).toBeInTheDocument()
  })

  it('updates results when the pre-closure fee assumption changes', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await screen.findByText('Prepayment & closure calculators')
    const fee = screen.getByLabelText('Pre-closure fee (%)')
    await user.clear(fee)
    await user.type(fee, '0')
    expect(localStorage.getItem('loan_fee_v1')).toContain('"feePct":0')
    expect(screen.getByText(/pre-closure fee ₹0/)).toBeInTheDocument()
  })

  it('generates loan insights once, then reuses saved ones', async () => {
    const first = render(<Loans />)
    // Loading the full schedule and then generating insights spans multiple renders.
    expect(await screen.findByText(/Two loans, one bounce/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(api.generateInsights).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.generateInsights).mock.calls[0][0]).toBe('loan')
    first.unmount()
    vi.mocked(api.generateInsights).mockClear()
    data = { ...data, insights: { ...insights, fingerprint: loanFingerprint(data.statements) } }
    render(<Loans />)
    // Loading the full schedule and then generating insights spans multiple renders.
    expect(await screen.findByText(/Two loans, one bounce/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(api.generateInsights).not.toHaveBeenCalled()
  })

  it('lists the advice playbook and documents, and deletes one', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.deleteStatement).mockResolvedValue()
    const user = userEvent.setup()
    render(<Loans />)
    expect(await screen.findByText(/How to close your loans early/)).toBeInTheDocument()
    expect(screen.getByText(/Check the pre-closure charge/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /delete LnAmortSchedule1.pdf/i }))
    await waitFor(() => expect(api.deleteStatement).toHaveBeenCalledWith('loan', expect.any(String)))
  })

  it('offers report downloads', async () => {
    const user = userEvent.setup()
    render(<Loans />)
    await user.click(await screen.findByRole('button', { name: /reports/i }))
    expect(screen.getByRole('menuitem', { name: /download report/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export data/i })).toBeInTheDocument()
  })
})
