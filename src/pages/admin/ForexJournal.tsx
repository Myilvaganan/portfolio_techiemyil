import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, Globe, Landmark, LineChart, Loader2, Plus, RefreshCw, Settings as SettingsIcon, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassCard } from '@/components/ui/GlassCard'
import { CalendarView } from '@/components/journal/CalendarView'
import { DayPanel } from '@/components/journal/DayPanel'
import { JournalDashboard } from '@/components/journal/JournalDashboard'
import { cn } from '@/lib/utils'
import { Mt5AccountCard } from '@/components/journal/Mt5AccountCard'
import { Mt5UploadDialog, type Mt5Imported } from '@/components/journal/Mt5UploadDialog'
import { SettingsDialog } from '@/components/journal/SettingsDialog'
import { TradeDialog } from '@/components/journal/TradeDialog'
import { HideNumbersButton, JournalTabs, pillClass, type Tab } from '@/components/journal/chrome'
import { Chip } from '@/components/journal/parts'
import { useJournalBook } from '@/hooks/useJournalBook'
import { blankTrade, monthOf, type JournalSettings, type Trade } from '@/lib/journal'
import { analyze } from '@/lib/journalAnalytics'
import { fetchAccounts, type Mt5Account } from '@/lib/journalStore'
import { CurrencyProvider } from '@/lib/privacy'

const ACTIVE_KEY = 'journal_mt5_account'

function readActive(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? ''
  } catch {
    return ''
  }
}

interface Landing {
  account: string
  /** The day to open on: the newest trading day in the report just uploaded. */
  date: string
  /** Changes on every upload, so uploading a report with the same latest day still reloads. */
  token: number
}

function Header({ switcher, actions, slim = false }: { switcher: ReactNode; actions?: ReactNode; slim?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-2xl font-semibold text-text">Trading Journal</h1>
          {switcher}
        </div>
        {!slim && <p className="mt-0.5 text-sm text-text-secondary">Your MetaTrader 5 trades, day by day — separate from the options journal.</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

function EmptyForex({ switcher, onUpload }: { switcher: ReactNode; onUpload: () => void }) {
  const points = [
    { icon: CalendarDays, title: 'A calendar of every closed trade', text: 'Daily profit and loss, with each position, its prices and how long you held it.' },
    { icon: Landmark, title: 'Your account at a glance', text: 'Account number, broker, balance, equity, deposits and your overall profit or loss.' },
    { icon: LineChart, title: 'The same dashboard', text: 'Win rate, drawdown, profit factor, tax before and after, and results by symbol.' },
  ]
  return (
    <div className="w-full space-y-4">
      <Header switcher={switcher} actions={<HideNumbersButton />} />
      <GlassCard hover={false} className="mx-auto max-w-3xl p-6 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Globe className="h-7 w-7" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold text-text">Add your MetaTrader 5 history</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-text-secondary">
          Upload the Trade History Report from MetaTrader 5 and your Forex, gold, index and crypto trades appear here on their own calendar.
        </p>
        <Button type="button" magnetic={false} onClick={onUpload} className="mt-5">
          <Upload className="h-4 w-4" /> Upload MT5 report
        </Button>
        <ul className="mt-8 grid gap-4 text-left sm:grid-cols-3">
          {points.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl border border-border bg-surface-2 p-3">
              <Icon className="h-4 w-4 text-accent" />
              <p className="mt-2 text-sm font-medium text-text">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{text}</p>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  )
}

export function ForexJournal({ switcher }: { switcher: ReactNode }) {
  const [accounts, setAccounts] = useState<Mt5Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [activeId, setActiveId] = useState(readActive)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [landing, setLanding] = useState<Landing | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetchAccounts()
      .then((list) => !cancelled && setAccounts(list))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Could not load your MT5 accounts.'))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const choose = useCallback((id: string) => {
    setActiveId(id)
    try {
      localStorage.setItem(ACTIVE_KEY, id)
    } catch {
      // The choice just won't survive a reload.
    }
  }, [])

  function handleImported(result: Mt5Imported) {
    choose(result.account)
    setAttempt((n) => n + 1)
    setLanding({ account: result.account, date: result.latestDate, token: Date.now() })
  }

  const dialog = <Mt5UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onImported={handleImported} />

  if (error) {
    return (
      <div className="w-full space-y-4">
        <Header switcher={switcher} />
        <GlassCard hover={false} className="flex flex-col items-center gap-3 p-10 text-center">
          <p className="max-w-md text-sm text-error">{error}</p>
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </GlassCard>
      </div>
    )
  }

  if (accounts === null) {
    return (
      <div className="w-full space-y-4">
        <Header switcher={switcher} />
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your MT5 accounts…
        </p>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <>
        <EmptyForex switcher={switcher} onUpload={() => setUploadOpen(true)} />
        {dialog}
      </>
    )
  }

  const active = accounts.find((a) => a.account === activeId) ?? accounts[0]
  return (
    <>
      <ForexWorkspace
        // A different account is a different calendar: start it fresh.
        key={active.account}
        account={active}
        accounts={accounts}
        onSelectAccount={choose}
        onUpload={() => setUploadOpen(true)}
        switcher={switcher}
        landing={landing?.account === active.account ? landing : null}
      />
      {dialog}
    </>
  )
}

function ForexWorkspace({
  account,
  accounts,
  onSelectAccount,
  onUpload,
  switcher,
  landing,
}: {
  account: Mt5Account
  accounts: Mt5Account[]
  onSelectAccount: (id: string) => void
  onUpload: () => void
  switcher: ReactNode
  landing: Landing | null
}) {
  const b = useJournalBook(account.account)
  const { today, month, selected, setSelected, goToMonth, stepDay, byDate, days, trades, usdInr } = b
  const currency = account.currency || 'USD'

  const [tab, setTab] = useState<Tab>('calendar')
  const [tradeDialog, setTradeDialog] = useState<{ open: boolean; trade: Trade | null }>({ open: false, trade: null })
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Open on the newest trading day rather than an empty "today", and again after each upload.
  const openOn = landing?.date || account.report.to
  const reloadToken = landing?.token
  const { reload } = b
  useEffect(() => {
    if (!openOn) return
    goToMonth(monthOf(openOn))
    setSelected(openOn)
    if (reloadToken) reload()
    // goToMonth/setSelected/reload are stable; the trigger is a new landing day or upload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOn, reloadToken])

  // Rupee-based limits mean nothing in dollars, and the deposits are the account's real starting capital.
  const netDeposits = useMemo(() => account.balanceOps.filter((o) => o.type === 'balance').reduce((s, o) => s + o.amount, 0), [account.balanceOps])
  const settings = useMemo<JournalSettings>(() => ({ ...b.settings, startingCapital: netDeposits, dailyLossLimit: 0 }), [b.settings, netDeposits])
  const analytics = useMemo(() => analyze(trades, settings), [trades, settings])
  const knownInstruments = useMemo(() => [...new Set(['Forex', 'Bitcoin', 'XAUUSD', 'US30', ...trades.map((t) => t.instrument)])], [trades])
  const knownStrategies = useMemo(() => [...new Set(trades.map((t) => t.strategy).filter(Boolean))], [trades])

  const openAdd = (date: string = selected) => {
    setSelected(date)
    // Amounts on an account are already in the account's currency, so there is nothing to convert.
    setTradeDialog({ open: true, trade: { ...blankTrade(date, account.account), currency: 'USD', fxRate: 1 } })
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

  // The account card (and the account chips, when there are several) sit above the calendar, so leave room for them.
  const chrome = accounts.length > 1 ? '27rem' : '23.5rem'

  return (
    <CurrencyProvider value={currency}>
      <div className={cn('w-full', tab === 'dashboard' ? 'space-y-3' : 'space-y-4')} style={{ '--journal-chrome': chrome, '--dash-list': '124px' } as CSSProperties}>
        <Header
          slim={tab === 'dashboard'}
          switcher={switcher}
          actions={
            <>
              <HideNumbersButton />
              <button type="button" data-cursor="hover" aria-label="Journal settings" onClick={() => setSettingsOpen(true)} className={pillClass}>
                <SettingsIcon className="h-3.5 w-3.5" /> Settings
              </button>
              <Button size="sm" magnetic={false} onClick={() => openAdd()} className="!h-9 !px-4 !text-xs">
                <Plus className="h-3.5 w-3.5" /> Add trade
              </Button>
            </>
          }
        />

        {accounts.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="MT5 account">
            {accounts.map((a) => (
              <Chip key={a.account} active={a.account === account.account} onClick={() => onSelectAccount(a.account)}>
                {a.name ? `${a.name} · ` : ''}
                {a.account}
              </Chip>
            ))}
            <Chip active={false} onClick={onUpload}>
              + Add account
            </Chip>
          </div>
        )}

        <Mt5AccountCard account={account} usdInr={usdInr} onUpload={onUpload} compact={tab === 'dashboard'} />

        {tab === 'dashboard' ? (
          <JournalDashboard settings={settings} viewedMonth={month} today={today} refreshKey={b.refreshKey} lead={tabs} account={account.account} />
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
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={b.settings} knownInstruments={knownInstruments} onSave={b.handleSaveSettings} />
      </div>
    </CurrencyProvider>
  )
}
