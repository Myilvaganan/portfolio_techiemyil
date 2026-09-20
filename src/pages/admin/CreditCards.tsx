import { useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { CreditCard, Plus, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AiInsightsPanel, AskAi } from '@/components/statements/AiPanel'
import { StatementLibrary } from '@/components/statements/StatementLibrary'
import { StatementUploader } from '@/components/statements/StatementUploader'
import { TransactionsTable } from '@/components/statements/TransactionsTable'
import { Card, Chips, CreditCardTile, Kpi, RANGE_OPTIONS, inr, pct, rangeFrom, type RangeId } from '@/components/statements/parts'
import { AreaChart, BarChart, CalendarHeatmap, Donut, Gauge, HBars, Legend, vizColor } from '@/components/viz/charts'
import { Reveal, ScrollProgress } from '@/components/viz/motion'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { useStatements } from '@/hooks/useStatements'
import { cardReport } from '@/lib/statementReports'
import {
  anomalies,
  cardsSummary,
  categoryTotals,
  dailySpend,
  dayLabel,
  filterTxns,
  merchantTotals,
  monthLabel,
  monthlyFlow,
  monthlySpendByCard,
  recurringCharges,
  topWithOther,
} from '@/lib/statements'

const SUGGESTIONS = ['How much interest and fees did I pay?', 'Which card should I use for groceries?', 'What is due soon?', 'Which merchants charge me every month?']

export function CreditCards() {
  const [range, setRange] = useState<RangeId>('all')
  const [selected, setSelected] = useState('all')
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const s = useStatements('card')
  const { data } = s

  const latest = useMemo(() => data.transactions.map((t) => t.date).sort().at(-1) ?? '', [data.transactions])
  const inRange = useMemo(() => filterTxns(data.transactions, { from: rangeFrom(range, latest) }), [data.transactions, range, latest])
  const cards = useMemo(() => cardsSummary(inRange, data.statements), [inRange, data.statements])
  const cardOrder = useMemo(() => cardsSummary(data.transactions, data.statements).map((c) => c.key), [data.transactions, data.statements])
  const txns = useMemo(() => filterTxns(inRange, { account: selected }), [inRange, selected])
  const shownCards = selected === 'all' ? cards : cards.filter((c) => c.key === selected)
  const labels = useMemo(() => Object.fromEntries(cards.map((c) => [c.key, c.label])), [cards])

  const totals = useMemo(
    () =>
      shownCards.reduce(
        (a, c) => ({ spend: a.spend + c.spend, fees: a.fees + c.feesInterest, pay: a.pay + c.payments, refunds: a.refunds + c.refunds, due: a.due + (c.totalDue ?? 0), limit: a.limit + (c.limit ?? 0), points: a.points + (c.rewardPoints ?? 0) }),
        { spend: 0, fees: 0, pay: 0, refunds: 0, due: 0, limit: 0, points: 0 },
      ),
    [shownCards],
  )
  const flow = useMemo(() => monthlyFlow('card', txns), [txns])
  const byCard = useMemo(() => monthlySpendByCard(txns), [txns])
  const cats = useMemo(() => categoryTotals('card', txns), [txns])
  const merchants = useMemo(() => merchantTotals('card', txns), [txns])
  const recurring = useMemo(() => recurringCharges('card', txns), [txns])
  const odd = useMemo(() => anomalies('card', txns, 5), [txns])
  const heat = useMemo(() => dailySpend('card', txns), [txns])
  const feesByMonth = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of txns) if (t.type === 'fee' || t.type === 'interest') m.set(t.date.slice(0, 7), (m.get(t.date.slice(0, 7)) ?? 0) + t.debit)
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [txns])
  const donut = useMemo(() => topWithOther(cats, 6).map((c, i) => ({ label: c.label, value: c.value, color: vizColor(i, c.label.startsWith('Other (')) })), [cats])
  const donutTotal = donut.reduce((a, d) => a + d.value, 0)

  const hasData = data.transactions.length > 0
  const showUploader = uploaderOpen || (!s.loading && !hasData)
  const selectedLabel = selected === 'all' ? `All ${cards.length} cards` : (labels[selected] ?? 'Card')

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">ICICI Bank</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text md:text-3xl">Credit cards</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">All your ICICI cards in one place — spend, dues, utilisation, fees and interest, with AI recommendations.</p>
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
              filename="credit-cards-report"
              report={() => cardReport(txns, data.statements, s.insights, selectedLabel)}
              csv={() => ({ filename: 'card-transactions', columns: ['Date', 'Card', 'Merchant', 'Description', 'Category', 'Type', 'Charge', 'Credit'], rows: txns.map((t) => [t.date, labels[t.accountKey] ?? '', t.merchant, t.description, t.category, t.type ?? '', t.debit, t.credit]) })}
            />
          </div>
        </div>

        {s.error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{s.error}</p>}

        <AnimatePresence initial={false}>
          {showUploader && (
            <motion.div key="uploader" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <GlassCard hover={false} className="p-5">
                <StatementUploader kind="card" compact={hasData} onSaved={() => void s.reload()} />
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
              <motion.span animate={{ rotate: [-4, 4, -4] }} transition={{ repeat: Infinity, duration: 4 }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <CreditCard className="h-7 w-7" />
              </motion.span>
              <h2 className="font-display text-xl font-semibold text-text">Add your card statements</h2>
              <p className="max-w-md text-sm text-text-secondary">Drop the ICICI credit card statement PDFs for all your cards together. Type the PDF password once and every card is unlocked, read and analysed.</p>
            </GlassCard>
          </Reveal>
        ) : (
          <>
            <Chips label="Date range" value={range} options={RANGE_OPTIONS} onChange={setRange} />

            <Reveal>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" style={{ perspective: 1000 }}>
                {cards.map((c) => (
                  <CreditCardTile key={c.key} card={c} index={cardOrder.indexOf(c.key)} active={selected === c.key} onClick={() => setSelected(selected === c.key ? 'all' : c.key)} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-text-secondary">Tap a card to focus the dashboard on it; tap again to see all cards.</p>
            </Reveal>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Spend" value={totals.spend} sub={selectedLabel} spark={flow.map((r) => r.spend)} />
              <Kpi label="Fees & interest" value={totals.fees} tone={totals.fees > 0 ? 'bad' : 'good'} sub={totals.spend ? `${pct((totals.fees / totals.spend) * 100, 1)} of spend` : undefined} delay={0.05} />
              <Kpi label="Payments made" value={totals.pay} sub="towards the bills" delay={0.1} />
              <Kpi label="Refunds & cashback" value={totals.refunds} tone="good" delay={0.15} />
              <Kpi label="Total due now" value={totals.due} tone={totals.due > 0 ? 'warn' : 'good'} sub="latest statements" delay={0.2} />
              <Kpi label="Reward points" value={totals.points} format={(n) => Math.round(n).toLocaleString('en-IN')} sub="latest statements" delay={0.25} />
            </div>

            <Reveal>
              <AiInsightsPanel insights={s.insights} busy={s.insightsBusy} error={s.insightsError} onGenerate={() => void s.generate()} hasData={hasData} />
            </Reveal>

            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card title="Monthly spend by card" aside={<Legend items={byCard.keys.map((k) => ({ label: labels[k] ?? k, color: vizColor(cardOrder.indexOf(k)) }))} />}>
                <BarChart
                  stacked
                  labels={byCard.months.map((m) => monthLabel(m))}
                  bars={byCard.keys.map((k) => ({ key: k, label: labels[k] ?? k, color: vizColor(cardOrder.indexOf(k)), values: byCard.values[k] }))}
                  format={inr}
                />
              </Card>
              <Card title="Utilisation" delay={0.05}>
                <div className="grid grid-cols-2 gap-4">
                  {shownCards.filter((c) => c.utilisation !== null).map((c) => (
                    <div key={c.key} className="text-center">
                      <Gauge value={c.utilisation ?? 0} label={c.label} sub={`••${c.last4}`} size={130} />
                    </div>
                  ))}
                </div>
                {shownCards.every((c) => c.utilisation === null) && <p className="py-10 text-center text-sm text-text-secondary">Credit limits weren’t found in these statements.</p>}
                <p className="mt-3 text-[11px] text-text-secondary">Keeping each card under 30% of its limit helps your credit score.</p>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Where the money goes">
                <div className="flex flex-wrap items-center justify-center gap-6">
                  <Donut slices={donut} centerLabel="Spend" format={inr} />
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
                <HBars items={merchants.slice(0, 8).map((m) => ({ label: m.label, value: m.value, sub: `${m.count} charge${m.count === 1 ? '' : 's'}` }))} format={inr} />
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Spending calendar">
                <CalendarHeatmap values={heat} format={inr} />
              </Card>
              <Card title="Interest & fees paid" delay={0.05}>
                {feesByMonth.length > 0 && feesByMonth.length < 3 ? (
                  <BarChart labels={feesByMonth.map(([m]) => monthLabel(m))} bars={[{ key: 'fees', label: 'Fees & interest', color: 'var(--viz-2)', values: feesByMonth.map(([, v]) => v) }]} height={190} format={inr} />
                ) : feesByMonth.length > 0 ? (
                  <AreaChart labels={feesByMonth.map(([m]) => monthLabel(m))} series={[{ key: 'fees', label: 'Fees & interest', color: 'var(--viz-2)', values: feesByMonth.map(([, v]) => v) }]} height={190} format={inr} />
                ) : (
                  <p className="py-16 text-center text-sm text-text-secondary">No interest or fees in this range — nicely done.</p>
                )}
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <Card title="Card comparison" className="lg:col-span-2">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                        <th className="py-2 pr-3 font-medium">Card</th>
                        <th className="py-2 pr-3 text-right font-medium">Spend</th>
                        <th className="py-2 pr-3 text-right font-medium">Fees</th>
                        <th className="py-2 pr-3 text-right font-medium">Paid</th>
                        <th className="py-2 pr-3 text-right font-medium">Due</th>
                        <th className="py-2 text-right font-medium">Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.map((c) => (
                        <tr key={c.key} className="border-b border-border/60 transition-colors hover:bg-surface-3">
                          <td className="py-2.5 pr-3 font-medium text-text"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: vizColor(cardOrder.indexOf(c.key)) }} />{c.label}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-text">{inr(c.spend)}</td>
                          <td className={`py-2.5 pr-3 text-right font-mono ${c.feesInterest > 0 ? 'text-error' : 'text-text-secondary'}`}>{inr(c.feesInterest)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{inr(c.payments)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-text">{c.totalDue === null ? '—' : inr(c.totalDue)}</td>
                          <td className="py-2.5 text-right font-mono text-text-secondary">{c.utilisation === null ? '—' : pct(c.utilisation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="EMIs & repeat charges" delay={0.05}>
                {recurring.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-secondary">Needs 3+ months of statements to spot repeat charges.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {recurring.slice(0, 6).map((r) => (
                      <li key={r.merchant} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="min-w-0"><span className="block truncate font-medium text-text">{r.merchant}</span><span className="text-text-secondary">{r.months} months</span></span>
                        <span className="font-mono text-text">{inr(r.monthly)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {odd.length > 0 && (
                  <>
                    <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Unusual charges</p>
                    <ul className="divide-y divide-border/60">
                      {odd.slice(0, 3).map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                          <span className="truncate text-text">{t.merchant} <span className="text-text-secondary">· {dayLabel(t.date)}</span></span>
                          <span className="font-mono font-semibold text-error">{inr(t.debit)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            </div>

            <Card title="Transactions">
              <TransactionsTable kind="card" txns={txns} cardLabels={labels} />
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
