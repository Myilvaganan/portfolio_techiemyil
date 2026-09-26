import { useEffect, useMemo, useState } from 'react'
import { MonthNav } from '@/components/journal/chrome'
import { WEEKDAYS, monthGrid, monthOf, todayStr } from '@/lib/journal'
import { fmtDelta, fmtMetric, reportDate, type HealthReport } from '@/lib/health'
import { cn } from '@/lib/utils'

interface Props {
  /** Oldest first. */
  reports: HealthReport[]
  selectedId: string
  onSelect: (id: string) => void
}

/** A month grid with a mark on each day a body-composition test was taken: weight, body fat, and the change since the test before. */
export function ReportCalendar({ reports, selectedId, onSelect }: Props) {
  const today = useMemo(() => todayStr(), [])
  const selected = reports.find((r) => r.id === selectedId)
  const [month, setMonth] = useState(monthOf(selected ? reportDate(selected) : today))

  // Following the selection (e.g. choosing a report from the list below) keeps the calendar on the right month.
  useEffect(() => {
    if (selected) setMonth(monthOf(reportDate(selected)))
  }, [selected])

  const byDate = useMemo(() => {
    const map = new Map<string, { report: HealthReport; previous: HealthReport | null }>()
    reports.forEach((r, i) => {
      if (r.source === 'history' && r.values.weight === null) return
      map.set(reportDate(r), { report: r, previous: reports[i - 1] ?? null })
    })
    return map
  }, [reports])

  const weeks = useMemo(() => monthGrid(month), [month])
  const inMonth = [...byDate.keys()].filter((d) => d.startsWith(month)).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-secondary">{inMonth === 0 ? 'No tests this month' : `${inMonth} test${inMonth === 1 ? '' : 's'} this month`}</p>
        <MonthNav month={month} today={today} onMonth={setMonth} />
      </div>
      <div role="grid" aria-label="Body composition calendar" className="select-none">
        <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="text-center text-[10px] font-semibold uppercase tracking-wide text-text-secondary sm:text-[11px]">
              {d}
            </div>
          ))}
        </div>
        <div className="space-y-1 sm:space-y-1.5">
          {weeks.map((week) => (
            <div key={week[0].date} role="row" className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {week.map((cell) => {
                const hit = cell.inMonth ? byDate.get(cell.date) : undefined
                const delta = hit?.previous && hit.report.values.weight !== null && hit.previous.values.weight !== null ? hit.report.values.weight - hit.previous.values.weight : null
                const base = 'flex min-h-[54px] flex-col rounded-lg border p-1.5 text-left sm:min-h-[64px]'
                if (!hit) {
                  return (
                    <div key={cell.date} role="gridcell" className={cn(base, 'border-border bg-surface-2', !cell.inMonth && 'opacity-30', cell.date === today && 'ring-1 ring-accent/50')}>
                      <span className="text-[11px] text-text-secondary">{cell.day}</span>
                    </div>
                  )
                }
                const active = hit.report.id === selectedId
                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    data-cursor="hover"
                    aria-label={`Test on ${cell.date}`}
                    aria-selected={active}
                    onClick={() => onSelect(hit.report.id)}
                    className={cn(base, 'transition-colors hover:border-accent/60', active ? 'border-accent bg-accent/15' : 'border-accent/30 bg-accent/[0.06]')}
                  >
                    <span className="text-[11px] font-semibold text-accent">{cell.day}</span>
                    <span className="mt-auto font-mono text-xs font-semibold leading-tight text-text">{fmtMetric('weight', hit.report.values.weight)}</span>
                    <span className="truncate font-mono text-[10px] leading-tight text-text-secondary">
                      {hit.report.values.percentBodyFat !== null ? fmtMetric('percentBodyFat', hit.report.values.percentBodyFat) : ''}
                      {delta !== null && ` · ${fmtDelta('weight', delta)}`}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
