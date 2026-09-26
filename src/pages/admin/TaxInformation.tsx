import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { PageBadge } from '@/components/admin/AdminShell'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FileJson, Loader2, Receipt, Trash2, UploadCloud } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { BarChart, Legend } from '@/components/viz/charts'
import { HideNumbersButton } from '@/components/journal/chrome'
import { cn } from '@/lib/utils'
import { useMoney } from '@/lib/privacy'
import { fetchStatements } from '@/lib/statementsApi'
import { deleteReturn, fetchReturns, readReturnFiles, saveReturns } from '@/lib/taxApi'
import { todayStr } from '@/lib/journal'
import type { Txn } from '@/lib/statements'
import {
  ADVANCE_TAX_DUE,
  KIND,
  KINDS,
  ayLabel,
  byYear,
  effectiveRate,
  fyLabel,
  fyOf,
  fyOfAy,
  latestPerYear,
  missingYears,
  monthsCovered,
  taxTxns,
  totals,
  verifyChallans,
  type TaxKind,
  type TaxReturn,
  type TaxTxn,
} from '@/lib/tax'

type Tab = 'overview' | 'returns' | 'transactions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Year by year' },
  { id: 'returns', label: 'Return details' },
  { id: 'transactions', label: 'Transactions' },
]

const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const REGIME = { old: 'Old regime', new: 'New regime', unknown: 'Regime not stated' } as const

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: ReactNode; accent: string }) {
  return (
    <GlassCard hover={false} className="relative overflow-hidden px-4 py-2.5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />
      <p className="label-caps">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-semibold text-text">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-text-secondary">{sub}</p>}
    </GlassCard>
  )
}

function Row({ label, value, strong, muted, negative }: { label: ReactNode; value: string; strong?: boolean; muted?: boolean; negative?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5 text-sm', strong && 'border-t border-border pt-2 font-semibold')}>
      <span className={cn('min-w-0', muted ? 'text-text-secondary' : 'text-text')}>{label}</span>
      <span className={cn('shrink-0 font-mono', negative ? 'text-positive' : 'text-text')}>{value}</span>
    </div>
  )
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <GlassCard hover={false} className="p-4">
      <h3 className="mb-2 label-caps">{title}</h3>
      {children}
      {note && <p className="mt-3 border-t border-border pt-2.5 text-2xs leading-relaxed text-text-secondary">{note}</p>}
    </GlassCard>
  )
}

// ---------- Year by year ----------

function Overview({ returns, onOpen, txns, bank }: { returns: TaxReturn[]; onOpen: (ay: string) => void; txns: TaxTxn[]; bank: Txn[] }) {
  const m = useMoney()
  const t = totals(returns)
  const latest = returns[returns.length - 1]
  const labels = returns.map((r) => fyOfAy(r.ay))
  const gaps = missingYears(returns)
  const thisFy = fyOf(todayStr())
  // The return for the last completed year is assessed in the AY that starts with the current FY's first year.
  const startYear = Number(thisFy.slice(0, 4))
  const lastDone = `${startYear - 1}-${String(startYear).slice(2)}`
  const notFiled = Number(latest.ay) < startYear
  const advance = txns.filter((x) => x.fy === thisFy && x.kind === 'taxPaid' && !x.credit).reduce((s, x) => s + x.amount, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5 [&>*:first-child]:col-span-2 xl:[&>*:first-child]:col-span-1">
        <Kpi label={`Tax cost · ${returns.length} year${returns.length === 1 ? '' : 's'}`} value={m.inr(t.cost)} sub="Tax + interest + fees on your returns" accent="var(--color-accent)" />
        <Kpi label="Paid in cash" value={m.inr(t.paid)} sub={<>TDS {m.inr(t.tds)} · self-paid {m.inr(t.selfPaid)}</>} accent="var(--viz-1)" />
        <Kpi label="Refunds" value={m.inr(t.refunds)} sub={`${returns.filter((r) => r.refund > 0).length} year(s) with a refund`} accent="var(--viz-3)" />
        <Kpi label="Interest & fees" value={m.inr(t.interest)} sub="Late advance tax (234B / 234C) and filing fees" accent="var(--viz-2)" />
        <Kpi label={`Latest · ${fyLabel(fyOfAy(latest.ay))}`} value={m.pct(effectiveRate(latest))} sub={<>{m.inr(latest.tax.total)} on {m.inr(latest.income.taxable)} taxable</>} accent="var(--viz-4)" />
      </div>

      <GlassCard hover={false} className="p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="label-caps">Tax paid each year</h2>
          <Legend items={[{ label: 'TDS', color: 'var(--viz-1)' }, { label: 'Advance / self-assessment', color: 'var(--viz-2)' }, { label: 'Tax cost (liability + interest)', color: 'var(--viz-4)' }]} />
        </div>
        <BarChart
          labels={labels}
          stacked
          bars={[
            { key: 'tds', label: 'TDS', color: 'var(--viz-1)', values: returns.map((r) => r.paid.tds + r.paid.tcs) },
            { key: 'self', label: 'Advance / self-assessment', color: 'var(--viz-2)', values: returns.map((r) => r.paid.advance + r.paid.selfAssessment) },
          ]}
          line={{ label: 'Tax cost', color: 'var(--viz-4)', values: returns.map((r) => r.tax.total) }}
          format={(n) => m.inr(n)}
          axisFormat={m.axis}
        />
      </GlassCard>

      <GlassCard hover={false} className="overflow-x-auto p-4">
        <h2 className="mb-2 label-caps">Every return</h2>
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead>
            <tr className="border-b border-border label-caps">
              <th scope="col" className="py-2 pr-3 font-medium">Year</th>
              <th scope="col" className="py-2 pr-3 font-medium">Form · regime</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Gross income</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Taxable</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Tax</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Interest</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Paid</th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">Refund / due</th>
              <th scope="col" className="py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {[...returns].reverse().map((r) => (
              <tr key={r.ay} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <button type="button" onClick={() => onOpen(r.ay)} className="text-left font-semibold text-accent hover:underline">
                    {fyLabel(fyOfAy(r.ay))}
                  </button>
                  <p className="text-2xs text-text-secondary">{ayLabel(r.ay)} · filed {r.filedOn ? dayLabel(r.filedOn) : '—'}</p>
                </td>
                <td className="py-2 pr-3 text-text-secondary">
                  {r.form} · {REGIME[r.regime]}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-text">{m.inr(r.income.grossSalary + r.income.otherSources + r.income.shortTermGains + r.income.longTermGains)}</td>
                <td className="py-2 pr-3 text-right font-mono text-text">{m.inr(r.income.taxable)}</td>
                <td className="py-2 pr-3 text-right font-mono font-semibold text-text">{m.inr(r.tax.liability)}</td>
                <td className={cn('py-2 pr-3 text-right font-mono', r.tax.total > r.tax.liability ? 'text-error' : 'text-text-secondary')}>{m.inr(r.tax.total - r.tax.liability)}</td>
                <td className="py-2 pr-3 text-right font-mono text-text">{m.inr(r.paid.total)}</td>
                <td className={cn('py-2 pr-3 text-right font-mono', r.refund > 0 ? 'text-positive' : r.payable > 0 ? 'text-error' : 'text-text-secondary')}>{r.refund > 0 ? `+${m.inr(r.refund)}` : r.payable > 0 ? `-${m.inr(r.payable)}` : '—'}</td>
                <td className="py-2 text-right font-mono text-text-secondary">{m.pct(effectiveRate(r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={`Now · ${fyLabel(thisFy)}`} note="Advance tax is due in four instalments; paying late is what creates the 234B / 234C interest above. It applies once the tax after TDS is ₹10,000 or more.">
          <Row label="Income tax paid so far (bank statements)" value={m.inr(advance)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {ADVANCE_TAX_DUE.map((d) => (
              <span key={d.by} className="rounded-full border border-border px-2.5 py-1 text-2xs text-text-secondary">
                {d.by} · {d.share}% of the year’s tax
              </span>
            ))}
          </div>
          {notFiled && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-error">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No return for {fyLabel(lastDone)} uploaded yet.
            </p>
          )}
        </Section>
        <Section title="Gaps and what would complete this">
          <ul className="space-y-2 text-xs">
            {gaps.length > 0 && (
              <li className="flex items-start gap-2 text-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> No return uploaded for {gaps.map((g) => ayLabel(g)).join(', ')}.
              </li>
            )}
            {returns.map((r) => {
              const covered = monthsCovered(bank, fyOfAy(r.ay))
              return (
                <li key={r.ay} className={cn('flex items-start gap-2', covered === 12 ? 'text-text-secondary' : 'text-text')}>
                  {covered === 12 ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-positive" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />}
                  {fyLabel(fyOfAy(r.ay))}: bank statements cover {covered} of 12 months.{covered < 12 && <> Add the rest on <Link to="/admin/bank-statements" className="text-accent hover:underline">Bank Statements</Link>.</>}
                </li>
              )
            })}
            <li className="text-text-secondary">Form 26AS or the AIS for each year would let this page check TDS, interest and dividends against what was reported.</li>
            <li className="text-text-secondary">Form 16 from each employer and the broker’s tax P&amp;L would confirm salary and trading figures.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}

// ---------- One return ----------

function Detail({ r, txns, onDelete }: { r: TaxReturn; txns: TaxTxn[]; onDelete: () => void }) {
  const m = useMoney()
  const i = r.income
  const checked = useMemo(() => verifyChallans(r, txns), [r, txns])
  const late = r.dueDate && r.filedOn && r.filedOn > r.dueDate
  const interest = r.tax.interest234A + r.tax.interest234B + r.tax.interest234C + r.tax.fee234F

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-secondary">
          <span className="font-semibold text-text">{r.form}</span> · {REGIME[r.regime]} · filed {r.filedOn ? dayLabel(r.filedOn) : '—'}
          {r.dueDate && <> (due {dayLabel(r.dueDate)})</>}
          {late && <span className="ml-1 text-error">· after the listed due date</span>}
        </p>
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-error/50 hover:text-error">
          <Trash2 className="h-3.5 w-3.5" /> Remove this return
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Section title="How the income adds up" note="Business loss (F&O and trading) can be set off against capital gains and other income, but not against salary.">
          <Row label="Gross salary" value={m.inr(i.grossSalary)} />
          {i.exemptAllowances > 0 && <Row muted label="Exempt allowances (HRA etc.)" value={`-${m.inr(i.exemptAllowances)}`} />}
          <Row muted label="Standard deduction" value={`-${m.inr(i.standardDeduction)}`} />
          <Row label="Income from salary" value={m.inr(i.salary)} strong />
          {i.houseProperty !== 0 && <Row label="House property" value={m.signed(i.houseProperty)} />}
          {i.business !== 0 && <Row label="Business / trading" value={m.signed(i.business)} />}
          {i.shortTermGains !== 0 && <Row label="Short-term capital gains" value={m.signed(i.shortTermGains)} />}
          {i.longTermGains !== 0 && <Row label="Long-term capital gains" value={m.signed(i.longTermGains)} />}
          <Row label="Other sources (interest, dividends)" value={m.inr(i.otherSources)} />
          <Row label="Gross total income" value={m.inr(i.grossTotal)} strong />
          {i.deductions > 0 && <Row muted label="Deductions (Chapter VI-A)" value={`-${m.inr(i.deductions)}`} />}
          <Row label="Taxable income" value={m.inr(i.taxable)} strong />
        </Section>

        <Section title="How the tax is worked out" note={`Effective rate ${m.pct(effectiveRate(r))} of taxable income.`}>
          <Row label="Tax on taxable income" value={m.inr(r.tax.beforeRebate)} />
          {r.tax.rebate87A > 0 && <Row muted label="Rebate u/s 87A" value={`-${m.inr(r.tax.rebate87A)}`} />}
          {r.tax.surcharge > 0 && <Row muted label="Surcharge" value={m.inr(r.tax.surcharge)} />}
          <Row muted label="Health & education cess (4%)" value={m.inr(r.tax.cess)} />
          {r.tax.relief > 0 && <Row muted label="Relief" value={`-${m.inr(r.tax.relief)}`} />}
          <Row label="Tax liability" value={m.inr(r.tax.liability)} strong />
          {r.tax.interest234B > 0 && <Row muted label="Interest 234B (advance tax short)" value={m.inr(r.tax.interest234B)} />}
          {r.tax.interest234C > 0 && <Row muted label="Interest 234C (instalments late)" value={m.inr(r.tax.interest234C)} />}
          {r.tax.interest234A > 0 && <Row muted label="Interest 234A (late filing)" value={m.inr(r.tax.interest234A)} />}
          {r.tax.fee234F > 0 && <Row muted label="Late fee 234F" value={m.inr(r.tax.fee234F)} />}
          <Row label={interest ? 'Tax + interest' : 'Total'} value={m.inr(r.tax.total)} strong />
        </Section>

        <Section title="What was paid" note={r.refund > 0 ? 'The refund is credited to the bank account given in the return.' : undefined}>
          {r.paid.tds > 0 && <Row label="TDS (employer and others)" value={m.inr(r.paid.tds)} />}
          {r.paid.tcs > 0 && <Row label="TCS" value={m.inr(r.paid.tcs)} />}
          {r.paid.advance > 0 && <Row label="Advance tax" value={m.inr(r.paid.advance)} />}
          {r.paid.selfAssessment > 0 && <Row label="Self-assessment tax" value={m.inr(r.paid.selfAssessment)} />}
          <Row label="Total paid" value={m.inr(r.paid.total)} strong />
          {r.refund > 0 && <Row label="Refund due" value={`+${m.inr(r.refund)}`} negative />}
          {r.payable > 0 && <Row label="Balance payable" value={m.inr(r.payable)} />}
        </Section>

        <Section title="TDS by deductor">
          {[...r.employers, ...r.otherTds].length === 0 ? (
            <p className="text-sm text-text-secondary">No TDS was reported.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {[...r.employers.map((e) => ({ ...e, kind: 'Salary' })), ...r.otherTds.map((e) => ({ ...e, kind: 'Other' }))].map((e) => (
                <li key={`${e.tan}-${e.kind}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-text">{e.name || e.tan}</span>
                    <span className="text-2xs text-text-secondary">
                      {e.kind} · {e.tan} · income {m.inr(e.income)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-text">{m.inr(e.tds)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Challans (tax you paid yourself)" note="A challan is checked against your bank statements by amount and date (within five days).">
          {checked.length === 0 ? (
            <p className="text-sm text-text-secondary">No advance or self-assessment tax was paid.</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {checked.map(({ challan, match }) => (
                <li key={`${challan.bsr}-${challan.serial}`} className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-text">{dayLabel(challan.date)}</span>
                    <span className="text-2xs text-text-secondary">
                      BSR {challan.bsr} · #{challan.serial}
                    </span>
                    <span className={cn('mt-0.5 flex items-center gap-1 text-2xs', match ? 'text-positive' : 'text-text-secondary')}>
                      {match ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Found in bank on {dayLabel(match.date)}
                        </>
                      ) : (
                        'Not found in the bank statements'
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-text">{m.inr(challan.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Deductions and exemptions" note={r.regime === 'new' ? 'The new regime allows almost no deductions, so 80C, 80D and HRA claims do not apply.' : undefined}>
          {r.deductions.length + r.allowances.length === 0 ? (
            <p className="text-sm text-text-secondary">None were claimed.</p>
          ) : (
            <>
              {r.allowances.map((a) => (
                <Row key={a.label} label={`Exempt ${a.label}`} value={m.inr(a.amount)} />
              ))}
              {r.deductions.map((d) => (
                <Row key={d.label} label={d.label} value={m.inr(d.amount)} />
              ))}
            </>
          )}
        </Section>

        {(r.trading || r.lossCarriedForward > 0 || r.foreignAssets) && (
          <Section title="Also in this return">
            {r.trading && <Row label="Trading turnover (F&O)" value={m.inr(r.trading.turnover)} />}
            {r.trading && <Row label="Trading profit / loss" value={m.signed(r.trading.profitLoss)} />}
            {r.lossCarriedForward > 0 && <Row label="Loss carried forward" value={m.inr(r.lossCarriedForward)} />}
            {r.foreignAssets && <Row label="Foreign assets (Schedule FA)" value="Reported" />}
            {r.lossCarriedForward > 0 && <p className="mt-2 text-2xs text-text-secondary">A carried-forward business loss can be set off against business income for 8 years, only if the return was filed on time.</p>}
          </Section>
        )}
      </div>
    </div>
  )
}

// ---------- Transactions ----------

function Transactions({ txns, returns }: { txns: TaxTxn[]; returns: TaxReturn[] }) {
  const m = useMoney()
  const years = byYear(txns)
  const fys = years.map((y) => y.fy).reverse()
  const [fy, setFy] = useState<string>('all')
  const [kinds, setKinds] = useState<Set<TaxKind>>(new Set())
  const scoped = txns.filter((t) => fy === 'all' || t.fy === fy)
  const sums = KINDS.map((k) => ({ k, total: scoped.filter((t) => t.kind === k.id).reduce((s, t) => s + t.amount, 0), count: scoped.filter((t) => t.kind === k.id).length }))
  const shown = scoped.filter((t) => kinds.size === 0 || kinds.has(t.kind)).reverse()
  const ret = fy === 'all' ? null : returns.find((r) => fyOfAy(r.ay) === fy)
  const challanTotal = ret ? ret.challans.reduce((s, c) => s + c.amount, 0) : 0
  const bankTax = scoped.filter((t) => t.kind === 'taxPaid' && !t.credit).reduce((s, t) => s + t.amount, 0)

  const toggle = (k: TaxKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (!next.delete(k)) next.add(k)
      return next
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Financial year">
        {['all', ...fys].map((y) => (
          <button
            key={y}
            type="button"
            aria-pressed={fy === y}
            onClick={() => setFy(y)}
            className={cn('rounded-full border px-3 py-1.5 text-xs transition-colors', fy === y ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text')}
          >
            {y === 'all' ? 'All years' : fyLabel(y)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {sums.map(({ k, total, count }) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kinds.has(k.id)}
            onClick={() => toggle(k.id)}
            className={cn('relative overflow-hidden rounded-[20px] border bg-card/70 px-4 py-2.5 text-left transition-colors', kinds.has(k.id) ? 'border-accent/60' : 'border-border hover:border-accent/30')}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: k.color }} />
            <p className="label-caps">{k.label}</p>
            <p className="mt-0.5 font-mono text-lg font-semibold text-text">{m.inr(total)}</p>
            <p className="text-2xs text-text-secondary">
              {count} transaction{count === 1 ? '' : 's'} · {k.role}
            </p>
          </button>
        ))}
      </div>

      {ret && (
        <GlassCard hover={false} className="flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-xs text-text-secondary">
          <span>
            Return {fyLabel(fy)} lists <span className="font-mono text-text">{m.inr(challanTotal)}</span> paid through challans.
          </span>
          <span>
            Bank statements show <span className="font-mono text-text">{m.inr(bankTax)}</span> paid to the Income Tax Department in the year
            {Math.round(bankTax) === Math.round(challanTotal) ? ' — they agree.' : '.'}
          </span>
        </GlassCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <GlassCard hover={false} className="p-4">
          <h3 className="mb-2 card-title">
            Transactions considered <span className="font-normal text-text-secondary">· {shown.length}</span>
          </h3>
          {shown.length === 0 ? (
            <p className="text-sm text-text-secondary">Nothing matched. Upload more statements on <Link to="/admin/bank-statements" className="text-accent hover:underline">Bank Statements</Link> or <Link to="/admin/credit-cards" className="text-accent hover:underline">Credit Cards</Link>.</p>
          ) : (
            <div className="max-h-[36rem] overflow-y-auto pr-1">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border label-caps">
                    <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Counted as</th>
                    <th scope="col" className="hidden py-2 pr-3 font-medium md:table-cell">Details</th>
                    <th scope="col" className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={`${t.source}-${t.id}`} className="border-b border-border/60 align-top">
                      <td className="whitespace-nowrap py-2 pr-3 font-mono text-text-secondary">{t.date}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1.5 text-text">
                          <span className="h-2 w-2 rounded-full" style={{ background: KIND[t.kind].color }} /> {KIND[t.kind].label}
                        </span>
                        <span className="block text-2xs uppercase text-text-secondary">
                          {KIND[t.kind].role} · {t.source} · {fyLabel(t.fy)}
                        </span>
                      </td>
                      <td className="hidden max-w-[26rem] truncate py-2 pr-3 font-mono text-2xs text-text-secondary md:table-cell" title={t.description}>
                        {t.description}
                      </td>
                      <td className={cn('whitespace-nowrap py-2 text-right font-mono font-semibold', t.credit ? 'text-positive' : 'text-text')}>
                        {t.credit ? '+' : ''}
                        {m.inr(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        <GlassCard hover={false} className="h-fit p-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <h3 className="mb-3 label-caps">What counts for tax</h3>
          <ul className="space-y-3 text-2xs leading-relaxed text-text-secondary">
            {KINDS.map((k) => (
              <li key={k.id}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
                  <span className="h-2 w-2 rounded-full" style={{ background: k.color }} /> {k.label}
                </p>
                {k.why}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-2xs leading-relaxed text-text-secondary">
            Card bill payments and transfers between your own accounts are left out. Deduction rows are only candidates: the return, not the bank, decides what was claimed.
          </p>
        </GlassCard>
      </div>
    </div>
  )
}

// ---------- Page ----------

/** Income-tax returns year by year, and the bank and card transactions that matter for tax. */
export function TaxInformation() {
  const [returns, setReturns] = useState<TaxReturn[] | null>(null)
  const [returnsError, setReturnsError] = useState<string | null>(null)
  const [statements, setStatements] = useState<{ bank: Txn[]; card: Txn[] }>({ bank: [], card: [] })
  const [tab, setTab] = useState<Tab>('overview')
  const [ay, setAy] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchReturns()
      .then((r) => !cancelled && setReturns(r))
      .catch((e) => {
        if (cancelled) return
        setReturnsError(e instanceof Error ? e.message : 'Could not load your returns.')
        setReturns([])
      })
    Promise.all([fetchStatements('bank'), fetchStatements('card')])
      .then(([bank, card]) => !cancelled && setStatements({ bank: bank.transactions, card: card.transactions }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const years = useMemo(() => latestPerYear(returns ?? []), [returns])
  const txns = useMemo(() => taxTxns(statements.bank, statements.card), [statements])
  const selected = years.find((r) => r.ay === ay) ?? years[years.length - 1]

  const upload = useCallback(async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setNotice(null)
    try {
      const read = await readReturnFiles(files)
      if (!read.returns.length) throw new Error(`${read.skipped.join(', ')} ${read.skipped.length === 1 ? 'is' : 'are'} not an income-tax return JSON from the e-filing portal.`)
      const saved = await saveReturns(read.returns)
      setReturns(saved)
      setReturnsError(null)
      setNotice({ ok: true, text: `Saved ${read.returns.map((r) => `${ayLabel(r.ay)} (${r.form})`).join(', ')}.${read.skipped.length ? ` Skipped ${read.skipped.join(', ')}.` : ''}` })
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not save those files.' })
    } finally {
      setBusy(false)
    }
  }, [])

  const remove = async (year: string) => {
    if (!window.confirm(`Remove the ${ayLabel(year)} return from this dashboard? Your file on the e-filing portal is not affected.`)) return
    try {
      setReturns(await deleteReturn(year))
      setAy(null)
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Could not remove that return.' })
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    void upload([...e.dataTransfer.files])
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4" onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3.5">
          <PageBadge />
          <div className="min-w-0">
          <p className="page-eyebrow">Finance</p>
          <h1 className="mt-1 page-title">Tax Information</h1>
          <p className="page-lede">
            What you paid in income tax each year, how it was worked out, and which transactions in your bank and card statements matter for tax. Add the JSON file from each filed return.
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              void upload(files)
            }}
          />
          <button
            type="button"
            data-cursor="hover"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-3.5 py-2 text-xs font-medium text-accent hover:bg-accent/15 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} Add return JSON
          </button>
          <HideNumbersButton />
        </div>
      </div>

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={cn('rounded-xl border px-3 py-2 text-xs', notice.ok ? 'border-positive/30 bg-positive/10 text-positive' : 'border-error/30 bg-error/10 text-error')}>
          {notice.text}
        </p>
      )}
      {returnsError && (
        <GlassCard hover={false} className="p-4 text-sm text-error" role="alert">
          {returnsError}
        </GlassCard>
      )}

      {returns === null ? (
        <GlassCard hover={false} className="flex items-center justify-center gap-2 p-12 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your returns…
        </GlassCard>
      ) : years.length === 0 ? (
        <GlassCard hover={false} className={cn('flex flex-col items-center gap-3 p-10 text-center', drag && 'border-accent/60')}>
          <FileJson className="h-8 w-8 text-accent" />
          <p className="text-sm font-semibold text-text">No returns added yet</p>
          <p className="max-w-md text-xs leading-relaxed text-text-secondary">
            On the e-filing portal open e-File → Income Tax Returns → View Filed Returns, and download the JSON for each year. Drop the files here — several at once is fine. Only the tax figures are kept; Aadhaar, address and bank details are not.
          </p>
          <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-4 py-2 text-xs font-medium text-accent">
            <UploadCloud className="h-3.5 w-3.5" /> Choose JSON files
          </button>
          {txns.length > 0 && (
            <button type="button" onClick={() => setTab('transactions')} className="text-xs text-accent hover:underline">
              Or see the {txns.length} tax-related transactions already in your statements
            </button>
          )}
        </GlassCard>
      ) : null}

      {returns !== null && (years.length > 0 || tab === 'transactions') && (
        <>
          <div role="tablist" aria-label="Tax views" className="inline-flex rounded-full border border-border bg-surface-2 p-0.5 text-xs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn('rounded-full px-3.5 py-1.5 transition-colors', tab === t.id ? 'bg-accent/15 font-semibold text-accent' : 'text-text-secondary hover:text-text')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && years.length > 0 && (
            <Overview
              returns={years}
              txns={txns}
              bank={statements.bank}
              onOpen={(y) => {
                setAy(y)
                setTab('returns')
              }}
            />
          )}

          {tab === 'returns' && selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Year">
                {[...years].reverse().map((r) => (
                  <button
                    key={r.ay}
                    type="button"
                    aria-pressed={selected.ay === r.ay}
                    onClick={() => setAy(r.ay)}
                    className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors', selected.ay === r.ay ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:text-text')}
                  >
                    <Receipt className="h-3.5 w-3.5" /> {fyLabel(fyOfAy(r.ay))}
                  </button>
                ))}
              </div>
              <Detail r={selected} txns={txns} onDelete={() => void remove(selected.ay)} />
            </div>
          )}

          {tab === 'transactions' && <Transactions txns={txns} returns={years} />}
        </>
      )}
    </div>
  )
}
