import { useMemo, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { taxHeading, type JournalSettings, type Trade } from '@/lib/journal'
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
}

/** The Calendar tab, shared by the options journal and every Forex account: month summary, calendar, and the day. */
export function CalendarView({ analytics, settings, month, byDate, selected, today, loading, error, onRetry, onSelect, onAdd, dayPanel, onMonth, lead, single = false }: Props) {
  const m = useMoney()
  // Matches Tailwind's `lg`: below it the day panel is off-screen, so a tapped date opens a pop-up instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [dayOpen, setDayOpen] = useState(false)
  const breachDates = useMemo(() => new Set(analytics.breaches.map((b) => b.date)), [analytics.breaches])
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
              {lead}
              <MonthNav month={month} today={today} onMonth={onMonth} />
            </div>
            <JournalCalendar month={month} byDate={byDate} settings={settings} selected={selected} today={today} breachDates={breachDates} onSelect={select} onAdd={onAdd} />
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
