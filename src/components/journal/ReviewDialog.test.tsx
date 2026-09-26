import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewDialog } from './ReviewDialog'
import { DEFAULT_SETTINGS } from '@/lib/journal'
import { fetchJournal } from '@/lib/journalStore'
vi.mock('@/lib/journalStore', () => ({ fetchJournal: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('shows a failed request instead of a zero-trade review and allows retry', async () => {
  vi.mocked(fetchJournal).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ trades: [], days: {}, months: [] })
  render(<ReviewDialog open onOpenChange={() => {}} settings={DEFAULT_SETTINGS} viewedMonth="2026-09" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
  expect(screen.queryByText('0 trades')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Print/ })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('0 trades')).toBeInTheDocument()
})
