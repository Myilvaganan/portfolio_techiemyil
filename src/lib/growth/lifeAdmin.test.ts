import { describe, expect, it } from 'vitest'
import { addMonths, complete, dueList, taxDeadlines } from './lifeAdmin'

const item = (over = {}) => ({ id: 'p1', title: 'Car insurance', category: 'vehicle' as const, dueDate: '2026-10-10', repeatMonths: 12, notes: '', done: false, ...over })

describe('life admin', () => {
  it('computes the next tax dates on or after today', () => {
    const d = Object.fromEntries(taxDeadlines('2026-09-29').map((i) => [i.id, i.dueDate]))
    expect(d['tax-itr']).toBe('2027-07-31')
    expect(d['tax-adv3']).toBe('2026-12-15')
    expect(d['tax-adv2']).toBe('2027-09-15')
  })

  it('buckets items by how soon they are due', () => {
    const list = dueList([item(), item({ id: 'p2', dueDate: '2026-09-01' }), item({ id: 'p3', dueDate: '2027-05-01' })], '2026-09-29', false)
    expect(list.map((i) => i.bucket)).toEqual(['overdue', 'soon', 'later'])
    expect(list[1].daysLeft).toBe(11)
  })

  it('rolls a repeating item forward past today, and closes a one-off', () => {
    expect(complete(item({ dueDate: '2025-01-31', repeatMonths: 12 }), '2026-09-29').dueDate).toBe('2027-01-31')
    expect(complete(item({ repeatMonths: 0 }), '2026-09-29').done).toBe(true)
  })

  it('keeps month-end dates valid', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })
})
