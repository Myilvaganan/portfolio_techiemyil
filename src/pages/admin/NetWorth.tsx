import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Eye, EyeOff, RefreshCw, Wallet } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Card, Kpi } from '@/components/statements/parts'
import { AreaChart, Donut, HBars, Legend, vizColor } from '@/components/viz/charts'
import { Reveal, ScrollProgress } from '@/components/viz/motion'
import { ReportMenu } from '@/components/viz/ReportMenu'
import { useStatements } from '@/hooks/useStatements'
import { useLoans } from '@/hooks/useLoans'
import { netWorthReport } from '@/lib/moduleReports'
import { bankAccountBalances, computeNetWorth, monthlyBankTotal } from '@/lib/netWorth'
import { DEFAULT_FEE } from '@/lib/loans'
import { HOLDINGS, totalValue } from '@/lib/portfolio'
import { cardsSummary, monthLabel } from '@/lib/statements'
import { usePrivacy, useMoney } from '@/lib/privacy'

function Hint({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} data-cursor="hover" className="mt-1 inline-block text-[11px] text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
      {children}
    </Link>
  )
}

export function NetWorth() {
  const { hidden, toggle } = usePrivacy()
  const money = useMoney()
  const bank = useStatements('bank', {}, false)
  const card = useStatements('card', {}, false)
  const loansHook = useLoans(DEFAULT_FEE, false)

  const portfolioValue = totalValue(HOLDINGS)
  const bankBalances = useMemo(() => bankAccountBalances(bank.data.transactions, bank.data.statements), [bank.data.transactions, bank.data.statements])
  const cardSummaries = useMemo(() => cardsSummary(card.data.transactions, card.data.statements), [card.data.transactions, card.data.statements])
  const cardDues = useMemo(() => cardSummaries.map((c) => ({ label: c.label, due: c.totalDue ?? 0 })), [cardSummaries])
  const loanOutstanding = useMemo(() => loansHook.loans.map((l) => ({ label: l.label, outstanding: l.outstanding })), [loansHook.loans])
  const history = useMemo(() => monthlyBankTotal(bank.data.transactions), [bank.data.transactions])

  const summary = useMemo(
    () => computeNetWorth({ portfolioValue, bankBalances: bankBalances.map((b) => ({ label: b.label, balance: b.balance })), loanOutstanding, cardDues }),
    [portfolioValue, bankBalances, loanOutstanding, cardDues],
  )

  const loading = bank.loading || card.loading || loansHook.loading
  const assetItems = summary.assetGroups.flatMap((g) => g.items)
  const liabilityItems = summary.liabilityGroups.flatMap((g) => g.items)
  const assetDonut = assetItems.map((i, idx) => ({ label: i.label, value: Math.max(i.value, 0), color: vizColor(idx) }))
  const liabilityDonut = liabilityItems.map((i, idx) => ({ label: i.label, value: Math.max(i.value, 0), color: vizColor(idx) }))
  const bankGroup = summary.assetGroups.find((g) => g.key === 'bank')!
  const loanGroup = summary.liabilityGroups.find((g) => g.key === 'loans')!
  const cardGroup = summary.liabilityGroups.find((g) => g.key === 'cards')!

  return (
    <MotionConfig reducedMotion="user">
      <ScrollProgress />
      <div className="w-full space-y-6 xl:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Complete picture</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text md:text-3xl">Net Worth</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">Portfolio, bank balances, loans and card dues combined — pulled from what you&apos;ve already uploaded across the other modules.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" data-cursor="hover" onClick={toggle} aria-pressed={hidden} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
            {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {hidden ? 'Hidden' : 'Visible'}
          </button>
          <button
            type="button"
            data-cursor="hover"
            onClick={() => {
              void bank.reload()
              void card.reload()
              void loansHook.reload()
            }}
            aria-label="Refresh"
            className="rounded-full border border-border p-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <ReportMenu filename="net-worth-report" report={() => netWorthReport(summary)} />
        </div>
      </div>

      {loading ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-3 py-24 text-sm text-text-secondary">
          <RefreshCw className="h-4 w-4 animate-spin" /> Pulling together your accounts…
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Kpi label="Net worth" value={summary.netWorth} format={money.signed} tone={summary.netWorth >= 0 ? 'good' : 'bad'} sub="assets minus liabilities" />
            <Kpi label="Total assets" value={summary.totalAssets} format={money.inr} tone="good" sub={`${assetItems.length} source${assetItems.length === 1 ? '' : 's'}`} delay={0.05} />
            <Kpi label="Total liabilities" value={summary.totalLiabilities} format={money.inr} tone={summary.totalLiabilities > 0 ? 'warn' : undefined} sub={`${liabilityItems.length} source${liabilityItems.length === 1 ? '' : 's'}`} delay={0.1} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Assets">
              {assetItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-secondary">No assets found yet.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-6">
                  <Donut slices={assetDonut} centerLabel="Total assets" format={money.inr} />
                  <ul className="min-w-48 flex-1 space-y-2 text-xs">
                    {assetDonut.map((d) => (
                      <li key={d.label} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-text"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} /><span className="truncate">{d.label}</span></span>
                        <span className="shrink-0 font-mono text-text-secondary">{money.inr(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!bankGroup.hasData && (
                <p className="mt-3 text-center text-xs text-text-secondary">
                  No bank balances yet. <Hint to="/admin/bank-statements">Add bank statements →</Hint>
                </p>
              )}
            </Card>

            <Card title="Liabilities" delay={0.05}>
              {liabilityItems.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-secondary">No debts on record — nothing owed.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-6">
                  <Donut slices={liabilityDonut} centerLabel="Total owed" format={money.inr} />
                  <ul className="min-w-48 flex-1 space-y-2 text-xs">
                    {liabilityDonut.map((d) => (
                      <li key={d.label} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-text"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} /><span className="truncate">{d.label}</span></span>
                        <span className="shrink-0 font-mono text-text-secondary">{money.inr(d.value)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-center text-xs text-text-secondary">
                {!loanGroup.hasData && (
                  <p>
                    No loans on record. <Hint to="/admin/loans">Add loan documents →</Hint>
                  </p>
                )}
                {!cardGroup.hasData && (
                  <p>
                    No cards on record. <Hint to="/admin/credit-cards">Add card statements →</Hint>
                  </p>
                )}
              </div>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Where it stands" aside={<Legend items={[{ label: 'Assets', color: 'var(--viz-3)' }, { label: 'Liabilities', color: 'var(--viz-2)' }]} />}>
              <HBars
                items={[...assetItems, ...liabilityItems].sort((a, b) => b.value - a.value).map((i) => ({ label: i.label, value: i.value, color: assetItems.includes(i) ? 'var(--viz-3)' : 'var(--viz-2)' }))}
                format={money.inr}
              />
            </Card>
            <Card title="Bank balance trend" delay={0.05}>
              {history.length > 1 ? (
                <AreaChart labels={history.map((h) => monthLabel(h.month))} series={[{ key: 'bank', label: 'Bank total', color: 'var(--viz-1)', values: history.map((h) => h.bankTotal) }]} format={money.inr} height={200} />
              ) : (
                <p className="py-16 text-center text-sm text-text-secondary">Upload a few months of bank statements to see a trend here.</p>
              )}
            </Card>
          </div>

          <Reveal>
            <GlassCard hover={false} className="flex items-start gap-3 p-4">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p className="text-xs leading-relaxed text-text-secondary">
                The portfolio value is the Zerodha snapshot used on the Portfolio Rebalance page; bank balances, loan outstanding and card dues come from whatever statements you&apos;ve uploaded on their own pages. Add or refresh a
                source there and it updates here automatically.
              </p>
            </GlassCard>
          </Reveal>
        </>
      )}
      </div>
    </MotionConfig>
  )
}
