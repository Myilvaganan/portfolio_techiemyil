import { describe, expect, it } from 'vitest'
import { blankTrade } from './journal'
import { blankReport } from './health'
import { searchAll, type SearchIndex } from './search'

const index: SearchIndex = {
  pages: [{ label: 'Loans', to: '/admin/loans', keywords: 'emi' }],
  documents: [{ key: 'tax/x', tag: 'tax', filename: 'Form16 2026.pdf', size: 1, lastModified: null }],
  trades: [{ ...blankTrade('2026-09-23'), instrument: 'XAUUSD', symbol: 'XAUUSD', strategy: 'Breakout', notes: 'revenge trade after loss' }],
  notes: { '2026-09-24#62280161': { date: '2026-09-24', bias: '', plan: 'wait for London open', review: '', lessons: '', mood: 0, discipline: 0 } },
  reports: [{ ...blankReport(), id: 'r', testedAt: '2026-09-24T07:13', values: { ...blankReport().values, weight: 95.9 } }],
}

describe('searchAll', () => {
  it('finds pages by keyword, documents, trades, notes and health tests', () => {
    expect(searchAll(index, 'emi')[0]).toMatchObject({ kind: 'page', to: '/admin/loans' })
    expect(searchAll(index, 'form16')[0]).toMatchObject({ kind: 'document' })
    expect(searchAll(index, 'revenge')[0]).toMatchObject({ kind: 'trade', to: '/admin/trading-journal?date=2026-09-23' })
    expect(searchAll(index, 'london')[0]).toMatchObject({ kind: 'note', to: '/admin/trading-journal?date=2026-09-24' })
    expect(searchAll(index, 'inbody')[0]).toMatchObject({ kind: 'health' })
  })

  it('needs every word to match and ignores empty queries', () => {
    expect(searchAll(index, 'xauusd breakout')).toHaveLength(1)
    expect(searchAll(index, 'xauusd nothing')).toHaveLength(0)
    expect(searchAll(index, '   ')).toEqual([])
  })
})
