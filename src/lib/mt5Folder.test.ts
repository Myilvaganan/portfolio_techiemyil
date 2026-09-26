import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changedFiles, REPORT_FILE, syncFolder } from './mt5Folder'

describe('mt5Folder', () => {
  it('only picks MetaTrader report files', () => {
    expect(REPORT_FILE.test('ReportHistory-62280161.html')).toBe(true)
    expect(REPORT_FILE.test('ReportHistory-62280161.htm')).toBe(true)
    expect(REPORT_FILE.test('notes.html')).toBe(false)
  })

  it('returns files that are new or modified since the last sync', () => {
    const files = [
      { name: 'ReportHistory-1.html', lastModified: 10 },
      { name: 'ReportHistory-2.html', lastModified: 20 },
      { name: 'ReportHistory-3.html', lastModified: 30 },
      { name: 'other.txt', lastModified: 1 },
    ]
    expect(changedFiles(files, { 'ReportHistory-1.html': 10, 'ReportHistory-2.html': 5 }).map((f) => f.name)).toEqual(['ReportHistory-2.html', 'ReportHistory-3.html'])
  })
})

vi.mock('./journalStore', () => ({ importTrades: vi.fn(), saveAccount: vi.fn() }))
vi.mock('./mt5', () => ({ readReportFile: vi.fn(), parseMt5Report: vi.fn(), positionsToTrades: vi.fn(), accountFromReport: vi.fn() }))
import { importTrades, saveAccount } from './journalStore'
import { accountFromReport, parseMt5Report, positionsToTrades, readReportFile } from './mt5'
import { blankTrade } from './journal'

describe('folder import recovery', () => {
  const file = new File(['report'], 'ReportHistory-123.html', { lastModified: 42 })
  const folder = { async *values() { yield { kind: 'file', name: file.name, getFile: async () => file } } } as unknown as Parameters<typeof syncFolder>[0]
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    vi.mocked(readReportFile).mockResolvedValue('report')
    vi.mocked(parseMt5Report).mockReturnValue({ account: '123' } as ReturnType<typeof parseMt5Report>)
    vi.mocked(accountFromReport).mockReturnValue({ account: '123' } as ReturnType<typeof accountFromReport>)
    vi.mocked(positionsToTrades).mockReturnValue([blankTrade('2026-09-25', '123')])
    vi.mocked(importTrades).mockResolvedValue({ added: 1, skipped: 0, invalid: 0 })
  })
  it('handles a corrupted seen cache and skips a successfully imported unchanged file', async () => {
    localStorage.setItem('mt5_folder_seen', 'null')
    expect((await syncFolder(folder)).added).toBe(1)
    expect((await syncFolder(folder)).files).toBe(0)
    expect(saveAccount).toHaveBeenCalledOnce()
  })
  it('does not mark a report seen when some trades are rejected', async () => {
    vi.mocked(importTrades).mockResolvedValueOnce({ added: 0, skipped: 0, invalid: 1 })
    expect((await syncFolder(folder)).errors[0]).toContain('1 trades were rejected')
    expect((await syncFolder(folder)).added).toBe(1)
    expect(importTrades).toHaveBeenCalledTimes(2)
  })
})
