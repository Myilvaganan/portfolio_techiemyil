import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FileClock, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { AreaChart } from '@/components/viz/charts'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { cn } from '@/lib/utils'
import { ALL_ACCOUNTS, RANGES, monthLabel, rangeFor, taxCaption, taxHeading, type JournalSettings, type Range, type Trade } from '@/lib/journal'
import { accountDrawdown, accountEquityCurve, analyze, buildInsights, type Slice } from '@/lib/journalAnalytics'
import { journalReport, journalTradesCsv } from '@/lib/journalReport'
import { fetchJournal } from '@/lib/journalStore'
import { useMoney } from '@/lib/privacy'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PnlBars, PnlColumns } from './charts'
import { Amount, Chip, Empty, Kpi, SectionTitle, tone } from './parts'
import { ReviewDialog } from './ReviewDialog'

const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const shortMonth = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

const INSIGHT_STYLE = {
  good: 'border-positive/30 bg-positive/10',
  bad: 'border-error/30 bg-error/10',
  warn: 'border-amber-500/30 bg-amber-500/10',
  info: 'border-border bg-surface-2',
} as const

interface Props {
  settings: JournalSettings
  viewedMonth: string
  today: string
  /** Bumped whenever a trade is added/edited/deleted so the dashboard reloads. */
  refreshKey: number
  /** The page's Calendar/Dashboard switcher, drawn at the start of the toolbar so it costs no extra row. */
  lead?: ReactNode
  /** Which journal: '' (default) is the main options journal, otherwise an MT5 account number. */
  account?: string
  /** INR per USD. With ALL_ACCOUNTS, MT5 (dollar) trades are converted at this rate so everything adds up in rupees. */
  usdInr?: number
  /** A Forex account's deposits/withdrawals, so the dashboard can chart equity against money actually put in. */
  balanceOps?: { time: string; amount: number }[]
}

const TIME_VIEWS = ['Hour', 'Weekday', 'Hold time'] as const
type TimeView = (typeof TIME_VIEWS)[number]

/** Win rate / net P&L by hour of day, weekday or hold-time bucket, switchable so one card covers all three. */
function TimeAnalysisCard({ byHour, byWeekday, byHoldBucket }: { byHour: Slice[]; byWeekday: Slice[]; byHoldBucket: Slice[] }) {
  const [view, setView] = useState<TimeView>('Weekday')
  const items = view === 'Hour' ? byHour : view === 'Weekday' ? byWeekday : byHoldBucket
  return (
    <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Time analysis</h2>
        <div className="flex gap-1">
          {TIME_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              data-cursor="hover"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn('rounded-full px-2 py-0.5 text-2xs transition-colors', view === v ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="xl:max-h-[var(--dash-list,150px)] xl:overflow-y-auto xl:pr-1">
        <PnlBars items={items} emptyText="Not enough data recorded yet." />
      </div>
    </GlassCard>
  )
}

/** Account equity vs money deposited, with drawdown from the equity peak — for a single Forex/MT5 account. */
function EquityVsDepositsCard({ trades, balanceOps }: { trades: Trade[]; balanceOps: { time: string; amount: number }[] }) {
  const m = useMoney()
  const wide = useMediaQuery('(min-width: 1280px)')
  const curve = useMemo(() => accountEquityCurve(trades, balanceOps), [trades, balanceOps])
  const { max, current } = useMemo(() => accountDrawdown(curve), [curve])
  return (
    <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
      <SectionTitle>Equity vs deposits · all history</SectionTitle>
      {curve.length === 0 ? (
        <Empty>No deposits or trades yet.</Empty>
      ) : (
        <>
          <AreaChart
            height={wide ? 104 : 190}
            labels={curve.map((p) => p.date.slice(5))}
            series={[
              { key: 'deposited', label: 'Deposited', color: 'var(--viz-2)', values: curve.map((p) => p.deposited) },
              { key: 'equity', label: 'Equity', color: 'var(--viz-1)', values: curve.map((p) => p.equity) },
            ]}
            format={m.signed}
            axisFormat={m.axis}
          />
          <p className="mt-1 flex flex-wrap items-center justify-center gap-3 text-2xs text-text-secondary">
            <span>
              Max drawdown <span className="font-mono font-semibold text-error">{m.inr(max.amount)}</span>
              {max.pct !== null && ` (${m.pct(max.pct)})`}
            </span>
            <span>
              Current <span className="font-mono font-semibold text-text">{m.inr(current)}</span>
            </span>
          </p>
        </>
      )}
    </GlassCard>
  )
}

export function JournalDashboard({ settings, viewedMonth, today, refreshKey, lead, account = '', usdInr = 1, balanceOps }: Props) {
  const m = useMoney()
  const wide = useMediaQuery('(min-width: 1280px)')
  const [range, setRange] = useState<Range>('all')
  const [trades, setTrades] = useState<Trade[]>([])
  const [equityTrades, setEquityTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const { from, to } = rangeFor(range, viewedMonth, today)
    setLoading(true)
    setError(null)
    const fullAccount = Boolean(account) && account !== ALL_ACCOUNTS && Boolean(balanceOps)
    fetchJournal(fullAccount ? undefined : from, fullAccount ? undefined : to, account)
      .then((data) => {
        if (cancelled) return
        setEquityTrades(data.trades)
        if (fullAccount) data = { ...data, trades: data.trades.filter((t) => (!from || t.date.slice(0, 7) >= from) && (!to || t.date.slice(0, 7) <= to)) }
        if (!cancelled) setTrades(account === ALL_ACCOUNTS ? data.trades.map((t) => (t.account ? { ...t, fxRate: usdInr } : t)) : data.trades)
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
  }, [range, viewedMonth, today, refreshKey, attempt, account, usdInr, balanceOps])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tr of trades) for (const g of tr.tags ?? []) counts.set(g, (counts.get(g) ?? 0) + 1)
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([g]) => g)
  }, [trades])
  useEffect(() => {
    if (tagFilter && !allTags.includes(tagFilter)) setTagFilter(null)
  }, [allTags, tagFilter])
  const filteredTrades = useMemo(() => (tagFilter ? trades.filter((tr) => (tr.tags ?? []).includes(tagFilter)) : trades), [trades, tagFilter])

  const a = useMemo(() => analyze(filteredTrades, settings), [filteredTrades, settings])
  const money = (n: number) => `${n < 0 ? '-' : ''}${m.inr(Math.abs(n))}`
  const insights = useMemo(() => buildInsights(a, settings, money), [a, settings, m]) // eslint-disable-line react-hooks/exhaustive-deps

  const rangeLabel = range === 'month' ? monthLabel(viewedMonth) : (RANGES.find((r) => r.id === range)?.label ?? '')
  const t = a.totals
  const hasData = t.trades > 0
  // A single Forex/MT5 account (not the main journal, not the combined "all accounts" view).
  const isForexAccount = Boolean(account) && account !== ALL_ACCOUNTS && Boolean(balanceOps)

  return (
    <div className="space-y-3 xl:space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {lead}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report period">
          {RANGES.map((r) => (
            <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
              {r.id === 'month' ? monthLabel(viewedMonth) : r.label}
            </Chip>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
            <Chip active={tagFilter === null} onClick={() => setTagFilter(null)}>
              All tags
            </Chip>
            {allTags.slice(0, 6).map((g) => (
              <Chip key={g} active={tagFilter === g} onClick={() => setTagFilter(tagFilter === g ? null : g)}>
                #{g}
              </Chip>
            ))}
          </div>
        )}
        <button type="button" data-cursor="hover" onClick={() => setReviewOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
          <FileClock className="h-3.5 w-3.5" /> Review
        </button>
        <ReportMenu
          className="ml-auto"
          filename="trading-journal-report"
          disabled={!hasData}
          report={() => journalReport(a, settings, rangeLabel, insights, m.currency)}
          csv={() => journalTradesCsv(filteredTrades, settings, m.currency)}
        />
      </div>

      {error ? (
        <GlassCard hover={false} className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-error">{error}</p>
          <Button size="sm" variant="secondary" magnetic={false} onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </GlassCard>
      ) : loading ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Building your report…
        </GlassCard>
      ) : !hasData ? (
        <GlassCard hover={false} className="p-6">
          <Empty>No trades in this period yet. Log a trade from the calendar and your dashboard will build itself.</Empty>
        </GlassCard>
      ) : (
        <>
          {/* Two compact KPI rows on wide screens; the three hero cards lead the first. */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
            <Kpi
              label="Net P&L · before tax"
              fit={m.signed(t.net)}
              value={<Amount value={t.net} />}
              sub={`Gross ${m.signed(t.gross)} − fees ${m.inr(t.fees)}`}
              className="col-span-2 border-accent/20"
            />
            <Kpi
              label={taxHeading(settings)}
              fit={`-${m.inr(t.tax)}`}
              value={<span className="text-amber-500">{t.tax > 0 ? `-${m.inr(t.tax)}` : m.inr(0)}</span>}
              sub={taxCaption(settings)}
              className="col-span-2"
            />
            <Kpi
              label="Net P&L · after tax"
              fit={m.signed(t.afterTax)}
              value={<Amount value={t.afterTax} />}
              sub={settings.startingCapital > 0 ? `${m.pct((t.afterTax / settings.startingCapital) * 100)} return on starting capital` : 'What you actually keep'}
              className="col-span-2 border-accent/40 bg-accent/5"
            />
            <Kpi label="Trades" fit={String(t.trades)} value={String(t.trades)} sub={`${t.wins}W · ${t.losses}L · ${a.days.length} days`} />
            <Kpi label="Win rate" fit={`${a.winRate.toFixed(1)}%`} value={`${a.winRate.toFixed(1)}%`} sub={`${a.greenDays} green · ${a.redDays} red days`} />

            <Kpi
              label="Profit factor"
              fit={a.profitFactor === null ? '∞' : a.profitFactor.toFixed(2)}
              value={a.profitFactor === null ? '∞' : a.profitFactor.toFixed(2)}
              valueClassName={a.profitFactor === null || a.profitFactor >= 1 ? 'text-positive' : 'text-error'}
              sub="Wins ÷ losses"
            />
            <Kpi label="Expectancy" fit={m.signed(a.expectancy)} value={<Amount value={a.expectancy} />} sub="Per trade" />
            <Kpi
              label="Avg win / loss"
              fit={`${m.inr(a.avgWin)}/${m.inr(a.avgLoss)}`}
              value={
                <>
                  <span className="text-positive">{m.inr(a.avgWin)}</span>
                  <span className="text-text-secondary"> / </span>
                  <span className="text-error">{m.inr(a.avgLoss)}</span>
                </>
              }
              sub={a.payoff === null ? 'Payoff —' : `Payoff ${a.payoff.toFixed(2)}`}
            />
            <Kpi
              label="Max drawdown"
              fit={`-${m.inr(a.maxDrawdown.amount)}`}
              value={<span className={a.maxDrawdown.amount > 0 ? 'text-error' : ''}>{a.maxDrawdown.amount > 0 ? `-${m.inr(a.maxDrawdown.amount)}` : m.inr(0)}</span>}
              sub={a.maxDrawdown.pct !== null ? `${m.pct(a.maxDrawdown.pct)} of peak` : 'Set capital for %'}
            />
            <Kpi label="Best day" fit={m.signed(a.bestDay?.net ?? 0)} value={a.bestDay ? <Amount value={a.bestDay.net} /> : '—'} sub={a.bestDay ? shortDate(a.bestDay.date) : 'No winning day'} />
            <Kpi label="Worst day" fit={m.signed(a.worstDay?.net ?? 0)} value={a.worstDay ? <Amount value={a.worstDay.net} /> : '—'} sub={a.worstDay ? shortDate(a.worstDay.date) : 'No losing day'} />
            <Kpi
              label="Streaks"
              fit={`${a.streaks.maxWin}W / ${a.streaks.maxLoss}L`}
              value={
                <>
                  <span className="text-positive">{a.streaks.maxWin}W</span>
                  <span className="text-text-secondary"> / </span>
                  <span className="text-error">{a.streaks.maxLoss}L</span>
                </>
              }
              sub={a.streaks.current.kind === 'none' ? 'Longest runs' : `Now ${a.streaks.current.length} ${a.streaks.current.kind}${a.streaks.current.length === 1 ? '' : 's'}`}
            />
            <Kpi label="Avg R" fit={a.avgR === null ? '—' : `${a.avgR.toFixed(2)}R`} value={a.avgR === null ? '—' : `${a.avgR >= 0 ? '+' : ''}${a.avgR.toFixed(2)}R`} valueClassName={a.avgR === null ? '' : tone(a.avgR)} sub="Needs a stop loss" />
          </div>

          <div className="grid gap-3 xl:grid-cols-4">
            <GlassCard hover={false} className="p-3 sm:p-4 xl:col-span-2 xl:p-3">
              <SectionTitle>Equity curve · cumulative P&amp;L</SectionTitle>
              <AreaChart
                height={wide ? 128 : 230}
                labels={a.equity.map((p) => shortDate(p.date))}
                series={[
                  { key: 'pre', label: 'Before tax', color: 'var(--viz-1)', values: a.equity.map((p) => p.pre) },
                  { key: 'post', label: 'After tax', color: 'var(--viz-3)', values: a.equity.map((p) => p.post) },
                ]}
                format={m.signed}
                axisFormat={m.axis}
              />
              <p className="mt-1 flex flex-wrap items-center justify-center gap-4 text-2xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--viz-1)' }} /> Before tax
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: 'var(--viz-3)' }} /> After tax
                </span>
              </p>
            </GlassCard>

            <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
              <SectionTitle>Monthly results</SectionTitle>
              <PnlColumns height={wide ? 104 : 190} rows={a.monthly.map((r) => ({ label: shortMonth(r.month), pre: r.net, post: r.afterTax }))} />
            </GlassCard>

            <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
              <SectionTitle aside={<Sparkles className="h-3.5 w-3.5 text-accent" />}>Coach insights</SectionTitle>
              {insights.length === 0 ? (
                <Empty>Log a few more trades to unlock insights.</Empty>
              ) : (
                <ul className="space-y-1.5 xl:max-h-[190px] xl:overflow-y-auto xl:pr-1">
                  {insights.map((i) => (
                    <li key={i.text} className={cn('rounded-lg border px-2.5 py-1.5 text-xs leading-snug text-text', INSIGHT_STYLE[i.tone])}>
                      {i.text}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              { title: 'By instrument', items: a.byInstrument },
              { title: 'By strategy', items: a.byStrategy },
            ].map((c) => (
              <GlassCard key={c.title} hover={false} className="p-3 sm:p-4 xl:p-3">
                <SectionTitle>{c.title}</SectionTitle>
                <div className="xl:max-h-[var(--dash-list,150px)] xl:overflow-y-auto xl:pr-1">
                  <PnlBars items={c.items} />
                </div>
              </GlassCard>
            ))}

            <TimeAnalysisCard byHour={a.byHour} byWeekday={a.byWeekday} byHoldBucket={a.byHoldBucket} />

            {isForexAccount ? (
              <EquityVsDepositsCard trades={equityTrades} balanceOps={balanceOps!} />
            ) : (
              <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
                <SectionTitle>By emotion</SectionTitle>
                <div className="xl:max-h-[var(--dash-list,150px)] xl:overflow-y-auto xl:pr-1">
                  <PnlBars items={a.byEmotion} />
                </div>
              </GlassCard>
            )}

            <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
              <SectionTitle>Discipline</SectionTitle>
              {a.discipline.followed.trades + a.discipline.broke.trades === 0 ? (
                <Empty>Mark “Did you follow your plan?” on trades to see what discipline is worth.</Empty>
              ) : (
                <div className="space-y-2 xl:max-h-[var(--dash-list,150px)] xl:overflow-y-auto xl:pr-1">
                  <PnlBars items={[a.discipline.followed, a.discipline.broke].filter((s) => s.trades > 0)} />
                  <p className="text-2xs leading-snug text-text-secondary">
                    Per trade: <span className="text-positive">{m.inr(a.discipline.followed.avgNet)}</span> on plan, <span className="text-error">{m.inr(a.discipline.broke.avgNet)}</span> off plan.
                  </p>
                </div>
              )}
            </GlassCard>

            <GlassCard hover={false} className="p-3 sm:p-4 xl:p-3">
              <SectionTitle>Cost of mistakes</SectionTitle>
              {a.mistakes.length === 0 ? (
                <Empty>Tag mistakes on trades to see what they cost.</Empty>
              ) : (
                <ul className="space-y-1.5 xl:max-h-[var(--dash-list,150px)] xl:overflow-y-auto xl:pr-1">
                  {a.mistakes.map((x) => (
                    <li key={x.label} className="flex items-baseline justify-between gap-2 border-b border-border pb-1 text-xs">
                      <span className="min-w-0 truncate text-text">
                        {x.label} <span className="text-text-secondary">×{x.count}</span>
                      </span>
                      <Amount value={x.net} className="font-semibold" />
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>
          </div>
        </>
      )}
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} settings={settings} viewedMonth={viewedMonth} account={account} usdInr={usdInr} />
    </div>
  )
}
