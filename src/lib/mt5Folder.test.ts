import { describe, expect, it } from 'vitest'
import { changedFiles, REPORT_FILE } from './mt5Folder'

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
