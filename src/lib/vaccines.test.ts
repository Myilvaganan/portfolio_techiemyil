import { describe, expect, it } from 'vitest'
import { childSchedule, complete, reminderAlerts, vaccineAlerts } from './vaccines'

describe('vaccines', () => {
  it('builds due dates from the date of birth', () => {
    const s = childSchedule('2026-01-01', { bcg: '2026-01-01' }, '2026-02-10')
    expect(s.find((d) => d.code === 'bcg')!.status).toBe('given')
    expect(s.find((d) => d.code === 'dtp1')!.due).toBe('2026-02-12')
    expect(s.find((d) => d.code === 'dtp1')!.status).toBe('due')
    expect(s.find((d) => d.code === 'opv0')!.status).toBe('overdue')
  })
  it('reminds a week before, the day before and on the day', () => {
    const kids = [{ id: 'k1', name: 'Aadhi', dob: '2026-01-01' }]
    expect(vaccineAlerts(kids, { k1: {} }, '2026-02-05')[0].title).toBe('💉 Aadhi’s vaccines in 7 days')
    expect(vaccineAlerts(kids, { k1: {} }, '2026-02-12')[0].body).toContain('Rotavirus 1')
  })
})

describe('reminders', () => {
  const r = { id: 'r1', title: 'Pay maid', note: '', date: '2026-10-01', hour: 9, repeat: 'monthly' as const, done: false }
  it('moves a repeating reminder to its next date', () => {
    expect(complete(r, '2026-10-01').date).toBe('2026-11-01')
    expect(complete({ ...r, repeat: 'none' }, '2026-10-01').done).toBe(true)
  })
  it('fires at its hour on or after the date', () => {
    expect(reminderAlerts([r], '2026-10-01', 9)).toHaveLength(1)
    expect(reminderAlerts([r], '2026-10-01', 10)).toHaveLength(0)
    expect(reminderAlerts([r], '2026-09-30', 9)).toHaveLength(0)
  })
})
