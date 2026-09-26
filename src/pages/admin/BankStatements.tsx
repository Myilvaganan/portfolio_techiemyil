import { useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Landmark, Plus, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AiInsightsPanel, AiPeriodPicker, AskAi } from '@/components/statements/AiPanel'
import { RecurringCard } from '@/components/statements/RecurringCard'
import { StatementLibrary } from '@/components/statements/StatementLibrary'
import { StatementUploader } from '@/components/statements/StatementUploader'
import { TransactionsTable } from '@/components/statements/TransactionsTable'
import { Card, Chips, Kpi, RANGE_OPTIONS, inr, pct, rangeFrom, signedInr, type RangeId } from '@/components/statements/parts'
import { AreaChart, BarChart, CalendarHeatmap, Donut, HBars, Legend, vizColor } from '@/components/viz/charts'
import { Reveal, ScrollProgress } from '@/components/viz/motion'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { useStatements } from '@/hooks/useStatements'
import { bankReport } from '@/lib/statementReports'
import { setCategoryOverride } from '@/lib/statementsApi'
import {
  anomalies,
  balanceSeries,
  bankKpis,
  categoryTotals,
  dailySpend,
  dayLabel,
  filterTxns,
  merchantTotals,
  monthLabel,
  monthlyFlow,
  type AiPeriod,
  type AiPeriodId,
  topWithOther,
  weekdaySpend,
} from '@/lib/statements'

const BANK = { icici: 'ICICI', axis: 'Axis', other: 'Bank' } as const
const SUGGESTIONS = ['Where am I overspending?', 'Which subscriptions can I cancel?', 'How much do I spend on food delivery?', 'What was my biggest expense?']

export function BankStatements() {
  const [range, setRange] = useState<RangeId>('all')
  const [account, setAccount] = useState('all')
  const [excludeTransfers, setExcludeTransfers] = useState(true)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const options = useMemo(() => ({ excludeTransfers }), [excludeTransfers])
  // The AI reads the newest month by default; the period can be changed and analysed on request.
  const [periodId, setPeriodId] = useState<AiPeriodId>('last1')
  const [customPeriod, setCustomPeriod] = useState<AiPeriod>({ from: '', to: '' })
  const choice = useMemo(() => ({ id: periodId, custom: customPeriod }), [periodId, customPeriod])
  const s = useStatements('bank', options, !uploading, choice)
  const { data } = s

  const accounts = useMemo(() => {
    const map = new Map<string, string>()
    for (const st of data.statements) map.set(st.accountKey, `${BANK[st.bank]} ${st.accountLast4 ? `••${st.accountLast4}` : 'account'}`)
    return [...map.entries()]
  }, [data.statements])

  const latest = useMemo(() => data.transactions.map((t) => t.date).sort().at(-1) ?? '', [data.transactions])
  const txns = useMemo(() => filterTxns(data.transactions, { from: rangeFrom(range, latest), account }), [data.transactions, range, latest, account])
  const statements = useMemo(() => (account === 'all' ? data.statements : data.statements.filter((x) => x.accountKey === account)), [data.statements, account])

  const k = useMemo(() => bankKpis(txns, statements, options), [txns, statements, options])
  const flow = useMemo(() => monthlyFlow('bank', txns, options), [txns, options])
  const cats = useMemo(() => categoryTotals('bank', txns, options), [txns, options])
  const merchants = useMemo(() => merchantTotals('bank', txns, options), [txns, options])
  const odd = useMemo(() => anomalies('bank', txns, 5, options), [txns, options])
  const balance = useMemo(() => balanceSeries(txns), [txns])
  const heat = useMemo(() => dailySpend('bank', txns, options), [txns, options])
  const weekdays = useMemo(() => weekdaySpend('bank', txns, options), [txns, options])
  const channels = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txns) if (t.debit && !(excludeTransfers && t.category === 'Transfer')) m.set(t.channel ?? 'Other', (m.get(t.channel ?? 'Other') ?? 0) + t.debit)
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [txns, excludeTransfers])

  const donut = useMemo(() => topWithOther(cats, 6).map((c, i) => ({ label: c.label, value: c.value, color: vizColor(i, c.label.startsWith('Other (')) })), [cats])
  const donutTotal = donut.reduce((a, d) => a + d.value, 0)
  const accountLabel = account === 'all' ? 'All accounts' : (accounts.find(([key]) => key === account)?.[1] ?? 'Account')
  const hasData = data.transactions.length > 0
  const showUploader = uploaderOpen || (!s.loading && !hasData)

  async function handleRecategorize(merchant: string, category: string) {
    await setCategoryOverride('bank', merchant, category)
    await s.reload()
  }

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">ICICI · Axis</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text md:text-3xl">Bank statements</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">Upload statements once — get cash flow, spending patterns, recurring charges and AI insights, saved to your private vault.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-cursor="hover" onClick={() => setUploaderOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> {showUploader && hasData ? 'Hide uploader' : 'Add statements'}
            </button>
            <button type="button" data-cursor="hover" onClick={() => void s.reload()} aria-label="Refresh" className="rounded-full border border-border p-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <ReportMenu
              disabled={!hasData}
              filename="bank-statements-report"
              report={() => bankReport(txns, statements, s.insights, options, accountLabel)}
              csv={() => ({ filename: 'bank-transactions', columns: ['Date', 'Merchant', 'Description', 'Category', 'Channel', 'Debit', 'Credit', 'Balance'], rows: txns.map((t) => [t.date, t.merchant, t.description, t.category, t.channel ?? '', t.debit, t.credit, t.balance ?? '']) })}
            />
          </div>
        </div>

        {s.error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{s.error}</p>}

        <AnimatePresence initial={false}>
          {showUploader && (
            <motion.div key="uploader" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <GlassCard hover={false} className="p-5">
                <StatementUploader kind="bank" compact={hasData} onSaved={() => void s.reload()} onBusyChange={setUploading} />
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {s.loading ? (
          <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading your statements…
          </GlassCard>
        ) : !hasData ? (
          <Reveal>
            <GlassCard hover={false} className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Landmark className="h-7 w-7" />
              </motion.span>
              <h2 className="font-display text-xl font-semibold text-text">Your dashboard appears here</h2>
              <p className="max-w-md text-sm text-text-secondary">Drop one or many ICICI or Axis account statements above. Every chart, insight and report is built from them.</p>
            </GlassCard>
          </Reveal>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Chips label="Date range" value={range} options={RANGE_OPTIONS} onChange={setRange} />
              <div className="flex flex-wrap items-center gap-3">
                {accounts.length > 1 && (
                  <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account" className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50">
                    <option value="all" className="bg-card">All accounts</option>
                    {accounts.map(([key, label]) => (
                      <option key={key} value={key} className="bg-card">{label}</option>
                    ))}
                  </select>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={excludeTransfers} onChange={(e) => setExcludeTransfers(e.target.checked)} className="accent-accent" />
                  Ignore own transfers
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Net cash flow" value={k.net} format={signedInr} tone={k.net >= 0 ? 'good' : 'bad'} sub={`${k.months} month${k.months === 1 ? '' : 's'}`} spark={flow.map((r) => r.net)} />
              <Kpi label="Money in" value={k.income} tone={k.income > 0 ? 'good' : undefined} sub={`${inr(k.avgMonthlyIncome)} / month`} delay={0.05} spark={flow.map((r) => r.income)} />
              <Kpi label="Money out" value={k.spend} tone={k.spend > k.income ? 'bad' : k.income > 0 && k.spend / k.income > 0.85 ? 'warn' : undefined} sub={`${inr(k.avgMonthlySpend)} / month`} delay={0.1} spark={flow.map((r) => r.spend)} />
              <Kpi label="Savings rate" value={k.savingsRate} format={(n) => pct(n)} tone={k.savingsRate >= 20 ? 'good' : k.savingsRate >= 0 ? 'warn' : 'bad'} sub="of money in" delay={0.15} spark={flow.map((r) => r.savingsRate)} />
              <Kpi label="Latest balance" value={k.latestBalance ?? 0} tone={k.runwayMonths === null ? undefined : k.runwayMonths < 1 ? 'bad' : k.runwayMonths < 3 ? 'warn' : 'good'} sub={k.runwayMonths === null ? 'balance not in statements' : `${k.runwayMonths.toFixed(1)} months of spending`} delay={0.2} spark={balance.map((b) => b.balance)} />
              <Kpi label="Cash withdrawn" value={k.cashWithdrawn} tone={k.spend > 0 && k.cashWithdrawn / k.spend > 0.15 ? 'warn' : undefined} sub={`${k.txns.toLocaleString('en-IN')} transactions`} delay={0.25} />
            </div>

            <Reveal>
              <AiInsightsPanel
                insights={s.insights}
                busy={s.insightsBusy}
                error={s.insightsError}
                onGenerate={() => void s.generate()}
                hasData={hasData}
                picker={<AiPeriodPicker id={periodId} custom={customPeriod} onId={setPeriodId} onCustom={setCustomPeriod} resolved={s.period} />}
                shownPeriod={s.shownPeriod}
                periodMatches={s.periodMatches}
              />
            </Reveal>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Money in vs out" aside={<Legend items={[{ label: 'In', color: 'var(--viz-3)' }, { label: 'Out', color: 'var(--viz-2)' }, { label: 'Net', color: 'var(--viz-1)' }]} />}>
                <BarChart
                  labels={flow.map((r) => monthLabel(r.month))}
                  bars={[
                    { key: 'in', label: 'Money in', color: 'var(--viz-3)', values: flow.map((r) => r.income) },
                    { key: 'out', label: 'Money out', color: 'var(--viz-2)', values: flow.map((r) => r.spend) },
                  ]}
                  line={{ label: 'Net', color: 'var(--viz-1)', values: flow.map((r) => r.net) }}
                  format={inr}
                />
              </Card>
              <Card title="Balance over time">
                {balance.length > 1 ? (
                  <AreaChart labels={balance.map((b) => dayLabel(b.date))} series={[{ key: 'bal', label: 'Balance', color: 'var(--viz-1)', values: balance.map((b) => b.balance) }]} format={inr} />
                ) : (
                  <p className="py-16 text-center text-sm text-text-secondary">Running balances weren’t found in these statements.</p>
                )}
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
              <Card title="Where the money goes">
                <div className="flex flex-wrap items-center justify-center gap-6">
                  <Donut slices={donut} centerLabel="Total out" format={inr} />
                  <ul className="min-w-48 flex-1 space-y-2 text-xs">
                    {donut.map((d) => (
                      <li key={d.label} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-text"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} /><span className="truncate">{d.label}</span></span>
                        <span className="shrink-0 font-mono text-text-secondary">{pct((d.value / (donutTotal || 1)) * 100, 1)} · {inr(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
              <Card title="Top merchants" delay={0.05}>
                <HBars items={merchants.slice(0, 8).map((m) => ({ label: m.label, value: m.value, sub: `${m.count} payment${m.count === 1 ? '' : 's'}`, color: 'var(--viz-1)' }))} format={inr} />
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Spending calendar">
                <CalendarHeatmap values={heat} format={inr} />
              </Card>
              <Card title="Which days you spend" delay={0.05}>
                <BarChart labels={weekdays.map((w) => w.label)} bars={[{ key: 'w', label: 'Spend', color: 'var(--viz-1)', values: weekdays.map((w) => w.value) }]} height={200} format={inr} />
                <p className="mt-3 text-[11px] text-text-secondary">Total out by day of the week.</p>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="How you pay">
                <HBars items={channels.slice(0, 7).map((c, i) => ({ ...c, color: vizColor(i) }))} format={inr} />
              </Card>
              <Card title="Recurring charges" delay={0.05}>
                <RecurringCard txns={txns} />
              </Card>
              <Card title="Unusual spends" delay={0.1}>
                {odd.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-secondary">Nothing looks out of the ordinary.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {odd.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0"><span className="block truncate font-medium text-text">{t.merchant}</span><span className="text-text-secondary">{dayLabel(t.date)} · {t.category}</span></span>
                        <span className="font-mono font-semibold text-error">{inr(t.debit)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card title="Transactions">
              <TransactionsTable kind="bank" txns={txns} onRecategorize={handleRecategorize} />
            </Card>

            <StatementLibrary statements={data.statements} onOpen={s.openFile} onDelete={s.remove} />

            <Reveal>
              <AskAi ask={s.ask} suggestions={SUGGESTIONS} disabled={!hasData} />
            </Reveal>
          </>
        )}
      </div>
    </MotionConfig>
  )
}
