import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreditCards } from './CreditCards'
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
const tx = (key: string, date: string, merchant: string, debit: number, credit: number, category: string, type: string): Txn => ({ id: `c${++n}`, statementId: 's', accountKey: key, date, description: merchant, merchant, debit, credit, category, type })
const st = (id: string, key: string, last4: string, name: string, limit: number, due: number): Statement =>
  ({ id, kind: 'card', filename: `${id}.pdf`, uploadedAt: '2026-09-01T00:00:00Z', pages: 1, fileKey: 'k', accountKey: key, txnCount: 2, duplicatesSkipped: 0, bank: 'icici', cardName: name, cardLast4: last4, periodFrom: '2026-08-01', periodTo: '2026-08-31', dueDate: '2026-12-01', totalDue: due, minDue: 500, creditLimit: limit, rewardPoints: 1000 }) as unknown as Statement

const data: StatementsData = {
  statements: [st('s1', 'icici:8842', '8842', 'Amazon Pay ICICI', 200000, 20000), st('s2', 'icici:1111', '1111', 'Coral', 100000, 5000)],
  transactions: [
    tx('icici:8842', '2026-08-05', 'Amazon', 1299, 0, 'Shopping', 'purchase'),
    tx('icici:8842', '2026-08-27', 'ICICI Bank', 412.3, 0, 'Fees & Interest', 'interest'),
    tx('icici:8842', '2026-08-20', 'ICICI Bank', 0, 12000, 'Card Payment', 'payment'),
    tx('icici:1111', '2026-08-06', 'PVR', 1150, 0, 'Entertainment', 'purchase'),
  ],
  insights: null,
}
const insights = { fingerprint: 'x', generatedAt: '2026-09-01T00:00:00Z', model: 'gpt-6-astra', headline: 'One card carries interest', summary: 's', score: { value: 70, label: 'Good' }, highlights: [], tips: [], risks: [] } as AiInsights

describe('CreditCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchStatements).mockResolvedValue(data)
    vi.mocked(api.generateInsights).mockImplementation(async (_kind, _context, fp) => ({ ...insights, fingerprint: fp }))
  })

  it('shows a tile per card with due dates and utilisation', async () => {
    render(<CreditCards />)
    expect(await screen.findByRole('button', { name: /Amazon Pay ICICI/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Coral/ })).toBeInTheDocument()
    expect(screen.getByText('Fees & interest')).toBeInTheDocument()
    expect(screen.getByText('Utilisation')).toBeInTheDocument()
    await waitFor(() => expect(api.generateInsights).toHaveBeenCalledWith('card', expect.any(Object), expect.any(String)))
    expect(await screen.findByText('One card carries interest')).toBeInTheDocument()
  })

  it('focuses the dashboard on one card and back', async () => {
    const user = userEvent.setup()
    render(<CreditCards />)
    const coral = await screen.findByRole('button', { name: /Coral/ })
    expect(screen.getByText('All 2 cards')).toBeInTheDocument()
    await user.click(coral)
    expect(coral).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText(/Coral ••1111/).length).toBeGreaterThan(0)
    expect(screen.queryByText('All 2 cards')).not.toBeInTheDocument()
    await user.click(coral)
    expect(screen.getByText('All 2 cards')).toBeInTheDocument()
  })

  it('shows the empty state with an uploader', async () => {
    vi.mocked(api.fetchStatements).mockResolvedValue({ statements: [], transactions: [], insights: null })
    render(<CreditCards />)
    expect(await screen.findByText(/add your card statements/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Upload statements')).toBeInTheDocument()
  })
})
