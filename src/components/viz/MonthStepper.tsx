import { ChevronLeft, ChevronRight } from 'lucide-react'
import { haptic } from '@/lib/native'

const shiftMonth = (m: string, n: number) => {
  const d = new Date(`${m}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}

/** ‹ September 2026 › — pick a month with one tap either way (no fiddly native picker). */
export function MonthStepper({ value, onChange, max }: { value: string; onChange: (m: string) => void; max?: string }) {
  const label = new Date(`${value}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const go = (n: number) => {
    haptic(6)
    onChange(shiftMonth(value, n))
  }
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface-2">
      <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="rounded-full p-1.5 text-text-secondary hover:text-text">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[8.5rem] text-center text-xs font-semibold text-text">{label}</span>
      <button type="button" aria-label="Next month" disabled={!!max && value >= max} onClick={() => go(1)} className="rounded-full p-1.5 text-text-secondary hover:text-text disabled:opacity-30">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
