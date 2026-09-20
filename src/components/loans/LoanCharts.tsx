import { useMemo } from 'react'
import { AreaChart, BarChart, Donut, Gauge, Legend, vizColor } from '@/components/viz/charts'
import { Card } from '@/components/statements/parts'
import { dayLabel, monthLabel } from '@/lib/statements'
import { loanInr, progressPct, timePct, type Loan } from '@/lib/loans'

const fmt = (n: number) => loanInr(n)

export function LoanCharts({ loan }: { loan: Loan }) {
  const rows = loan.schedule
  const labels = useMemo(() => rows.map((r) => monthLabel(r.date.slice(0, 7))), [rows])
  const byYear = useMemo(() => {
    const m = new Map<string, { principal: number; interest: number }>()
    for (const r of rows) {
      const y = r.date.slice(0, 4)
      const v = m.get(y) ?? { principal: 0, interest: 0 }
      v.principal += r.principal
      v.interest += r.interest
      m.set(y, v)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows])
  const cumulative = useMemo(() => {
    let p = 0
    let i = 0
    return rows.map((r) => ({ principal: (p += r.principal), interest: (i += r.interest) }))
  }, [rows])

  const interestShare = loan.totalInterest ? (loan.paidInterest / loan.totalInterest) * 100 : 0
  const donut = [
    { label: 'Principal', value: loan.principal, color: 'var(--viz-3)' },
    { label: 'Interest', value: loan.totalInterest, color: 'var(--viz-2)' },
    ...(loan.processingFee ? [{ label: 'Processing fee', value: loan.processingFee, color: 'var(--viz-4)' }] : []),
    ...(loan.penalties ? [{ label: 'Penalties', value: loan.penalties, color: 'var(--viz-8)' }] : []),
  ]
  const cost = donut.reduce((s, d) => s + d.value, 0)

  if (!rows.length) return <p className="py-10 text-center text-sm text-text-secondary">Upload the amortization schedule to see the charts.</p>

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Where each EMI goes" aside={<Legend items={[{ label: 'Principal', color: 'var(--viz-3)' }, { label: 'Interest', color: 'var(--viz-2)' }]} />}>
          <BarChart stacked labels={labels} bars={[{ key: 'p', label: 'Principal', color: 'var(--viz-3)', values: rows.map((r) => r.principal) }, { key: 'i', label: 'Interest', color: 'var(--viz-2)', values: rows.map((r) => r.interest) }]} format={fmt} />
          <p className="mt-2 text-[11px] text-text-secondary">Early EMIs are mostly interest; the principal share grows every month — that is why prepaying early saves the most.</p>
        </Card>
        <Card title="Progress" delay={0.05}>
          <div className="grid grid-cols-3 gap-2">
            <Gauge value={progressPct(loan)} label="Principal repaid" sub="repaid" size={110} invert />
            <Gauge value={timePct(loan)} label="Time elapsed" sub="of tenure" size={110} invert />
            <Gauge value={interestShare} label="Interest paid" sub="of interest" size={110} invert />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
            You have repaid {progressPct(loan).toFixed(1)}% of the principal but paid {interestShare.toFixed(1)}% of the interest — interest is charged up front, so the balance falls slowly at first.
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Outstanding balance">
          <AreaChart labels={rows.map((r) => dayLabel(r.date))} series={[{ key: 'bal', label: 'Balance after EMI', color: 'var(--viz-1)', values: rows.map((r) => r.closing) }]} format={fmt} />
        </Card>
        <Card title="Principal repaid vs interest paid (cumulative)" delay={0.05} aside={<Legend items={[{ label: 'Principal', color: 'var(--viz-3)' }, { label: 'Interest', color: 'var(--viz-2)' }]} />}>
          <AreaChart
            labels={rows.map((r) => dayLabel(r.date))}
            series={[
              { key: 'p', label: 'Principal repaid', color: 'var(--viz-3)', values: cumulative.map((c) => c.principal) },
              { key: 'i', label: 'Interest paid', color: 'var(--viz-2)', values: cumulative.map((c) => c.interest) },
            ]}
            format={fmt}
          />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Year by year" aside={<Legend items={[{ label: 'Principal', color: 'var(--viz-3)' }, { label: 'Interest', color: 'var(--viz-2)' }]} />}>
          <BarChart labels={byYear.map(([y]) => y)} bars={[{ key: 'p', label: 'Principal', color: 'var(--viz-3)', values: byYear.map(([, v]) => v.principal) }, { key: 'i', label: 'Interest', color: 'var(--viz-2)', values: byYear.map(([, v]) => v.interest) }]} height={230} format={fmt} />
        </Card>
        <Card title="Total cost of this loan" delay={0.05}>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Donut slices={donut} centerLabel="You pay" format={fmt} size={170} />
            <ul className="min-w-40 flex-1 space-y-2 text-xs">
              {donut.map((d) => (
                <li key={d.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-text"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />{d.label}</span>
                  <span className="font-mono text-text-secondary">{fmt(d.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[11px] text-text-secondary">Every ₹100 borrowed costs about ₹{cost && loan.principal ? Math.round((cost / loan.principal) * 100) : 100} to repay in total.</p>
        </Card>
      </div>
    </div>
  )
}

// Both loans' balances on one axis, month by month.
export function CombinedBalanceChart({ loans }: { loans: Loan[] }) {
  const data = useMemo(() => {
    const withRows = loans.filter((l) => l.schedule.length)
    if (!withRows.length) return null
    const start = withRows.map((l) => l.sanctionDate.slice(0, 7)).sort()[0]
    const end = withRows.map((l) => l.endDate.slice(0, 7)).sort().at(-1)!
    const months: string[] = []
    for (let [y, m] = start.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= end; m === 12 ? ((y += 1), (m = 1)) : (m += 1)) months.push(`${y}-${String(m).padStart(2, '0')}`)
    return {
      labels: months.map((m) => monthLabel(m)),
      series: withRows.map((l, i) => ({
        key: l.accountNo,
        label: l.label,
        color: vizColor(i),
        values: months.map((m) => {
          if (m < l.sanctionDate.slice(0, 7)) return 0
          const row = [...l.schedule].reverse().find((r) => r.date.slice(0, 7) <= m)
          return row ? row.closing : l.principal
        }),
      })),
    }
  }, [loans])
  if (!data) return null
  return <AreaChart labels={data.labels} series={data.series} format={fmt} height={250} />
}
