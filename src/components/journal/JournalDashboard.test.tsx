import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JournalDashboard } from './JournalDashboard'
import { fetchJournal } from '@/lib/journalStore'
import { blankTrade, DEFAULT_SETTINGS } from '@/lib/journal'
vi.mock('@/lib/journalStore', () => ({ fetchJournal: vi.fn() }))
vi.mock('@/components/viz/charts', () => ({ AreaChart: ({ series }: { series: { key: string; values: number[] }[] }) => <div>{series.filter((s) => s.key === 'equity').map((s) => <output key={s.key} data-testid="account-equity">{JSON.stringify(s.values)}</output>)}</div> }))
it('keeps complete account equity when the dashboard is filtered by month or tag', async () => {
  vi.mocked(fetchJournal).mockResolvedValue({ trades: [
    { ...blankTrade('2026-08-10', '123'), id: 'old', grossPnl: 50, tags: ['old'] },
    { ...blankTrade('2026-09-10', '123'), id: 'new', grossPnl: -20, tags: ['new'] },
  ], days: {}, months: ['2026-08', '2026-09'] })
  const ops = [{ time: '2026-08-01 00:00', amount: 100 }]
  render(<JournalDashboard settings={DEFAULT_SETTINGS} viewedMonth="2026-09" today="2026-09-26" refreshKey={0} account="123" balanceOps={ops} />)
  expect(await screen.findByTestId('account-equity')).toHaveTextContent('[100,150,130]')
  await userEvent.click(screen.getByRole('button', { name: 'September 2026' }))
  await waitFor(() => expect(screen.getByTestId('account-equity')).toHaveTextContent('[100,150,130]'))
  await userEvent.click(screen.getByRole('button', { name: '#new' }))
  expect(screen.getByTestId('account-equity')).toHaveTextContent('[100,150,130]')
  expect(fetchJournal).toHaveBeenLastCalledWith(undefined, undefined, '123')
})
