import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { HideNumbersButton } from '@/components/journal/chrome'
import { AreaChart, BarChart } from '@/components/viz/charts'
import { Card, Kpi } from '@/components/statements/parts'
import { useMoney } from '@/lib/privacy'
import { todayStr } from '@/lib/journal'
import { monthLabel } from '@/lib/statements'
import { cashFlow } from '@/lib/cashflow'
import { lastMonths } from '@/lib/household'
import { useFinanceData } from '@/hooks/useFinanceData'

const short = (m: string) => monthLabel(m).split(' ')[0]

export function CashFlow() {
  const m = useMoney()
  const { loading, error, settingsError, bank, card, settings } = useFinanceData()
  const today = todayStr()
  const months = useMemo(() => lastMonths(today.slice(0, 7), 12), [today])
  const cf = useMemo(() => cashFlow(bank, card, months, today, settings.tags), [bank, card, months, today, settings.tags])
  const labels = cf.flows.map((f) => short(f.month))
  const rates = cf.flows.map((f) => f.savingsRate ?? 0)
  const last = cf.flows.filter((f) => f.month < today.slice(0, 7)).at(-1)
  const runway = cf.runwayMonths

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">Money</p>
          <h1 className="mt-1 page-title">Cash flow</h1>
          <p className="page-lede">Income against spending, how long your bank balance lasts, and the next three months.</p>
        </div>
        <HideNumbersButton />
      </div>

      {(error || settingsError) && (
        <GlassCard hover={false} className="p-3 text-sm text-error" role="alert">
          {error || settingsError}
        </GlassCard>
      )}

      {loading ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your statements…
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <Kpi label="Bank balance" value={cf.balance ?? 0} format={m.inr} sub="Latest across accounts" />
            <Kpi label="Avg monthly burn" value={cf.avgBurn} format={m.inr} sub="Last 3 full months" />
            <Kpi label="Avg monthly income" value={cf.avgIncome} format={m.inr} sub="Salary, interest, other" />
            <Kpi label="Runway" value={runway ?? 0} format={(n) => (runway == null ? 'n/a' : m.hidden ? '****' : `${n.toFixed(1)} months`)} tone={runway == null ? undefined : runway < 3 ? 'bad' : runway < 6 ? 'warn' : 'good'} sub="Balance / average burn" />
            <Kpi label="Last month saved" value={last?.savingsRate ?? 0} format={(n) => (last?.savingsRate == null ? 'n/a' : m.hidden ? '****' : `${n.toFixed(0)}%`)} tone={last?.savingsRate == null ? undefined : last.savingsRate < 0 ? 'bad' : last.savingsRate < 20 ? 'warn' : 'good'} sub={last ? `${m.signed(last.net)} net` : undefined} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Income vs spending">
              <BarChart labels={labels} bars={[{ key: 'income', label: 'Income', color: 'var(--color-positive)', values: cf.flows.map((f) => f.income) }, { key: 'spend', label: 'Spending', color: 'var(--viz-4)', values: cf.flows.map((f) => f.spend) }]} height={230} format={m.inr} axisFormat={m.axis} />
            </Card>
            <Card title="Savings rate">
              <AreaChart labels={labels} series={[{ key: 'rate', label: 'Savings rate %', color: 'var(--viz-1)', values: rates }]} height={230} format={(n) => (m.hidden ? '****' : `${n.toFixed(0)}%`)} axisFormat={(n) => (m.hidden ? '' : `${Math.round(n)}%`)} />
            </Card>
          </div>

          <Card title="Next three months" aside={<span className="text-2xs text-text-secondary">{m.inr(cf.recurringMonthly)}/mo in recurring payments</span>}>
            <div className="grid gap-3 sm:grid-cols-3">
              {cf.projection.map((p) => (
                <div key={p.month} className="rounded-xl border border-border bg-surface-2/50 p-3">
                  <p className="text-xs font-semibold text-text">{monthLabel(p.month, true)}</p>
                  <dl className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between"><dt className="text-text-secondary">Income</dt><dd className="font-mono text-positive">{m.inr(p.income)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-secondary">Recurring</dt><dd className="font-mono text-text">{m.inr(p.fixed)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-secondary">Everyday</dt><dd className="font-mono text-text">{m.inr(p.variable)}</dd></div>
                    <div className="flex justify-between border-t border-border pt-1"><dt className="text-text-secondary">Balance after</dt><dd className={`font-mono font-semibold ${p.balance < 0 ? 'text-error' : 'text-text'}`}>{m.inr(p.balance)}</dd></div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-3 text-2xs text-text-secondary">Assumes income and spending stay near the recent average; recurring payments are detected from repeated monthly charges.</p>
          </Card>
        </>
      )}
    </div>
  )
}
