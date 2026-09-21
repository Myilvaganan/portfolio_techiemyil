import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Nfc } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { cn } from '@/lib/utils'
import { CountNumber, Reveal } from '@/components/viz/motion'
import { FitValue } from '@/components/viz/FitValue'
import { Sparkline, vizColor } from '@/components/viz/charts'
import { formatInr } from '@/lib/kite'
import { dayLabel, type CardSummary } from '@/lib/statements'

export const inr = (n: number) => formatInr(n)
export const signedInr = (n: number) => `${n < 0 ? '-' : n > 0 ? '+' : ''}${formatInr(n)}`
export const pct = (n: number, d = 0) => `${n.toFixed(d)}%`

// Sentiment shows in the tile itself: a tinted background and border, not just the number's colour.
export const TONE_SURFACE = {
  good: 'border-positive/35 bg-gradient-to-br from-positive/[0.14] to-positive/[0.03]',
  warn: 'border-amber-500/40 bg-gradient-to-br from-amber-500/[0.15] to-amber-500/[0.03]',
  bad: 'border-error/40 bg-gradient-to-br from-error/[0.15] to-error/[0.03]',
} as const

export function Kpi({
  label,
  value,
  format = inr,
  sub,
  spark,
  tone,
  delay = 0,
}: {
  label: string
  value: number
  format?: (n: number) => string
  sub?: ReactNode
  spark?: number[]
  tone?: 'good' | 'bad' | 'warn'
  delay?: number
}) {
  return (
    <Reveal delay={delay} y={18}>
      <GlassCard hover className={cn('h-full p-4 transition-colors duration-500', tone && TONE_SURFACE[tone])}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
        <FitValue
          max={24}
          text={format(value)}
          className={cn('mt-1.5 whitespace-nowrap font-mono font-semibold leading-tight text-text', tone === 'good' && 'text-positive', tone === 'bad' && 'text-error', tone === 'warn' && 'text-amber-500')}
        >
          <CountNumber value={value} format={format} />
        </FitValue>
        {sub && <p className="mt-1 text-[11px] text-text-secondary">{sub}</p>}
        {spark && spark.length > 1 && <div className="mt-2 opacity-90"><Sparkline values={spark} color={tone === 'bad' ? 'var(--color-error)' : tone === 'good' ? 'var(--color-positive)' : tone === 'warn' ? '#f59e0b' : 'var(--viz-1)'} /></div>}
      </GlassCard>
    </Reveal>
  )
}

export function Card({ title, aside, children, className, delay = 0 }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={className}>
      <GlassCard hover={false} className="h-full min-w-0 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
          {aside}
        </div>
        {children}
      </GlassCard>
    </Reveal>
  )
}

export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          data-cursor="hover"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', value === o.id ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/40 hover:text-text')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export type RangeId = 'all' | '3m' | '6m' | '12m'
export const RANGE_OPTIONS: { id: RangeId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: '12m', label: 'Last 12 months' },
]

// Ranges count back from the newest transaction, so old statements still show something.
export function rangeFrom(range: RangeId, latest: string): string | undefined {
  if (range === 'all' || !latest) return undefined
  const d = new Date(`${latest}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - (range === '3m' ? 3 : range === '6m' ? 6 : 12))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null
  const today = new Date()
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000)
}

export function CreditCardTile({ card, index, active, onClick }: { card: CardSummary; index: number; active: boolean; onClick: () => void }) {
  const days = daysUntil(card.dueDate)
  const util = card.utilisation
  return (
    <motion.button
      type="button"
      data-cursor="hover"
      onClick={onClick}
      aria-pressed={active}
      whileHover={{ y: -6, rotateX: 3, rotateY: -3 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${vizColor(index)} 62%, #0a0a0a) 0%, #0a0a0a 78%)`, transformPerspective: 900 }}
      className={cn('relative w-full overflow-hidden rounded-2xl border p-4 text-left text-white shadow-lg', active ? 'border-white/70 ring-2 ring-accent/60' : 'border-white/10')}
    >
      <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="flex items-start justify-between">
        <p className="max-w-[80%] truncate text-xs font-medium text-white/80">{card.name}</p>
        <Nfc className="h-4 w-4 text-white/60" aria-hidden />
      </div>
      <p className="mt-5 font-mono text-base tracking-[0.2em]">•••• {card.last4 || '····'}</p>
      <div className="mt-4 flex items-end justify-between gap-2 text-[11px]">
        <div>
          <p className="text-white/60">Total due</p>
          <p className="font-mono text-sm font-semibold">{card.totalDue !== null ? inr(card.totalDue) : '—'}</p>
        </div>
        <div className="text-right">
          <p className="text-white/60">{card.dueDate ? `Due ${dayLabel(card.dueDate)}` : 'Due date n/a'}</p>
          {days !== null && (
            <p className={cn('font-semibold', days < 0 ? 'text-red-300' : days <= 5 ? 'text-amber-300' : 'text-white/85')}>{days < 0 ? `${-days}d overdue?` : days === 0 ? 'Due today' : `${days}d left`}</p>
          )}
        </div>
      </div>
      {util !== null && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
            <motion.div className="h-full rounded-full bg-white/85" initial={{ width: 0 }} animate={{ width: `${Math.min(util, 100)}%` }} transition={{ duration: 1, delay: 0.2 }} />
          </div>
          <p className="mt-1 text-[10px] text-white/60">{util.toFixed(0)}% of {card.limit ? inr(card.limit) : 'limit'} used</p>
        </div>
      )}
    </motion.button>
  )
}
