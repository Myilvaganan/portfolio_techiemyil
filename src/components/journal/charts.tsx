import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import type { Slice } from '@/lib/journalAnalytics'
import { Amount, Empty, tone } from './parts'

export interface ColumnRow {
  label: string
  /** Before tax. */
  pre: number
  /** After tax. */
  post: number
}


/** Grouped columns that can go below zero (the shared BarChart only draws gains). Scrolls sideways when crowded. */
export function PnlColumns({ rows, height = 190 }: { rows: ColumnRow[]; height?: number }) {
  const CHART_H = height
  const m = useMoney()
  if (rows.length === 0) return <Empty>No months to show yet.</Empty>

  const values = rows.flatMap((r) => [r.pre, r.post])
  const top = Math.max(0, ...values)
  const bottom = Math.max(0, ...values.map((v) => -v))
  const range = top + bottom || 1
  const zeroY = (top / range) * CHART_H
  const h = (v: number) => (Math.abs(v) / range) * CHART_H

  const bar = (v: number, color: string, label: string) => (
    <div
      title={`${label}: ${m.signed(v)}`}
      className="w-3 rounded-sm sm:w-4"
      style={{
        position: 'absolute',
        background: color,
        height: Math.max(v === 0 ? 0 : 2, h(v)),
        ...(v >= 0 ? { bottom: CHART_H - zeroY } : { top: zeroY }),
      }}
    />
  )

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-full gap-1.5" style={{ width: Math.max(0, rows.length * 44) }}>
        {rows.map((r) => (
          <div key={r.label} className="flex min-w-[36px] flex-1 flex-col items-center">
            <div className="relative w-full" style={{ height: CHART_H }} role="img" aria-label={`${r.label}: before tax ${m.signed(r.pre)}, after tax ${m.signed(r.post)}`}>
              <div className="absolute inset-x-0 border-t border-border" style={{ top: zeroY }} />
              <div className="absolute inset-x-0 flex justify-center gap-0.5" style={{ top: 0, height: CHART_H }}>
                <div className="relative w-3 sm:w-4">{bar(r.pre, 'var(--viz-1)', 'Before tax')}</div>
                <div className="relative w-3 sm:w-4">{bar(r.post, 'var(--viz-3)', 'After tax')}</div>
              </div>
            </div>
            <span className="mt-1 text-2xs text-text-secondary">{r.label}</span>
            <span className={cn('font-mono text-2xs font-semibold', tone(r.pre))}>{m.compact(r.pre)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-4 text-2xs text-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--viz-1)' }} />
          Before tax
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: 'var(--viz-3)' }} />
          After tax
        </span>
      </div>
    </div>
  )
}

/** Ranked profit/loss per group, with the trade count and win rate under each name. */
export function PnlBars({ items, emptyText = 'Nothing to show yet.' }: { items: Slice[]; emptyText?: string }) {
  const m = useMoney()
  if (items.length === 0) return <Empty>{emptyText}</Empty>
  const maxAbs = Math.max(1, ...items.map((i) => Math.abs(i.net)))
  return (
    <ul className="space-y-2.5">
      {items.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-text">{s.label}</span>
            <Amount value={s.net} className="text-sm font-semibold" />
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-7">
            <div className={cn('h-full rounded-full', s.net >= 0 ? 'bg-positive' : 'bg-error')} style={{ width: `${(Math.abs(s.net) / maxAbs) * 100}%` }} />
          </div>
          <p className="mt-0.5 text-2xs text-text-secondary">
            {s.trades} trade{s.trades === 1 ? '' : 's'} · {s.winRate.toFixed(0)}% win
            {s.tax > 0 && ` · after tax ${m.inr(s.afterTax)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}
