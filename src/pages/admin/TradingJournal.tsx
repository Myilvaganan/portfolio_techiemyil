import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Calculator, DatabaseZap, Plus, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { BackfillDialog, type ImportSummary } from '@/components/journal/BackfillDialog'
import { CalendarView } from '@/components/journal/CalendarView'
import { DayPanel } from '@/components/journal/DayPanel'
import { JournalDashboard } from '@/components/journal/JournalDashboard'
import { PositionSizeDialog } from '@/components/journal/PositionSizeDialog'
import { SettingsDialog } from '@/components/journal/SettingsDialog'
import { TradeDialog } from '@/components/journal/TradeDialog'
import { ZerodhaSyncDialog } from '@/components/journal/ZerodhaSyncDialog'
import { BookSwitch, HideNumbersButton, JournalTabs, pillClass, type Book, type Tab } from '@/components/journal/chrome'
import { blankTrade, monthOf, todayStr, type Trade } from '@/lib/journal'
import { analyze } from '@/lib/journalAnalytics'
import { getKiteSession } from '@/lib/kite'
import { syncZerodhaToJournal, type SyncResult } from '@/lib/kiteSync'
import { useBackfillStatus } from '@/hooks/useBackfillStatus'
import { useJournalBook } from '@/hooks/useJournalBook'
import { AllJournal } from './AllJournal'
import { ForexJournal } from './ForexJournal'

const BOOK_KEY = 'journal_book'

function readBook(): Book {
  try {
    const v = localStorage.getItem(BOOK_KEY)
    return v === 'forex' || v === 'options' ? v : 'all'
  } catch {
    return 'all'
  }
}

/** The Trading Journal: two separate journals — Options (India) and Forex (MetaTrader 5) — behind one switch. */
export function TradingJournal() {
  const { search } = useLocation()
  const linkedBook = new URLSearchParams(search).get('book')
  const [book, setBook] = useState<Book>(() => linkedBook === 'options' || linkedBook === 'forex' ? linkedBook : readBook())
  useEffect(() => {
    if (linkedBook === 'options' || linkedBook === 'forex' || linkedBook === 'all') setBook(linkedBook)
  }, [linkedBook, search])

  function choose(next: Book) {
    setBook(next)
    try {
      localStorage.setItem(BOOK_KEY, next)
    } catch {
      // The choice just won't survive a reload.
    }
  }

  const switcher = <BookSwitch value={book} onChange={choose} />
  if (book === 'forex') return <ForexJournal switcher={switcher} />
  if (book === 'all') return <AllJournal switcher={switcher} />
  return <OptionsJournal switcher={switcher} />
}

function OptionsJournal({ switcher }: { switcher: ReactNode }) {
  const { search } = useLocation()
  const b = useJournalBook('')
  const { today, month, selected, setSelected, goToMonth, stepDay, trades, days, byDate, settings, usdInr } = b

  const [tab, setTab] = useState<Tab>('calendar')
  useEffect(() => { if (new URLSearchParams(search).has('date')) setTab('calendar') }, [search])
  const [tradeDialog, setTradeDialog] = useState<{ open: boolean; trade: Trade | null }>({ open: false, trade: null })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [backfillCheck, setBackfillCheck] = useState(0)
  const [zerodhaOpen, setZerodhaOpen] = useState(false)
  const [sizerOpen, setSizerOpen] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const { reload } = b
  useEffect(() => {
    let cancelled = false
    let busy = false
    const sync = async () => {
      if (busy || document.visibilityState === 'hidden' || !getKiteSession()) return
      busy = true
      try {
        const result = await syncZerodhaToJournal(todayStr())
        if (!cancelled) {
          setSyncError(null)
          if (result.tradesAdded) {
            reload()
            setBackfillCheck((n) => n + 1)
          }
        }
      } catch (err) {
        if (!cancelled) setSyncError(err instanceof Error ? err.message : 'Zerodha auto-sync failed. Try Sync Zerodha.')
      } finally { busy = false }
    }
    void sync()
    const timer = window.setInterval(() => void sync(), 5 * 60_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [today, reload])

  // Once the month has loaded, quietly see whether Options Analytics has trades the journal is missing.
  const backfill = useBackfillStatus(today, !b.loading && !b.error, backfillCheck)

  const analytics = useMemo(() => analyze(trades, settings), [trades, settings])
  const knownInstruments = useMemo(() => [...new Set(trades.map((t) => t.instrument))], [trades])
  const knownStrategies = useMemo(() => [...new Set(trades.map((t) => t.strategy).filter(Boolean))], [trades])

  const openAdd = (date: string = selected) => {
    setSelected(date)
    setTradeDialog({ open: true, trade: blankTrade(date) })
  }

  // After a backfill, jump to the month of the newest imported trade so the result is visible straight away.
  function handleImported(summary: ImportSummary) {
    b.reload()
    setBackfillCheck((n) => n + 1)
    if (summary.added > 0 && summary.latestDate) goToMonth(monthOf(summary.latestDate))
  }

  // After a Zerodha sync: reload, refresh the badge, and open the day the newest trade landed on.
  function handleSynced(result: SyncResult) {
    b.reload()
    setBackfillCheck((n) => n + 1)
    if (result.tradesAdded > 0 && result.latestDate) {
      goToMonth(monthOf(result.latestDate))
      setSelected(result.latestDate)
    }
  }

  const tabs = <JournalTabs tab={tab} onChange={setTab} />

  const dayPanel = (
    <DayPanel
      onStep={stepDay}
      date={selected}
      trades={byDate.get(selected) ?? []}
      note={days[selected]}
      settings={settings}
      onAdd={() => openAdd()}
      onEdit={(trade) => setTradeDialog({ open: true, trade })}
      onDelete={b.handleDeleteTrade}
      onSaveNote={b.handleSaveNote}
    />
  )

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="page-title">Trading Journal</h1>
            {switcher}
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">Log every trade, review every day, and see what you really keep after tax.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HideNumbersButton />
          <button type="button" data-cursor="hover" onClick={() => setZerodhaOpen(true)} title="Fetch today’s options trades from Zerodha and add them to the journal" className={pillClass}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync Zerodha
            {getKiteSession() && <span className="h-2 w-2 rounded-full bg-positive" title="Zerodha is connected" aria-label="Zerodha connected" />}
          </button>
          <button
            type="button"
            data-cursor="hover"
            onClick={() => setBackfillOpen(true)}
            title={backfill.newCount > 0 ? `${backfill.newCount} trades in Options Analytics aren’t in your journal yet` : 'Copy your closed trades from Options Analytics into the journal'}
            className={pillClass}
          >
            <DatabaseZap className="h-3.5 w-3.5" /> Import from Options
            {backfill.newCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-2xs font-bold leading-none text-[#05130a]" aria-label={`${backfill.newCount} new trades`}>
                {backfill.newCount} new
              </span>
            )}
            {backfill.outdatedCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title="Some earlier imports no longer match Options Analytics" aria-label="Some earlier imports need checking" />}
          </button>
          <button type="button" data-cursor="hover" aria-label="Journal settings" onClick={() => setSettingsOpen(true)} className={pillClass}>
            <SettingsIcon className="h-3.5 w-3.5" /> Settings
          </button>
          <button type="button" data-cursor="hover" title="Size a trade to a risk %" onClick={() => setSizerOpen(true)} className={pillClass}>
            <Calculator className="h-3.5 w-3.5" /> Position size
          </button>
          <Button size="sm" magnetic={false} onClick={() => openAdd()} className="!h-9 !px-4 !text-xs">
            <Plus className="h-3.5 w-3.5" /> Add trade
          </Button>
        </div>
      </div>

      {syncError && <p role="alert" className="text-sm text-error">{syncError}</p>}
      {tab === 'dashboard' ? (
        <JournalDashboard settings={settings} viewedMonth={month} today={today} refreshKey={b.refreshKey} lead={tabs} />
      ) : (
        <CalendarView
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
          onAdd={openAdd}
          dayPanel={dayPanel}
            onMonth={goToMonth}
            lead={tabs}
            days={days}
        />
      )}

      <TradeDialog
        open={tradeDialog.open}
        onOpenChange={(open) => setTradeDialog((prev) => ({ ...prev, open }))}
        trade={tradeDialog.trade}
        settings={settings}
        usdInr={usdInr}
        knownInstruments={knownInstruments}
        knownStrategies={knownStrategies}
        onSave={b.handleSaveTrade}
      />
      <ZerodhaSyncDialog open={zerodhaOpen} onOpenChange={setZerodhaOpen} asOf={today} onSynced={handleSynced} />
      <BackfillDialog
        open={backfillOpen}
        onOpenChange={(open) => {
          setBackfillOpen(open)
          // Recheck on close: the trades may have changed while it was open, and this clears the badge after an import.
          if (!open) setBackfillCheck((n) => n + 1)
        }}
        asOf={today}
        onImported={handleImported}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} knownInstruments={knownInstruments} onSave={b.handleSaveSettings} />
      <PositionSizeDialog open={sizerOpen} onOpenChange={setSizerOpen} />
    </div>
  )
}
