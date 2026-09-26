import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { blankReport, type HealthReport } from '@/lib/health'
import { ReportCalendar } from './ReportCalendar'

const report = (id: string, testedAt: string, weight: number, fat: number): HealthReport => {
  const r = blankReport()
  return { ...r, id, testedAt, source: 'manual', values: { ...r.values, weight, percentBodyFat: fat } }
}

describe('ReportCalendar', () => {
  const reports = [report('a', '2026-08-30T07:00', 93.6, 35.5), report('b', '2026-09-24T07:13', 95.9, 38.4)]

  it('marks the day of a test with its weight and the change since the last one', () => {
    render(<ReportCalendar reports={reports} selectedId="b" onSelect={() => {}} />)
    const day = screen.getByRole('gridcell', { name: 'Test on 2026-09-24' })
    expect(day).toHaveTextContent('95.9')
    expect(day).toHaveTextContent('+2.3')
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('selects a report when its day is clicked and moves between months', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<ReportCalendar reports={reports} selectedId="b" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('gridcell', { name: 'Test on 2026-08-30' }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })
})
