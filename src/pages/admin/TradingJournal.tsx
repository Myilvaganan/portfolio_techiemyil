import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, DatabaseZap, Eye, EyeOff, Loader2, Plus, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { BackfillDialog, type ImportSummary } from '@/components/journal/BackfillDialog'
import { ZerodhaSyncDialog } from '@/components/journal/ZerodhaSyncDialog'
import { DayDialog } from '@/components/journal/DayDialog'
import { DayPanel } from '@/components/journal/DayPanel'
import { JournalCalendar } from '@/components/journal/JournalCalendar'
import { JournalDashboard } from '@/components/journal/JournalDashboard'
import { SettingsDialog } from '@/components/journal/SettingsDialog'
import { TradeDialog } from '@/components/journal/TradeDialog'
import { Amount, labelClass } from '@/components/journal/parts'
import {
  DEFAULT_SETTINGS,
  blankTrade,
  byWhen,
  groupByDate,
  monthLabel,
  monthOf,
  shiftMonth,
  taxHeading,
  todayStr,
  type DayNote,
  type JournalSettings,
  type Trade,
} from '@/lib/journal'
import { analyze } from '@/lib/journalAnalytics'
import { deleteTrade, fetchJournal, fetchSettings, saveDayNote, saveSettings, saveTrade } from '@/lib/journalStore'
import { fetchUsdInr } from '@/lib/livePrices'
import { FALLBACK_USD_INR } from '@/lib/margin'
import { getKiteSession } from '@/lib/kite'
import type { SyncResult } from '@/lib/kiteSync'
import { useMoney, usePrivacy } from '@/lib/privacy'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useBackfillStatus } from '@/hooks/useBackfillStatus'

type Tab = 'calendar' | 'dashboard'

function SummaryTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2">
      <p className={labelClass}>{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">{children}</p>
    </div>
  )
}

export function TradingJournal() {
  const today = useMemo(() => todayStr(), [])
  const m = useMoney()
  const { hidden, toggle } = usePrivacy()
  // Matches Tailwind's `lg`: below it the day panel is off-screen, so a tapped date opens a pop-up instead.
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [tab, setTab] = useState<Tab>('calendar')
  const [month, setMonth] = useState(monthOf(today))
  const [selected, setSelected] = useState(today)
  const [trades, setTrades] = useState<Trade[]>([])
  const [days, setDays] = useState<Record<string, DayNote>>({})
  const [settings, setSettings] = useState<JournalSettings>(DEFAULT_SETTINGS)
  const [usdInr, setUsdInr] = useState(FALLBACK_USD_INR)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tradeDialog, setTradeDialog] = useState<{ open: boolean; trade: Trade | null }>({ open: false, trade: null })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState(false)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [backfillCheck, setBackfillCheck] = useState(0)
  const [zerodhaOpen, setZerodhaOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchSettings()
      .then((s) => !cancelled && setSettings(s))
      .catch(() => {
        // The month load below surfaces connection problems; defaults keep the page usable meanwhile.
      })
    fetchUsdInr().then((rate) => !cancelled && rate && setUsdInr(rate))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchJournal(month, month)
      .then((data) => {
        if (cancelled) return
        setTrades(data.trades)
        setDays(data.days)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the journal.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [month, attempt])

  // Once the month has loaded, quietly see whether Options Analytics has trades the journal is missing.
  const backfill = useBackfillStatus(today, !loading && !error, backfillCheck)

  const byDate = useMemo(() => groupByDate(trades), [trades])
  const analytics = useMemo(() => analyze(trades, settings), [trades, settings])
  const breachDates = useMemo(() => new Set(analytics.breaches.map((b) => b.date)), [analytics.breaches])
  const knownInstruments = useMemo(() => [...new Set(trades.map((t) => t.instrument))], [trades])
  const knownStrategies = useMemo(() => [...new Set(trades.map((t) => t.strategy).filter(Boolean))], [trades])

  const goToMonth = useCallback(
    (next: string) => {
      setMonth(next)
      setSelected(next === monthOf(today) ? today : `${next}-01`)
    },
    [today],
  )

  const openAdd = (date: string = selected) => {
    setSelected(date)
    setTradeDialog({ open: true, trade: blankTrade(date) })
  }

  const selectDate = (date: string) => {
    setSelected(date)
    if (!isDesktop) setDayOpen(true)
  }

  async function handleSaveTrade(trade: Trade, previousDate?: string) {
    const saved = await saveTrade(trade, previousDate)
    setRefreshKey((k) => k + 1)
    if (monthOf(saved.date) !== month) {
      // Saved into another month: jump there so the trade is visible.
      setMonth(monthOf(saved.date))
      setSelected(saved.date)
      return
    }
    setTrades((prev) => [...prev.filter((t) => t.id !== saved.id), saved].sort(byWhen))
    setSelected(saved.date)
  }

  async function handleDeleteTrade(trade: Trade) {
    await deleteTrade(trade)
    setTrades((prev) => prev.filter((t) => t.id !== trade.id))
    setRefreshKey((k) => k + 1)
  }

  async function handleSaveNote(note: DayNote) {
    const saved = await saveDayNote(note)
    setDays((prev) => {
      const next = { ...prev }
      if (saved) next[saved.date] = saved
      else delete next[note.date]
      return next
    })
  }

  // After a backfill, jump to the month of the newest imported trade so the result is visible straight away.
  function handleImported(summary: ImportSummary) {
    setRefreshKey((k) => k + 1)
    setAttempt((n) => n + 1)
    setBackfillCheck((n) => n + 1)
    if (summary.added > 0 && summary.latestDate) goToMonth(monthOf(summary.latestDate))
  }

  // After a Zerodha sync: reload, refresh the badge, and open the day the newest trade landed on.
  function handleSynced(result: SyncResult) {
    setRefreshKey((k) => k + 1)
    setAttempt((n) => n + 1)
    setBackfillCheck((n) => n + 1)
    if (result.tradesAdded > 0 && result.latestDate) {
      goToMonth(monthOf(result.latestDate))
      setSelected(result.latestDate)
    }
  }

  async function handleSaveSettings(next: JournalSettings) {
    setSettings(await saveSettings(next))
  }

  const t = analytics.totals

  const dayPanel = (
    <DayPanel
      date={selected}
      trades={byDate.get(selected) ?? []}
      note={days[selected]}
      settings={settings}
      onAdd={() => openAdd()}
      onEdit={(trade) => setTradeDialog({ open: true, trade })}
      onDelete={handleDeleteTrade}
      onSaveNote={handleSaveNote}
    />
  )

  const tabs = (
  <div role="tablist" aria-label="Journal sections" className="inline-flex overflow-hidden rounded-full border border-border text-sm">
    {(['calendar', 'dashboard'] as const).map((id) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={tab === id}
        data-cursor="hover"
        onClick={() => setTab(id)}
        className={cn('px-4 py-1.5 capitalize transition-colors', tab === id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}
      >
        {id}
      </button>
    ))}
  </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold text-text">Trading Journal</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Log every trade, review every day, and see what you really keep after tax.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            data-cursor="hover"
            onClick={() => setZerodhaOpen(true)}
            title="Fetch today’s options trades from Zerodha and add them to the journal"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync Zerodha
            {getKiteSession() && <span className="h-2 w-2 rounded-full bg-positive" title="Zerodha is connected" aria-label="Zerodha connected" />}
          </button>
          <button
            type="button"
            data-cursor="hover"
            onClick={() => setBackfillOpen(true)}
            title={backfill.newCount > 0 ? `${backfill.newCount} trades in Options Analytics aren’t in your journal yet` : 'Copy your closed trades from Options Analytics into the journal'}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            <DatabaseZap className="h-3.5 w-3.5" /> Import from Options
            {backfill.newCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#05130a]" aria-label={`${backfill.newCount} new trades`}>
                {backfill.newCount} new
              </span>
            )}
            {backfill.outdatedCount > 0 && <span className="h-2 w-2 rounded-full bg-amber-500" title="Some earlier imports no longer match Options Analytics" aria-label="Some earlier imports need checking" />}
          </button>
          <button
            type="button"
            data-cursor="hover"
            aria-label="Journal settings"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Settings
          </button>
          <Button size="sm" magnetic={false} onClick={() => openAdd()} className="!h-9 !px-4 !text-xs">
            <Plus className="h-3.5 w-3.5" /> Add trade
          </Button>
        </div>
      </div>

      {tab === 'calendar' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {tabs}
          <div className="flex items-center gap-1.5">
            <button type="button" data-cursor="hover" aria-label="Previous month" onClick={() => goToMonth(shiftMonth(month, -1))} className="rounded-full border border-border p-1.5 text-text-secondary hover:border-accent/40 hover:text-text">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9.5rem] text-center font-display text-sm font-semibold text-text">{monthLabel(month)}</span>
            <button type="button" data-cursor="hover" aria-label="Next month" onClick={() => goToMonth(shiftMonth(month, 1))} className="rounded-full border border-border p-1.5 text-text-secondary hover:border-accent/40 hover:text-text">
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button variant="secondary" size="sm" magnetic={false} onClick={() => goToMonth(monthOf(today))} className="!h-8 !px-3 !text-xs">
              Today
            </Button>
          </div>
        </div>
      )}

      {tab === 'dashboard' ? (
        <JournalDashboard settings={settings} viewedMonth={month} today={today} refreshKey={refreshKey} lead={tabs} />
      ) : error ? (
        <GlassCard hover={false} className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="max-w-md text-sm text-error">{error}</p>
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
              <JournalCalendar month={month} byDate={byDate} settings={settings} selected={selected} today={today} breachDates={breachDates} onSelect={selectDate} onAdd={openAdd} />
            </GlassCard>
          </div>

          {isDesktop && (
            // lg: one scrolling column beside the calendar. 2xl: `contents` lets the two cards become their own columns.
            <div className="min-h-0 space-y-4 lg:max-h-[max(28rem,calc(100vh-16.5rem))] lg:overflow-y-auto 2xl:contents">
              {dayPanel}
            </div>
          )}
        </div>
      )}

      {!isDesktop && (
        <DayDialog open={dayOpen} onOpenChange={setDayOpen} date={selected}>
          {dayPanel}
        </DayDialog>
      )}

      <TradeDialog
        open={tradeDialog.open}
        onOpenChange={(open) => setTradeDialog((prev) => ({ ...prev, open }))}
        trade={tradeDialog.trade}
        settings={settings}
        usdInr={usdInr}
        knownInstruments={knownInstruments}
        knownStrategies={knownStrategies}
        onSave={handleSaveTrade}
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
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} knownInstruments={knownInstruments} onSave={handleSaveSettings} />
    </div>
  )
}
