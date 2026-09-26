import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ fetchInbox: vi.fn(), processInboxItem: vi.fn(), addInboxPassword: vi.fn(), removeInboxPassword: vi.fn(), skipInboxItem: vi.fn() }))
vi.mock('@/lib/statementsApi', () => api)

import { EmailInbox } from './EmailInbox'

const item = (over = {}) => ({ id: 'a1', filename: 'AcctStatement.pdf', subject: 'ICICI Bank Statement for August 2026', from: 'Estatement <estatement@icici.bank.in>', receivedAt: '2026-09-07T05:41:00Z', size: 1, guess: 'bank', status: 'new', ...over })

describe('EmailInbox', () => {
  it('lists the statements for this page and reads one on request', async () => {
    api.fetchInbox.mockResolvedValue({ configured: true, passwords: [{ id: 'p', label: 'ICICI' }], items: [item(), item({ id: 'c1', guess: 'card', subject: 'Card statement' })] })
    api.processInboxItem.mockResolvedValue({ kind: 'bank', label: 'Bank statement · 142 transactions' })
    const onProcessed = vi.fn()
    const user = userEvent.setup()
    localStorage.removeItem('inbox_auto')
    render(<EmailInbox kind="bank" onProcessed={onProcessed} />)
    expect(await screen.findByText(/1 bank statement arrived by email/)).toBeInTheDocument()
    expect(screen.queryByText('Card statement')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Read it/ }))
    expect(await screen.findByText(/142 transactions added/)).toBeInTheDocument()
    expect(onProcessed).toHaveBeenCalled()
  })

  it('shows a failed read with the reason and lets it be retried', async () => {
    api.fetchInbox.mockResolvedValue({ configured: true, passwords: [], items: [item({ status: 'failed', error: 'None of your saved passwords opened this PDF.' })] })
    render(<EmailInbox kind="bank" onProcessed={() => {}} />)
    expect(await screen.findByText(/None of your saved passwords/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument()
  })

  it('reads waiting statements by itself when automatic mode is on', async () => {
    api.processInboxItem.mockClear()
    localStorage.setItem('inbox_auto', '1')
    api.fetchInbox.mockResolvedValue({ configured: true, passwords: [], items: [item()] })
    api.processInboxItem.mockResolvedValue({ kind: 'bank', label: 'done' })
    render(<EmailInbox kind="bank" onProcessed={() => {}} />)
    await screen.findByText(/arrived by email/)
    await vi.waitFor(() => expect(api.processInboxItem).toHaveBeenCalledTimes(1))
    localStorage.removeItem('inbox_auto')
  })
})
