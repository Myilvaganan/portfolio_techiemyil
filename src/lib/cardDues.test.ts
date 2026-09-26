import { describe, expect, it } from 'vitest'
import { buildCardDues, cardDueNotices, daysBetween, estimateDueDate, utilisationPct } from './cardDues'
import type { Statement, Txn } from './statements'

const st = (o: Partial<Statement>): Statement => ({ id: 's', kind: 'card', filename: 'f', uploadedAt: '2026-09-01', pages: 1, fileKey: 'k', accountKey: 'icici:5001', txnCount: 0, duplicatesSkipped: 0, bank: 'icici', periodFrom: '2026-08-01', periodTo: '2026-08-31', cardLast4: '5001', cardName: 'Amazon Pay', ...o })
const tx = (o: Partial<Txn>): Txn => ({ id: 't', statementId: 's', accountKey: 'icici:5001', date: '2026-08-10', description: '', merchant: '', debit: 0, credit: 0, category: 'Other', ...o })

describe('cardDues', () => {
  it('computes day math and estimates', () => {
    expect(daysBetween('2026-09-26', '2026-09-30')).toBe(4)
    expect(estimateDueDate('2026-08-31')).toBe('2026-09-18')
    expect(estimateDueDate(null)).toBeNull()
    expect(utilisationPct(35000, 100000)).toBe(35)
    expect(utilisationPct(1, null)).toBeNull()
  })

  it('uses the extracted due date and utilisation', () => {
    const [c] = buildCardDues([tx({ type: 'interest', debit: 120 }), tx({ type: 'fee', debit: 30 }), tx({ type: 'purchase', debit: 999 })], [st({ dueDate: '2026-09-29', totalDue: 80000, minDue: 4000, creditLimit: 100000 })], '2026-09-26')
    expect(c).toMatchObject({ dueDate: '2026-09-29', estimated: false, daysLeft: 3, utilisation: 80, interestPaid: 120, feesPaid: 30, overdue: false })
  })

  it('estimates for older statements and prefers available limit', () => {
    const [c] = buildCardDues([], [st({ totalDue: 5000, creditLimit: 100000, availableLimit: 60000 })], '2026-09-10')
    expect(c.estimated).toBe(true)
    expect(c.dueDate).toBe('2026-09-18')
    expect(c.utilisation).toBe(40)
  })

  it('marks paid statements settled and unpaid past-due ones overdue', () => {
    const paid = buildCardDues([tx({ type: 'payment', credit: 5000, date: '2026-09-05' })], [st({ dueDate: '2026-09-18', totalDue: 5000 })], '2026-09-26')[0]
    expect(paid.settled).toBe(true)
    expect(paid.overdue).toBe(false)
    const late = buildCardDues([], [st({ dueDate: '2026-09-18', totalDue: 5000 })], '2026-09-26')[0]
    expect(late.overdue).toBe(true)
  })

  it('raises notices for due soon, overdue and high utilisation', () => {
    const cards = [
      ...buildCardDues([], [st({ accountKey: 'a', dueDate: '2026-09-28', totalDue: 1000, creditLimit: 100000 })], '2026-09-26'),
      ...buildCardDues([], [st({ accountKey: 'b', dueDate: '2026-09-01', totalDue: 1000 })], '2026-09-26'),
      ...buildCardDues([], [st({ accountKey: 'c', dueDate: '2026-12-01', totalDue: 90000, creditLimit: 100000 })], '2026-09-26'),
    ]
    const n = cardDueNotices(cards, '2026-09-26')
    expect(n.map((x) => x.title).join('|')).toMatch(/in 2 days/)
    expect(n.some((x) => /overdue/.test(x.title))).toBe(true)
    expect(n.some((x) => /utilisation 90%/.test(x.title))).toBe(true)
    expect(n).toHaveLength(3)
  })
})
