import { useEffect, useRef, useState, type ReactNode } from 'react'
import { tile } from '@/lib/tiles'
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { haptic } from '@/lib/native'
import { AlertTriangle } from 'lucide-react'
import { PageBadge } from '@/components/admin/AdminShell'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'

// Building blocks shared by the growth modules, so every new page has the same Aurum look and motion.

export function PageHero({ eyebrow, title, lede, actions }: { eyebrow: string; title: string; lede: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <PageBadge />
        <div className="min-w-0">
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="mt-1 page-title">{title}</h1>
          <p className="page-lede max-w-2xl">{lede}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A number that counts up to its value the first time it scrolls into view. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  useEffect(() => {
    if (!inView || reduce) return setShown(value)
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: setShown })
    return () => controls.stop()
  }, [inView, value, reduce])
  return <span ref={ref}>{format(shown)}</span>
}

export type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'gold'
const TONE: Record<Tone, string> = {
  good: 'text-positive',
  bad: 'text-error',
  warn: 'text-amber-500',
  neutral: 'text-text',
  gold: 'text-accent',
}

export function Stat({ label, value, sub, tone = 'neutral', className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  return (
    <GlassCard hover={false} className={cn('p-4', tile(label, tone).className, className)} style={tile(label, tone).style}>
      <p className="label-caps">{label}</p>
      <p className={cn('mt-1.5 font-mono text-2xl font-semibold tracking-tight', TONE[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

export function Panel({ title, hint, action, children, className }: { title?: string; hint?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <GlassCard hover={false} className={cn('p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </GlassCard>
  )
}

/** Loading state for a module page: skeleton shapes rather than a spinner, so the layout never jumps. */
export function Loading({ label }: { label: string }) {
  return <PageSkeleton label={label} />
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'bad' | 'info' }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
        tone === 'bad' && 'border-error/30 bg-error/10 text-error',
        tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        tone === 'info' && 'border-border bg-surface-2 text-text-secondary',
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <p className="font-display text-lg text-text">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-text-secondary">{children}</div>}
    </div>
  )
}

/** Horizontal bars that grow in; positive values gold/green, negative red. */
export function Bars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)))
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate text-text-secondary" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-5">
            <motion.span
              className={cn('block h-full rounded-full', r.value >= 0 ? 'bg-gradient-to-r from-accent/60 to-accent' : 'bg-gradient-to-r from-error/60 to-error')}
              initial={{ width: 0 }}
              animate={{ width: `${(Math.abs(r.value) / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
          <span className={cn('whitespace-nowrap font-mono text-xs', r.value < 0 ? 'text-error' : 'text-text')}>
            {format(r.value)}
            {r.sub && <span className="ml-1 text-text-secondary">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export const inputCls =
  'w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent/60'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="block text-2xs text-text-secondary/80">{hint}</span>}
    </label>
  )
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors', active ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border bg-surface-2 text-text-secondary hover:text-text')}
    >
      {children}
    </button>
  )
}

/**
 * A list row you can swipe on a phone, like a native mail list: swipe right for the `right` action, left for the
 * `left` action. The colour and icon behind the row appear as it moves; past the threshold it fires (with a buzz).
 * On desktop it is a plain row — the same actions stay available as buttons inside it.
 */
export function SwipeRow({
  children,
  left,
  right,
}: {
  children: ReactNode
  left?: { label: string; icon: ReactNode; tone: 'bad' | 'good' | 'neutral'; onTrigger: () => void }
  right?: { label: string; icon: ReactNode; tone: 'bad' | 'good' | 'neutral'; onTrigger: () => void }
}) {
  const x = useMotionValue(0)
  const THRESHOLD = 96
  const toneBg = { bad: 'bg-error', good: 'bg-positive', neutral: 'bg-surface-15' }
  const leftOpacity = useTransform(x, [-THRESHOLD, -24], [1, 0])
  const rightOpacity = useTransform(x, [24, THRESHOLD], [0, 1])
  const [armed, setArmed] = useState<'left' | 'right' | null>(null)
  return (
    <div className="relative overflow-hidden rounded-xl">
      {right && (
        <motion.div style={{ opacity: rightOpacity }} className={cn('absolute inset-0 flex items-center gap-2 pl-4 text-sm font-medium text-white', toneBg[right.tone])}>
          {right.icon} {right.label}
        </motion.div>
      )}
      {left && (
        <motion.div style={{ opacity: leftOpacity }} className={cn('absolute inset-0 flex items-center justify-end gap-2 pr-4 text-sm font-medium text-white', toneBg[left.tone])}>
          {left.label} {left.icon}
        </motion.div>
      )}
      <motion.div
        drag={left || right ? 'x' : false}
        dragDirectionLock
        dragConstraints={{ left: left ? -160 : 0, right: right ? 160 : 0 }}
        dragElastic={0.12}
        dragSnapToOrigin
        style={{ x, touchAction: 'pan-y' }}
        onDrag={(_, info) => {
          const next = info.offset.x > THRESHOLD ? 'right' : info.offset.x < -THRESHOLD ? 'left' : null
          if (next !== armed) {
            if (next) haptic(12)
            setArmed(next)
          }
        }}
        onDragEnd={(_, info) => {
          setArmed(null)
          if (info.offset.x > THRESHOLD) right?.onTrigger()
          else if (info.offset.x < -THRESHOLD) left?.onTrigger()
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  )
}

/** Placeholder shapes shaped like a module page (four stat tiles and two panels), shimmering while data loads. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-[20px] border border-border bg-surface-2 p-4">
            <div className="skeleton-line h-3 w-20" />
            <div className="skeleton-line mt-3 h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-[20px] border border-border bg-surface-2 p-5">
            <div className="skeleton-line h-5 w-40" />
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="skeleton-line h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
