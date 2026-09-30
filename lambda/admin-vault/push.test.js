import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { buildAlerts, istDate } = require('./push')

describe('push alerts', () => {
  it('uses the Indian date', () => {
    expect(istDate(new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-30')
  })

  it('reminds about card bills due within three days, newest statement per card', () => {
    const a = buildAlerts({ today: '2026-10-01', slot: 'morning', cardStatements: [
      { cardLast4: '7003', cardName: 'ICICI', dueDate: '2026-09-02', totalDue: 5000 },
      { cardLast4: '7003', cardName: 'ICICI', dueDate: '2026-10-03', totalDue: 10675 },
      { cardLast4: '5001', dueDate: '2026-10-20', totalDue: 900 },
    ] })
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ title: 'Card bill due in 2 days', url: '/credit-cards' })
  })

  it('sends life-admin deadlines in the morning only', () => {
    const lifeItems = [{ id: 'p1', title: 'Car insurance', dueDate: '2026-10-02', notes: '' }, { id: 'p2', title: 'Passport', dueDate: '2027-01-01' }]
    expect(buildAlerts({ today: '2026-10-01', slot: 'morning', lifeItems }).map((x) => x.title)).toEqual(['Due in 1 day: Car insurance'])
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', lifeItems })).toEqual([])
  })

  it('flags a broken daily loss limit in the evening', () => {
    const trades = [{ date: '2026-10-01', grossPnl: -6000, fees: 100 }, { date: '2026-10-01', grossPnl: 500, fees: 0 }]
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', trades, dailyLossLimit: 5000 })[0].title).toBe('Daily loss limit broken')
    expect(buildAlerts({ today: '2026-10-01', slot: 'evening', trades, dailyLossLimit: 8000 })).toEqual([])
  })
})
