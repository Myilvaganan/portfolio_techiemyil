import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BankStatements } from './BankStatements'
import * as api from '@/lib/statementsApi'
import type { AiInsights, Statement, StatementsData, Txn } from '@/lib/statements'

vi.mock('@/lib/statementsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/statementsApi')>()),
  fetchStatements: vi.fn(),
  generateInsights: vi.fn(),
  askAi: vi.fn(),
  deleteStatement: vi.fn(),
  statementFileUrl: vi.fn(),
  processStatementFile: vi.fn(),
}))

let n = 0
const tx = (date: string, merchant: string, debit: number, credit: number, category: string, balance: number): Txn => ({
  id: `t${++n}`,
  statementId: 's1',
  accountKey: 'icici:9012',
  date,
  description: merchant,
  merchant,
  debit,
  credit,
  category,
  balance,
  channel: 'UPI',
})

const statement = { id: 's1', kind: 'bank', filename: 'jun.pdf', uploadedAt: '2026-07-01T00:00:00Z', pages: 2, fileKey: 'k', accountKey: 'icici:9012', txnCount: 6, duplicatesSkipped: 0, bank: 'icici', accountLast4: '9012', periodFrom: '2026-06-01', periodTo: '2026-06-30' } as unknown as Statement

const data: StatementsData = {
  statements: [statement],
  transactions: [
    tx('2026-06-01', 'Acme (salary)', 0, 100000, 'Salary', 100000),
    tx('2026-06-03', 'Netflix', 649, 0, 'Subscriptions', 99351),
    tx('2026-06-10', 'Swiggy', 500, 0, 'Food & Dining', 98851),
    tx('2026-07-01', 'Acme (salary)', 0, 100000, 'Salary', 198851),
    tx('2026-07-03', 'Netflix', 649, 0, 'Subscriptions', 198202),
    tx('2026-07-12', 'Swiggy', 700, 0, 'Food & Dining', 197502),
  ],
  insights: null,
}

const insights: AiInsights = {
  fingerprint: 'x',
  generatedAt: '2026-07-20T00:00:00Z',
  model: 'gpt-6-astra',
  headline: 'Steady saver with lean subscriptions',
  summary: 'You save most of your income.',
  score: { value: 82, label: 'Healthy saver' },
  highlights: [{ title: 'Great savings rate', detail: 'Over 90% of income kept.', tone: 'good' }],
  tips: [{ title: 'Keep going', detail: 'Automate a SIP.' }],
  risks: [],
}

describe('BankStatements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchStatements).mockResolvedValue(data)
    vi.mocked(api.generateInsights).mockImplementation(async (_kind, _context, fp) => ({ ...insights, fingerprint: fp }))
    vi.mocked(api.askAi).mockResolvedValue('You spent ₹1,200 on food.')
  })

  it('shows the uploader and an empty state when nothing is saved', async () => {
    vi.mocked(api.fetchStatements).mockResolvedValue({ statements: [], transactions: [], insights: null })
    render(<BankStatements />)
    expect(await screen.findByText(/your dashboard appears here/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Upload statements')).toHaveAttribute('multiple')
    expect(screen.getByPlaceholderText(/type once/i)).toBeInTheDocument()
  })

  it('renders KPIs, charts, transactions and generates AI insights once for new data', async () => {
    render(<BankStatements />)
    expect(await screen.findByText('Net cash flow')).toBeInTheDocument()
    expect(screen.getByText('Money in vs out')).toBeInTheDocument()
    expect(screen.getByText('Recurring charges')).toBeInTheDocument()
    expect(screen.getAllByText('Netflix').length).toBeGreaterThan(0)
    await waitFor(() => expect(api.generateInsights).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.generateInsights).mock.calls[0][0]).toBe('bank')
    expect(await screen.findByText('Steady saver with lean subscriptions')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /health score 82/i })).toBeInTheDocument()
  })

  it('reuses saved insights instead of calling the AI again', async () => {
    const { fingerprint } = await import('@/lib/statements')
    vi.mocked(api.fetchStatements).mockResolvedValue({ ...data, insights: { ...insights, fingerprint: fingerprint(data.transactions) } })
    render(<BankStatements />)
    expect(await screen.findByText('Steady saver with lean subscriptions')).toBeInTheDocument()
    expect(api.generateInsights).not.toHaveBeenCalled()
  })

  it('paginates and filters the transaction table', async () => {
    const many: StatementsData = { ...data, insights: null, transactions: Array.from({ length: 60 }, (_, i) => tx(`2026-06-${String((i % 28) + 1).padStart(2, '0')}`, i % 2 ? 'Swiggy' : 'Zomato', 100 + i, 0, 'Food & Dining', 1000 - i)) }
    vi.mocked(api.fetchStatements).mockResolvedValue(many)
    const user = userEvent.setup()
    render(<BankStatements />)
    const nav = await screen.findByRole('navigation', { name: 'Pagination' })
    expect(within(nav).getByText(/1–25 of 60/)).toBeInTheDocument()
    await user.click(within(nav).getByRole('button', { name: 'Next page' }))
    expect(within(nav).getByText(/26–50 of 60/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search transactions'), 'zomato')
    expect(within(screen.getByRole('navigation', { name: 'Pagination' })).getByText(/1–25 of 30/)).toBeInTheDocument()
  })

  it('answers a question from the AI', async () => {
    const user = userEvent.setup()
    render(<BankStatements />)
    await user.type(await screen.findByLabelText(/ask a question/i), 'How much on food?{enter}')
    await waitFor(() => expect(api.askAi).toHaveBeenCalledWith('bank', 'How much on food?', expect.any(Object)))
    expect(await screen.findByText(/you spent/i, {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('offers reports and lets you delete a statement', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.deleteStatement).mockResolvedValue()
    const user = userEvent.setup()
    render(<BankStatements />)
    await user.click(await screen.findByRole('button', { name: /reports/i }))
    expect(screen.getByRole('menuitem', { name: /download report/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /export data/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /delete jun.pdf/i }))
    await waitFor(() => expect(api.deleteStatement).toHaveBeenCalledWith('bank', 's1'))
  })
})
