import { describe, expect, it } from 'vitest'
import { averageMonthlySpend, emergencyTarget, monthsUntil, planGoal, progressPct, projectedFinish, requiredMonthly, type Goal } from './goals'
import type { Txn } from './statements'

const goal = (o: Partial<Goal> = {}): Goal => ({ id: 'g', name: 'Bike', targetAmount: 120000, targetDate: '2027-09-26', kind: 'bike', ...o })

describe('goals', () => {
  it('measures months and required saving', () => {
    expect(monthsUntil('2027-09-26', '2026-09-26')).toBeCloseTo(12, 0)
    expect(requiredMonthly(120000, 0, 12)).toBe(10000)
    expect(requiredMonthly(120000, 150000, 12)).toBe(0)
    expect(requiredMonthly(120000, 0, 12, 12)).toBeLessThan(10000)
    expect(requiredMonthly(5000, 0, 0)).toBe(5000)
  })

  it('clamps progress', () => {
    expect(progressPct(50, 200)).toBe(25)
    expect(progressPct(500, 200)).toBe(100)
  })

  it('projects a finish date', () => {
    expect(projectedFinish(1000, 0, 0, '2026-09-26')).toBeNull()
    expect(projectedFinish(1000, 2000, 0, '2026-09-26')).toBe('2026-09-26')
    const d = projectedFinish(1200, 0, 100, '2026-09-26')!
    expect(d > '2027-08-01' && d < '2027-10-30').toBe(true)
  })

  it('reports status', () => {
    expect(planGoal(goal(), 0, '2026-09-26').status).toBe('no-plan')
    expect(planGoal(goal({ monthlyContribution: 11000 }), 0, '2026-09-26').status).toBe('on-track')
    const behind = planGoal(goal({ monthlyContribution: 5000 }), 0, '2026-09-26')
    expect(behind.status).toBe('behind')
    expect(behind.shortfall).toBeGreaterThan(4000)
    expect(planGoal(goal(), 130000, '2026-09-26').status).toBe('done')
  })

  it('averages spend for the emergency fund', () => {
    const t = (date: string, debit: number): Txn => ({ id: date, statementId: 's', accountKey: 'a', date, description: '', merchant: '', debit, credit: 0, category: 'Other' })
    const avg = averageMonthlySpend([t('2026-07-05', 30000), t('2026-08-05', 50000)])
    expect(avg).toBe(40000)
    expect(emergencyTarget(avg)).toBe(240000)
    expect(averageMonthlySpend([])).toBe(0)
  })
})
