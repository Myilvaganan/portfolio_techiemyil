import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HealthReport } from './HealthReport'
import * as api from '@/lib/healthApi'
import { blankReport, type HealthReport as Report } from '@/lib/health'

vi.mock('@/lib/healthApi', () => ({
  fetchReports: vi.fn(),
  saveReports: vi.fn(),
  deleteReport: vi.fn(),
  scanReport: vi.fn(),
}))

// Illustrative numbers only.
function report(id: string, testedAt: string, weight: number, over: Partial<Report> = {}): Report {
  const r = blankReport({ heightCm: 170, age: 30, sex: 'male' })
  r.values = { ...r.values, weight, skeletalMuscleMass: 32, bodyFatMass: 30, percentBodyFat: 33.3, visceralFatLevel: 14, inbodyScore: 60, fatControl: -18 }
  r.ranges = { weight: { low: 55, high: 75 }, bodyFatMass: { low: 8, high: 16 } }
  return { ...r, id, testedAt, device: 'InBody260', source: 'scan', createdAt: 'x', updatedAt: 'x', ...over }
}

describe('HealthReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invites a photo when there are no reports', async () => {
    vi.mocked(api.fetchReports).mockResolvedValue([])
    render(<HealthReport />)
    expect(await screen.findByText(/add your first body-composition report/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan report photo/i })).toBeInTheDocument()
  })

  it('shows the latest report with ranges, findings and change since the last test', async () => {
    vi.mocked(api.fetchReports).mockResolvedValue([report('a', '2026-01-10', 92), report('b', '2026-04-10T07:30', 90)])
    render(<HealthReport />)
    expect(await screen.findByText('Muscle-fat analysis')).toBeInTheDocument()
    expect(screen.getByText(/at 07:30/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Weight 90.0 kg, Over' })).toBeInTheDocument()
    expect(screen.getByText('Visceral fat level 14')).toBeInTheDocument()
    expect(screen.getByText('−2.0 kg')).toBeInTheDocument()
    expect(screen.getByText('All reports (2)')).toBeInTheDocument()
  })

  it('scans a photo, lets the user check it, and saves it with the history columns', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchReports).mockResolvedValue([])
    const scanned = report('', '2026-09-01T08:00', 90)
    vi.mocked(api.scanReport).mockResolvedValue({ report: scanned, history: [{ date: '2025-06-01', weight: 88, skeletalMuscleMass: 33, percentBodyFat: 30 }] })
    vi.mocked(api.saveReports).mockImplementation(async (list) => list.map((r, i) => ({ ...r, id: r.id || `new${i}` })))

    render(<HealthReport />)
    await screen.findByText(/add your first/i)
    await user.upload(screen.getByLabelText('Report photo'), new File(['x'], 'sheet.jpg', { type: 'image/jpeg' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/read from your photo/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Weight')).toHaveValue('90')
    await user.clear(within(dialog).getByLabelText('Weight'))
    await user.type(within(dialog).getByLabelText('Weight'), '89.5')
    await user.click(within(dialog).getByRole('button', { name: 'Save report' }))

    await waitFor(() => expect(api.saveReports).toHaveBeenCalled())
    const sent = vi.mocked(api.saveReports).mock.calls[0][0]
    expect(sent).toHaveLength(2)
    expect(sent[0].values.weight).toBe(89.5)
    expect(sent[1]).toMatchObject({ testedAt: '2025-06-01', source: 'history' })
    expect(await screen.findByText('Muscle-fat analysis')).toBeInTheDocument()
  })

  it('shows a scan error', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchReports).mockResolvedValue([])
    vi.mocked(api.scanReport).mockRejectedValue(new Error('That photo doesn’t look like a body-composition report.'))
    render(<HealthReport />)
    await screen.findByText(/add your first/i)
    await user.upload(screen.getByLabelText('Report photo'), new File(['x'], 'cat.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn’t look like/)
  })

  it('deletes a report after confirming', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(api.fetchReports).mockResolvedValue([report('a', '2026-01-10', 92)])
    vi.mocked(api.deleteReport).mockResolvedValue([])
    render(<HealthReport />)
    await user.click(await screen.findByRole('button', { name: 'Delete report from 2026-01-10' }))
    expect(api.deleteReport).toHaveBeenCalledWith('a')
    expect(await screen.findByText(/add your first/i)).toBeInTheDocument()
  })
})
