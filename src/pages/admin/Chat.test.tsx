import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ askVault: vi.fn(), fetchCoverage: vi.fn() }))
vi.mock('@/lib/chatApi', () => api)

import { Chat } from './Chat'

describe('Chat', () => {
  beforeEach(() => {
    sessionStorage.clear()
    api.askVault.mockReset()
    api.fetchCoverage.mockResolvedValue([{ source: 'Bank statements', detail: '8146 transactions, 2018-08-01 to 2026-09-20' }])
  })

  it('shows what data it can see and answers a suggested question with its sources', async () => {
    api.askVault.mockResolvedValue({ answer: 'You spent ₹10,450 last month.\n\n- Rent ₹10,000\n- Food ₹450', sources: ['Bank statements'], followUps: ['And the month before?'], inScope: true, queries: [] })
    const user = userEvent.setup()
    render(<Chat />)
    expect(await screen.findByText('8146 transactions, 2018-08-01 to 2026-09-20')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /How much did I spend last month/ }))
    expect(await screen.findByText('You spent ₹10,450 last month.')).toBeInTheDocument()
    expect(screen.getByText('Rent ₹10,000')).toBeInTheDocument()
    expect(screen.getAllByText('Bank statements').length).toBe(2)
    expect(api.askVault).toHaveBeenCalledWith([{ role: 'user', content: 'How much did I spend last month, and on what?' }])
  })

  it('sends the earlier turns with a follow-up and lets you type your own question', async () => {
    api.askVault.mockResolvedValueOnce({ answer: 'First answer', sources: [], followUps: ['Tell me more'], inScope: true, queries: [] })
    api.askVault.mockResolvedValueOnce({ answer: 'Second answer', sources: [], followUps: [], inScope: true, queries: [] })
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByLabelText('Your question'), 'my balance?{Enter}')
    await screen.findByText('First answer')
    await user.click(screen.getByRole('button', { name: 'Tell me more' }))
    await screen.findByText('Second answer')
    expect(api.askVault).toHaveBeenLastCalledWith([
      { role: 'user', content: 'my balance?' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Tell me more' },
    ])
  })

  it('shows an error in the chat and lets the person ask again', async () => {
    api.askVault.mockRejectedValueOnce(new Error('The AI is busy right now. Please retry in a moment.'))
    const user = userEvent.setup()
    render(<Chat />)
    await user.type(screen.getByLabelText('Your question'), 'hello{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('The AI is busy right now.')
    api.askVault.mockResolvedValueOnce({ answer: 'Back now', sources: [], followUps: [], inScope: true, queries: [] })
    await user.type(screen.getByLabelText('Your question'), 'again{Enter}')
    expect(await screen.findByText('Back now')).toBeInTheDocument()
    expect(api.askVault).toHaveBeenLastCalledWith([{ role: 'user', content: 'hello' }, { role: 'user', content: 'again' }])
  })
})
