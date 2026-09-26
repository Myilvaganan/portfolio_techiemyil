import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteInsights } from './SiteInsights'
import { fetchAnalytics, fetchMessages } from '@/lib/platformApi'
vi.mock('@/lib/platformApi', () => ({ fetchAnalytics: vi.fn(), fetchMessages: vi.fn(), markMessage: vi.fn(), deleteMessage: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('stops loading and shows retry guidance when both routes fail', async () => {
  vi.mocked(fetchAnalytics).mockRejectedValue(new Error('Not found.'))
  vi.mocked(fetchMessages).mockRejectedValue(new Error('Not found.'))
  render(<SiteInsights />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Not found.')
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  expect(screen.getByText(/Visitor data could not be loaded/)).toBeInTheDocument()
  expect(screen.getByText(/Messages could not be loaded/)).toBeInTheDocument()
})
it('keeps messages available when only analytics fails', async () => {
  vi.mocked(fetchAnalytics).mockRejectedValue(new Error('Analytics unavailable'))
  vi.mocked(fetchMessages).mockResolvedValue([{ id: '1', name: 'Test sender', email: 'test@example.com', message: 'Hello', read: true, createdAt: '2026-09-26T00:00:00Z' }])
  render(<SiteInsights />)
  expect(await screen.findByText('Test sender')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Analytics unavailable')
})
