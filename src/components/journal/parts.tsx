import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { FitValue } from '@/components/viz/FitValue'
import { cn } from '@/lib/utils'
import { IconBadge } from '@/components/ui/Avatar'
import { kpiIcon } from '@/components/ui/kpiIcon'
import { useMoney } from '@/lib/privacy'

export const inputClass =
  'w-full min-w-0 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-text outline-none transition-colors placeholder:text-text-secondary/50 focus:border-accent/50'

export const labelClass = 'label-caps'

export const tone = (n: number) => (n > 0 ? 'text-positive' : n < 0 ? 'text-error' : 'text-text-secondary')

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal text-text-secondary/60">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{children}</h2>
      {aside}
    </div>
  )
}

export function Kpi({
  label,
  value,
  fit,
  sub,
  valueClassName,
  className,
}: {
  label: string
  value: ReactNode
  /** The plain text of `value`, used to size it to the card. */
  fit: string
  sub?: ReactNode
  valueClassName?: string
  className?: string
}) {
  return (
    <GlassCard hover={false} className={cn('p-3 sm:p-4 xl:p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass}>{label}</p>
        <IconBadge icon={kpiIcon(label)} seed={label} size="sm" className="h-7 w-7 rounded-lg" />
      </div>
      <FitValue max={22} text={fit} className={cn('mt-1.5 whitespace-nowrap font-mono font-semibold leading-tight text-text', valueClassName)}>
        {value}
      </FitValue>
      {sub && <p className="mt-1 text-2xs leading-snug text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

/** A rupee amount, coloured by sign and starred out in hidden mode. */
// `decimals` is left undefined by default so each currency picks its own: whole rupees, but dollars with cents.
export function Amount({ value, signed = true, decimals, className }: { value: number; signed?: boolean; decimals?: number; className?: string }) {
  const m = useMoney()
  return <span className={cn('whitespace-nowrap font-mono', signed && tone(value), className)}>{signed ? m.signed(value, decimals) : m.inr(value, decimals)}</span>
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border bg-surface-2 text-text-secondary hover:border-accent/40 hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

/** 1–5 stars; clicking the current rating clears it back to 0 (unrated). */
export function StarRating({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          data-cursor="hover"
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={n <= value}
          onClick={() => onChange(n === value ? 0 : n)}
          className="p-0.5"
        >
          <Star className={cn('h-4 w-4 transition-colors', n <= value ? 'fill-amber-400 text-amber-400' : 'text-text-secondary/40')} />
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-text-secondary">{children}</p>
}
