import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WEEKDAYS, dateLabel, monthGrid, totalsOf, type JournalSettings, type Trade } from '@/lib/journal'
import { useMoney } from '@/lib/privacy'
import { tone } from './parts'

interface Props {
  month: string
  byDate: Map<string, Trade[]>
  settings: JournalSettings
  selected: string
  today: string
  /** Dates that broke the daily loss limit or trade cap. */
  breachDates: Set<string>
  /** Dates that have a saved day note, shown as a small dot. */
  noteDates?: Set<string>
  onSelect: (date: string) => void
  /** Add a trade on this date (the hover “+”, or double-clicking the date). */
  onAdd?: (date: string) => void
}

// A colour wash whose strength follows the day's result relative to the month's biggest move.
function wash(net: number, maxAbs: number) {
  if (net === 0 || maxAbs === 0) return undefined
  const pct = Math.round(10 + 34 * Math.min(1, Math.abs(net) / maxAbs))
  return `color-mix(in srgb, var(${net > 0 ? '--color-positive' : '--color-error'}) ${pct}%, transparent)`
}

export function JournalCalendar({ month, byDate, settings, selected, today, breachDates, noteDates, onSelect, onAdd }: Props) {
  const m = useMoney()
  const weeks = useMemo(() => monthGrid(month), [month])

  const days = useMemo(() => {
    const map = new Map<string, { net: number; trades: number }>()
    for (const [date, list] of byDate) {
      if (date.startsWith(month)) map.set(date, { net: totalsOf(list, settings).net, trades: list.length })
    }
    return map
  }, [byDate, month, settings])

  const maxAbs = Math.max(0, ...[...days.values()].map((d) => Math.abs(d.net)))

  return (
    <div role="grid" aria-label="Trading calendar" className="select-none">
      <div className="mb-1.5 grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.15fr)] gap-1 sm:gap-1.5">
        {[...WEEKDAYS, 'Week'].map((d) => (
          <div key={d} role="columnheader" className="text-center text-[10px] font-semibold uppercase tracking-wide text-text-secondary sm:text-[11px]">
            {d}
          </div>
        ))}
      </div>

      <div className="space-y-1 sm:space-y-1.5">
        {weeks.map((week) => {
          const inMonth = week.filter((c) => c.inMonth).map((c) => days.get(c.date)).filter((d): d is { net: number; trades: number } => Boolean(d))
          const weekNet = inMonth.reduce((s, d) => s + d.net, 0)
          const weekTrades = inMonth.reduce((s, d) => s + d.trades, 0)
          return (
            <div key={week[0].date} role="row" className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.15fr)] gap-1 sm:gap-1.5">
              {week.map((cell) => {
                const d = days.get(cell.date)
                const isSelected = cell.date === selected
                return (
                  <div key={cell.date} role="gridcell" aria-selected={isSelected} className="group relative">
                    <button
                      type="button"
                      data-cursor="hover"
                      disabled={!cell.inMonth}
                      aria-label={`${dateLabel(cell.date)}: ${d ? `${d.trades} trade${d.trades === 1 ? '' : 's'}, net ${m.signed(d.net)}` : 'no trades'}`}
                      onClick={() => onSelect(cell.date)}
                      onDoubleClick={() => cell.inMonth && onAdd?.(cell.date)}
                      style={{ background: d ? wash(d.net, maxAbs) : undefined }}
                      className={cn(
                        'relative flex h-full min-h-[58px] w-full flex-col rounded-lg border p-1 text-left transition-colors sm:min-h-[72px] sm:p-1.5 2xl:min-h-[72px]',
                        !cell.inMonth && 'cursor-default border-transparent opacity-25',
                        cell.inMonth && !isSelected && 'border-border bg-surface-2 hover:border-accent/50',
                        isSelected && 'border-accent ring-1 ring-accent/60',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] sm:text-[11px]',
                          cell.date === today ? 'bg-accent font-bold text-[#05130a]' : 'text-text-secondary',
                        )}
                      >
                        {cell.day}
                      </span>
                      {breachDates.has(cell.date) && (
                        <span title="Risk rule broken" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-error" aria-label="Risk rule broken" />
                      )}
                      {noteDates?.has(cell.date) && !breachDates.has(cell.date) && (
                        <span title="Day note saved" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label="Day note saved" />
                      )}
                      {d && (
                        <>
                          <span className={cn('mt-auto font-mono text-[11px] font-semibold leading-tight sm:text-sm', tone(d.net))}>{m.compact(d.net)}</span>
                          <span className="text-[9px] leading-tight text-text-secondary sm:text-[10px]">
                            {d.trades} trade{d.trades === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </button>
                    {cell.inMonth && onAdd && (
                      // A sibling of the date button (not inside it — buttons can't nest). Appears on hover or keyboard focus.
                      <button
                        type="button"
                        data-cursor="hover"
                        aria-label={`Add trade on ${dateLabel(cell.date)}`}
                        title="Add a trade on this day"
                        onClick={() => onAdd(cell.date)}
                        className="absolute bottom-1 right-1 hidden h-5 w-5 items-center justify-center rounded-full bg-accent text-[#05130a] opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )
              })}

              <div role="gridcell" className="flex min-h-[58px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-1 text-center sm:min-h-[72px] 2xl:min-h-[72px]">
                {weekTrades > 0 ? (
                  <>
                    <span className={cn('font-mono text-[11px] font-semibold sm:text-sm', tone(weekNet))}>{m.compact(weekNet)}</span>
                    <span className="text-[9px] text-text-secondary sm:text-[10px]">{weekTrades} trades</span>
                  </>
                ) : (
                  <span className="text-[10px] text-text-secondary/50">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
