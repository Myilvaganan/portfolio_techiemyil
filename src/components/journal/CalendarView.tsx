import { useMemo, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { dateLabel, monthOf, taxHeading, type DayNote, type JournalSettings, type Trade } from '@/lib/journal'
import type { Analytics } from '@/lib/journalAnalytics'
import { useMoney } from '@/lib/privacy'
import { DayDialog } from './DayDialog'
import { JournalCalendar } from './JournalCalendar'
import { MonthNav, SummaryTile } from './chrome'
import { Amount } from './parts'

interface Props {
  analytics: Analytics
  settings: JournalSettings
  month: string
  byDate: Map<string, Trade[]>
  selected: string
  today: string
  loading: boolean
  error: string | null
  onRetry: () => void
  onSelect: (date: string) => void
  onAdd?: (date: string) => void
  /** The selected day's trades and notes. Shown beside the calendar on large screens, in a pop-up on phones. */
  dayPanel: ReactNode
  onMonth: (month: string) => void
  /** The page's Calendar/Dashboard switcher, drawn at the start of the calendar's own header. */
  lead?: ReactNode
  /** The day panel is a single card (the combined view), so the layout is two columns rather than three on very wide screens. */
  single?: boolean
  /** This account's day notes, keyed by date — used for the note dot and the search box. */
  days?: Record<string, DayNote>
}

interface SearchHit {
  date: string
  label: string
}

/** Matches the loaded month's trades and day notes against a free-text query (instrument, strategy, tags, notes). */
function searchHits(query: string, byDate: Map<string, Trade[]>, days: Record<string, DayNote>): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const dates = new Set<string>()
  for (const [date, trades] of byDate) {
    const hay = trades.map((t) => [t.instrument, t.strategy, t.notes, ...t.tags].join(' ')).join(' ').toLowerCase()
    if (hay.includes(q)) dates.add(date)
  }
  for (const [date, note] of Object.entries(days)) {
    const hay = [note.bias, note.plan, note.review, note.lessons].join(' ').toLowerCase()
    if (hay.includes(q)) dates.add(date)
  }
  return [...dates].sort().map((date) => ({ date, label: dateLabel(date) }))
}

function CalendarSearch({ byDate, days, onJump }: { byDate: Map<string, Trade[]>; days: Record<string, DayNote>; onJump: (date: string) => void }) {
  const [query, setQuery] = useState('')
  const hits = useMemo(() => searchHits(query, byDate, days), [query, byDate, days])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
        <input
          type="search"
          aria-label="Search this month's trades and notes"
          placeholder="Search instrument, tag, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-44 rounded-full border border-border bg-surface-2 py-1.5 pl-8 pr-7 text-xs text-text outline-none transition-colors placeholder:text-text-secondary/60 focus:border-accent/50 sm:w-56"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {query && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
          {hits.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-text-secondary">No matches this month.</p>
          ) : (
            hits.map((h) => (
              <button
                key={h.date}
                type="button"
                data-cursor="hover"
                onClick={() => {
                  onJump(h.date)
                  setQuery('')
                }}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-text hover:bg-surface-2"
              >
                {h.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** The Calendar tab, shared by the options journal and every Forex account: month summary, calendar, and the day. */
export function CalendarView({ analytics, settings, month, byDate, selected, today, loading, error, onRetry, onSelect, onAdd, dayPanel, onMonth, lead, single = false, days = {} }: Props) {
  const m = useMoney()
  // Matches Tailwind's `lg`: below it the day panel is off-screen, so a tapped date opens a pop-up instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [dayOpen, setDayOpen] = useState(false)
  const breachDates = useMemo(() => new Set(analytics.breaches.map((b) => b.date)), [analytics.breaches])
  const noteDates = useMemo(() => new Set(Object.keys(days).filter((d) => monthOf(d) === month)), [days, month])
  const t = analytics.totals

  const select = (date: string) => {
    onSelect(date)
    if (!isDesktop) setDayOpen(true)
  }

  if (error) {
    return (
      <GlassCard hover={false} className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="max-w-md text-sm text-error">{error}</p>
        <Button size="sm" variant="secondary" magnetic={false} onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      </GlassCard>
    )
  }

  return (
    <>
      <div className={cn('grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]', !single && '2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]')}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryTile label="Before tax">
              <Amount value={t.net} />
            </SummaryTile>
            <SummaryTile label={taxHeading(settings)}>
              <span className="font-mono text-amber-500">{t.tax > 0 ? `-${m.inr(t.tax)}` : m.inr(0)}</span>
            </SummaryTile>
            <SummaryTile label="After tax">
              <Amount value={t.afterTax} />
            </SummaryTile>
            <SummaryTile label="Trades">
              <span className="font-mono">{t.trades}</span>
            </SummaryTile>
            <SummaryTile label="Win rate">
              <span className="font-mono">{t.trades ? `${analytics.winRate.toFixed(0)}%` : '—'}</span>
            </SummaryTile>
          </div>

          <GlassCard hover={false} className="relative p-3 sm:p-4">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-card/60 backdrop-blur-[1px]" role="status" aria-label="Loading month">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-3">
                {lead}
                <CalendarSearch byDate={byDate} days={days} onJump={select} />
              </div>
              <MonthNav month={month} today={today} onMonth={onMonth} />
            </div>
            <JournalCalendar month={month} byDate={byDate} settings={settings} selected={selected} today={today} breachDates={breachDates} noteDates={noteDates} onSelect={select} onAdd={onAdd} />
          </GlassCard>
        </div>

        {isDesktop && (
          // lg: one scrolling column beside the calendar. 2xl: `contents` lets the two cards become their own columns.
          <div className="min-h-0 space-y-4 lg:max-h-[max(28rem,calc(100vh-var(--journal-chrome,16.5rem)))] lg:overflow-y-auto 2xl:contents">{dayPanel}</div>
        )}
      </div>

      {!isDesktop && (
        <DayDialog open={dayOpen} onOpenChange={setDayOpen} date={selected}>
          {dayPanel}
        </DayDialog>
      )}
    </>
  )
}
