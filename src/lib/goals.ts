// Goal planner maths: required saving, progress and projected finish. Months are calendar-approximate (30.4375 days).

import { monthlyFlow } from './statements'
import type { Txn } from './statements'

export type GoalKind = 'house' | 'bike' | 'emergency' | 'other'

export interface Goal {
  id: string
  name: string
  targetAmount: number
  targetDate: string
  startAmount?: number
  monthlyContribution?: number
  kind: GoalKind
}

export type GoalStatus = 'done' | 'on-track' | 'behind' | 'no-plan'

const DAY = 86_400_000
const MONTH_DAYS = 30.4375
const round = (n: number) => Math.round(n * 100) / 100

export function monthsUntil(targetDate: string, today: string): number {
  return Math.max(0, (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY / MONTH_DAYS)
}

// Monthly saving that grows `current` to `target` in `months`, with an optional assumed annual return (percent).
export function requiredMonthly(target: number, current: number, months: number, annualReturnPct = 0): number {
  const gap = target - current
  if (gap <= 0) return 0
  if (months <= 0) return gap
  const r = annualReturnPct / 100 / 12
  if (r <= 0) return round(gap / months)
  const growth = Math.pow(1 + r, months)
  const need = target - current * growth
  return need <= 0 ? 0 : round((need * r) / (growth - 1))
}

export const progressPct = (current: number, target: number) => (target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0)

function addMonths(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + Math.round(months * MONTH_DAYS))
  return d.toISOString().slice(0, 10)
}

// Date the goal is reached when saving `monthly` each month; null when it never is (no contribution) or takes over 50 years.
export function projectedFinish(target: number, current: number, monthly: number, today: string, annualReturnPct = 0): string | null {
  if (current >= target) return today
  if (monthly <= 0 && annualReturnPct <= 0) return null
  const r = annualReturnPct / 100 / 12
  let bal = current
  for (let m = 1; m <= 600; m++) {
    bal = bal * (1 + r) + monthly
    if (bal >= target) return addMonths(today, m)
  }
  return null
}

export interface GoalPlan {
  current: number
  progress: number
  monthsLeft: number
  required: number
  finish: string | null
  status: GoalStatus
  shortfall: number
}

export function planGoal(goal: Goal, current: number, today: string, annualReturnPct = 0): GoalPlan {
  const monthsLeft = monthsUntil(goal.targetDate, today)
  const monthly = goal.monthlyContribution ?? 0
  const required = requiredMonthly(goal.targetAmount, current, monthsLeft, annualReturnPct)
  const finish = projectedFinish(goal.targetAmount, current, monthly, today, annualReturnPct)
  let status: GoalStatus
  if (current >= goal.targetAmount) status = 'done'
  else if (monthly <= 0) status = 'no-plan'
  else status = finish !== null && finish <= goal.targetDate ? 'on-track' : 'behind'
  return { current, progress: progressPct(current, goal.targetAmount), monthsLeft, required, finish, status, shortfall: round(Math.max(0, required - monthly)) }
}

// Average monthly outgoings over the latest complete-looking months (up to 6), transfers excluded.
export function averageMonthlySpend(bankTxns: Txn[], months = 6): number {
  const rows = monthlyFlow('bank', bankTxns, { excludeTransfers: true }).filter((r) => r.spend > 0)
  const recent = rows.slice(-months)
  return recent.length ? round(recent.reduce((s, r) => s + r.spend, 0) / recent.length) : 0
}

export const emergencyTarget = (avgMonthlySpend: number, months = 6) => round(avgMonthlySpend * months)
