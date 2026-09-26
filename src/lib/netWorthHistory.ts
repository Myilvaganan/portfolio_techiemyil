// Monthly net-worth snapshots and the numbers derived from them.

import type { NetWorthSummary } from './netWorth'

export interface WealthSnapshot {
  month: string
  assets: { portfolio: number; bank: number; other: number }
  liabilities: { loans: number; cards: number }
  net: number
  takenAt: string
}

export type SnapshotInput = Omit<WealthSnapshot, 'net' | 'takenAt'>

const round = (n: number) => Math.round(n * 100) / 100

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function snapshotFrom(summary: NetWorthSummary, month: string = currentMonth()): SnapshotInput {
  const total = (list: { key: string; total: number }[], key: string) => list.find((g) => g.key === key)?.total ?? 0
  return {
    month,
    assets: { portfolio: total(summary.assetGroups, 'investments'), bank: total(summary.assetGroups, 'bank'), other: 0 },
    liabilities: { loans: total(summary.liabilityGroups, 'loans'), cards: total(summary.liabilityGroups, 'cards') },
  }
}

export const hasSnapshotData = (s: SnapshotInput) => s.assets.portfolio + s.assets.bank + s.liabilities.loans + s.liabilities.cards > 0

export interface MonthChange {
  month: string
  net: number
  change: number
  pct: number | null
}

export function monthChanges(snaps: WealthSnapshot[]): MonthChange[] {
  const sorted = [...snaps].sort((a, b) => a.month.localeCompare(b.month))
  return sorted.slice(1).map((s, i) => {
    const prev = sorted[i].net
    return { month: s.month, net: s.net, change: round(s.net - prev), pct: prev !== 0 ? ((s.net - prev) / Math.abs(prev)) * 100 : null }
  })
}

export function bestWorst(changes: MonthChange[]): { best: MonthChange | null; worst: MonthChange | null } {
  if (changes.length === 0) return { best: null, worst: null }
  const sorted = [...changes].sort((a, b) => b.change - a.change)
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}
