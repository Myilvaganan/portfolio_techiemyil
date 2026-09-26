import type { ReactNode } from 'react'
import { BarChart3, ChevronLeft, LayoutDashboard, ChevronRight, Eye, EyeOff, Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { monthLabel, monthOf, shiftMonth } from '@/lib/journal'
import { usePrivacy } from '@/lib/privacy'
import { labelClass } from './parts'

// The controls both journals share, so the Options and Forex pages look and behave identically.

export const pillClass =
  'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text'

export function HideNumbersButton() {
  const { hidden, toggle } = usePrivacy()
  return (
    <button
      type="button"
      data-cursor="hover"
      aria-pressed={hidden}
      aria-label={hidden ? 'Show numbers' : 'Hide numbers'}
      title={hidden ? 'Show numbers' : 'Hide numbers (show stars)'}
      onClick={toggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition-colors',
        hidden ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/40 hover:text-text',
      )}
    >
      {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {hidden ? 'Numbers hidden' : 'Hide numbers'}
    </button>
  )
}

export type Book = 'options' | 'forex' | 'all'

const BOOKS: { id: Book; label: string; hint: string; icon: typeof BarChart3 }[] = [
  { id: 'all', label: 'All', hint: 'Combined · ₹', icon: LayoutDashboard },
  { id: 'options', label: 'Options', hint: 'India · ₹', icon: BarChart3 },
  { id: 'forex', label: 'Forex', hint: 'MetaTrader 5', icon: Globe },
]

/** Which journal is open. Each is its own calendar, dashboard and set of trades. */
export function BookSwitch({ value, onChange }: { value: Book; onChange: (book: Book) => void }) {
  return (
    <div role="tablist" aria-label="Journal" className="inline-flex overflow-hidden rounded-full border border-border bg-surface-2 p-0.5 text-sm">
      {BOOKS.map(({ id, label, hint, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          data-cursor="hover"
          onClick={() => onChange(id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors',
            value === id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          <span className={cn('hidden text-[11px] font-normal sm:inline', value === id ? 'text-accent/70' : 'text-text-secondary/60')}>{hint}</span>
        </button>
      ))}
    </div>
  )
}

export type Tab = 'calendar' | 'dashboard'

export function JournalTabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Journal sections" className="inline-flex overflow-hidden rounded-full border border-border text-sm">
      {(['calendar', 'dashboard'] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          data-cursor="hover"
          onClick={() => onChange(id)}
          className={cn('px-4 py-1.5 capitalize transition-colors', tab === id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}
        >
          {id}
        </button>
      ))}
    </div>
  )
}

export function MonthNav({ month, today, onMonth }: { month: string; today: string; onMonth: (month: string) => void }) {
  const nav = 'rounded-full border border-border p-1.5 text-text-secondary hover:border-accent/40 hover:text-text'
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" data-cursor="hover" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))} className={nav}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9.5rem] text-center font-display text-sm font-semibold text-text">{monthLabel(month)}</span>
      <button type="button" data-cursor="hover" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))} className={nav}>
        <ChevronRight className="h-4 w-4" />
      </button>
      <Button variant="secondary" size="sm" magnetic={false} onClick={() => onMonth(monthOf(today))} className="!h-8 !px-3 !text-xs">
        Today
      </Button>
    </div>
  )
}

// @container lets the value size itself to the tile (cqw), so "-$1,179.75" shrinks to fit rather than being clipped, and
// pushing it to the bottom keeps the values level when one label wraps onto two lines.
export function SummaryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="@container flex min-w-0 flex-col rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className={labelClass}>{label}</p>
      <p className="mt-auto whitespace-nowrap pt-0.5 text-[length:min(1rem,15cqw)] font-semibold leading-tight">{children}</p>
    </div>
  )
}
