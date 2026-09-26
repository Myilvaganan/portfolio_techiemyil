import { useMemo, useState, type ReactNode } from 'react'
import { CalendarView } from '@/components/journal/CalendarView'
import { DayPanel } from '@/components/journal/DayPanel'
import { JournalDashboard } from '@/components/journal/JournalDashboard'
import { HideNumbersButton, JournalTabs, type Tab } from '@/components/journal/chrome'
import { useJournalBook } from '@/hooks/useJournalBook'
import { ALL_ACCOUNTS } from '@/lib/journal'
import { analyze } from '@/lib/journalAnalytics'

const noop = () => {}
const noopAsync = async () => {}

/** Options and every Forex account together: one big calendar and one dashboard, all in rupees. Read-only. */
export function AllJournal({ switcher }: { switcher: ReactNode }) {
  const b = useJournalBook(ALL_ACCOUNTS)
  const { today, month, selected, setSelected, goToMonth, stepDay, trades, byDate, settings, usdInr } = b
  const [tab, setTab] = useState<Tab>('calendar')
  const analytics = useMemo(() => analyze(trades, settings), [trades, settings])
  const tabs = <JournalTabs tab={tab} onChange={setTab} />

  const dayPanel = (
    <DayPanel date={selected} trades={byDate.get(selected) ?? []} note={undefined} settings={settings} readOnly onStep={stepDay} onAdd={noop} onEdit={noop} onDelete={noopAsync} onSaveNote={noopAsync} />
  )

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="font-display text-2xl font-semibold text-text">Trading Journal</h1>
            {switcher}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">Options and Forex together. Dollar trades are converted at ₹{usdInr.toFixed(2)} per $1. Add or edit trades in their own journal.</p>
        </div>
        <HideNumbersButton />
      </div>

      {tab === 'dashboard' ? (
        <JournalDashboard settings={settings} viewedMonth={month} today={today} refreshKey={b.refreshKey} account={ALL_ACCOUNTS} usdInr={usdInr} lead={tabs} />
      ) : (
        <CalendarView
          single
          analytics={analytics}
          settings={settings}
          month={month}
          byDate={byDate}
          selected={selected}
          today={today}
          loading={b.loading}
          error={b.error}
          onRetry={b.retry}
          onSelect={setSelected}
          dayPanel={dayPanel}
          onMonth={goToMonth}
          lead={tabs}
        />
      )}
    </div>
  )
}
