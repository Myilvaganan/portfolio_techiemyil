import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { METRIC, SEGMENTS, fmtMetric, statusOf, type HealthReport, type MetricKey, type Range, type SegmentEval, type SegmentKey, type Status } from '@/lib/health'

const STATUS_TEXT: Record<Status, string> = { under: 'Under', normal: 'Normal', over: 'Over' }

const statusClass = (s: Status | null) =>
  s === 'normal' ? 'text-positive' : s === 'over' ? 'text-error' : s === 'under' ? 'text-amber-500' : 'text-text-secondary'

const statusFill = (s: Status | null) => (s === 'normal' ? 'bg-positive' : s === 'over' ? 'bg-error' : s === 'under' ? 'bg-amber-500' : 'bg-accent')

/**
 * One row of the sheet's bar analysis: the normal band shaded, the bar running up to the value. The scale is widened
 * around whichever is further out — the value or the band — so both always fit.
 */
export function RangeBar({ metric, value, range }: { metric: MetricKey; value: number | null; range: Range | null }) {
  const reduce = useReducedMotion()
  const status = statusOf(value, range)
  const m = METRIC[metric]
  let lo = 0
  let hi = 1
  if (range) {
    const pad = (range.high - range.low) * 0.8 || Math.abs(range.high) * 0.2 || 1
    lo = Math.max(0, Math.min(range.low - pad, value ?? range.low))
    hi = Math.max(range.high + pad, value !== null ? value * 1.05 : range.high)
  } else if (value !== null) {
    hi = value * 1.5 || 1
  }
  const pos = (n: number) => `${Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100))}%`

  return (
    <div className="grid grid-cols-[minmax(7rem,9rem)_1fr_auto] items-center gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-text">{m.label}</span>
        {range && (
          <span className="block text-[10px] text-text-secondary">
            normal {fmtMetric(metric, range.low, false)}–{fmtMetric(metric, range.high, false)}
            {m.unit && ` ${m.unit}`}
          </span>
        )}
      </span>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${m.label} ${fmtMetric(metric, value)}${status ? `, ${STATUS_TEXT[status]}` : ''}`}>
        {range && <div className="absolute inset-y-0 bg-positive/20" style={{ left: pos(range.low), width: `calc(${pos(range.high)} - ${pos(range.low)})` }} />}
        {value !== null && (
          <motion.div
            className={cn('absolute inset-y-0.5 left-0 rounded-full', statusFill(status))}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: pos(value) }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </div>
      <span className={cn('w-24 text-right font-mono text-xs font-semibold', statusClass(status))}>
        {fmtMetric(metric, value)}
        {status && <span className="block text-[10px] font-normal">{STATUS_TEXT[status]}</span>}
      </span>
    </div>
  )
}

const EVAL_SURFACE: Record<SegmentEval, string> = {
  '': 'border-border bg-surface-2',
  Under: 'border-amber-500/40 bg-amber-500/10',
  Normal: 'border-positive/35 bg-positive/10',
  Over: 'border-error/40 bg-error/10',
}
const EVAL_TEXT: Record<SegmentEval, string> = { '': 'text-text-secondary', Under: 'text-amber-500', Normal: 'text-positive', Over: 'text-error' }

function SegmentCell({ report, seg, side, className }: { report: HealthReport; seg: SegmentKey; side: 'lean' | 'fat'; className?: string }) {
  const s = report.segments[side][seg]
  const label = SEGMENTS.find((x) => x.key === seg)!.label
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center', EVAL_SURFACE[s.eval], className)}>
      <span className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</span>
      <span className="font-mono text-base font-semibold text-text">{s.kg === null ? '—' : `${s.kg} kg`}</span>
      {s.eval && <span className={cn('text-[11px] font-medium', EVAL_TEXT[s.eval])}>{s.eval}</span>}
    </div>
  )
}

/** Arms either side of the trunk, legs below — laid out as you face the sheet's figure. */
export function BodyMap({ report, side }: { report: HealthReport; side: 'lean' | 'fat' }) {
  const hasAny = SEGMENTS.some((s) => report.segments[side][s.key].kg !== null)
  if (!hasAny) return <p className="py-8 text-center text-sm text-text-secondary">No segmental {side} values on this report.</p>
  return (
    <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
      <SegmentCell report={report} seg="leftArm" side={side} />
      <SegmentCell report={report} seg="trunk" side={side} className="row-span-2" />
      <SegmentCell report={report} seg="rightArm" side={side} />
      <SegmentCell report={report} seg="leftLeg" side={side} />
      <SegmentCell report={report} seg="rightLeg" side={side} />
    </div>
  )
}
