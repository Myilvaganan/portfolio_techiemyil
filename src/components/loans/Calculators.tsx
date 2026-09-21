import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calculator } from 'lucide-react'
import { Chips } from '@/components/statements/parts'
import { GlassCard } from '@/components/ui/GlassCard'
import { AreaChart, BarChart, Legend } from '@/components/viz/charts'
import { CountNumber, Reveal } from '@/components/viz/motion'
import { cn } from '@/lib/utils'
import { dayLabel } from '@/lib/statements'
import {
  addMonths,
  bestLumpTarget,
  closeByDate,
  extraEmiImpact,
  foreclosure,
  foreclosureTimeline,
  loanInr,
  monthYear,
  monthsBetween,
  monthsSpan,
  prepayImpact,
  remainingMonths,
  simulatePortfolio,
  type FeeAssumption,
  type Impact,
  type Loan,
  type PayoffOrder,
  type Sim,
} from '@/lib/loans'

type Tab = 'prepay' | 'extra' | 'close' | 'target' | 'compare'

function Stat({ label, value, sub, tone, big }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; big?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-3.5', tone === 'good' ? 'border-positive/35 bg-positive/[0.08]' : tone === 'bad' ? 'border-error/35 bg-error/[0.08]' : tone === 'warn' ? 'border-amber-500/35 bg-amber-500/[0.08]' : 'border-border bg-surface-2')}>
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn('mt-1 font-mono font-semibold', big ? 'text-xl' : 'text-base', tone === 'good' && 'text-positive', tone === 'bad' && 'text-error', tone === 'warn' && 'text-amber-500', !tone && 'text-text')}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-text-secondary">{sub}</p>}
    </div>
  )
}

function NumberField({ label, value, onChange, step = 1000, max, suffix, hint }: { label: string; value: number; onChange: (n: number) => void; step?: number; max?: number; suffix?: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[11px] text-text-secondary">
      <span className="font-medium uppercase tracking-wide">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={0} max={max} step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none focus:border-accent/50" />
        {suffix && <span className="shrink-0 text-text-secondary">{suffix}</span>}
      </span>
      {max !== undefined && <input type="range" aria-label={`${label} slider`} min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full cursor-pointer accent-accent" />}
      {hint && <span className="text-[10px] text-text-secondary/70">{hint}</span>}
    </label>
  )
}

function CompareChart({ base, after, afterLabel }: { base: Sim; after: Sim; afterLabel: string }) {
  if (!base.rows.length) return null
  const labels = base.rows.map((r) => dayLabel(r.date))
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Balance: current plan vs with your change</p>
        <Legend items={[{ label: 'Current plan', color: 'var(--viz-1)' }, { label: afterLabel, color: 'var(--viz-3)' }]} />
      </div>
      <AreaChart
        labels={labels}
        series={[
          { key: 'base', label: 'Current plan', color: 'var(--viz-1)', values: base.rows.map((r) => r.closing) },
          { key: 'after', label: afterLabel, color: 'var(--viz-3)', values: base.rows.map((_, i) => after.rows[i]?.closing ?? 0) },
        ]}
        height={200}
        format={loanInr}
      />
    </div>
  )
}

function ImpactStats({ imp, showFee }: { imp: Impact; showFee?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Finishes" value={imp.after.endDate ? monthYear(imp.after.endDate) : 'Now'} sub={`${imp.after.months} months left (was ${imp.base.months})`} />
      <Stat label="Time saved" value={monthsSpan(imp.monthsSaved)} tone={imp.monthsSaved > 0 ? 'good' : undefined} sub={imp.base.endDate ? `instead of ${monthYear(imp.base.endDate)}` : undefined} />
      <Stat label="Interest saved" value={<CountNumber value={imp.interestSaved} format={loanInr} />} tone={imp.interestSaved > 0 ? 'good' : undefined} sub={`interest left: ${loanInr(imp.after.totalInterest)}`} />
      {showFee ? <Stat label="Net saving after fee" value={<CountNumber value={imp.netSaving} format={loanInr} />} tone={imp.netSaving > 0 ? 'good' : 'bad'} sub={`pre-closure fee ${loanInr(imp.fee)}`} /> : <Stat label="New monthly outgo" value={loanInr(imp.newEmi)} sub="EMI + extra" />}
    </div>
  )
}

export function Calculators({ loans, fee, onFee }: { loans: Loan[]; fee: FeeAssumption; onFee: (f: FeeAssumption) => void }) {
  const [tab, setTab] = useState<Tab>('prepay')
  const [account, setAccount] = useState(loans[0]?.accountNo ?? '')
  const loan = loans.find((l) => l.accountNo === account) ?? loans[0]

  const [lump, setLump] = useState(100000)
  const [mode, setMode] = useState<'tenure' | 'emi'>('tenure')
  const [extra, setExtra] = useState(5000)
  const [target, setTarget] = useState('')
  const [budget, setBudget] = useState(5000)
  const [lumpAll, setLumpAll] = useState(200000)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'prepay', label: 'Part-prepayment' },
    { id: 'extra', label: 'Extra every month' },
    { id: 'close', label: 'Close it now' },
    { id: 'target', label: 'Debt-free by a date' },
    ...(loans.length > 1 ? [{ id: 'compare' as const, label: 'Which loan first?' }] : []),
  ]

  const prepay = useMemo(() => (loan ? prepayImpact(loan, lump, mode, fee) : null), [loan, lump, mode, fee])
  const extraImp = useMemo(() => (loan ? extraEmiImpact(loan, extra) : null), [loan, extra])
  const fc = useMemo(() => (loan ? foreclosure(loan, fee) : null), [loan, fee])
  const timeline = useMemo(() => (loan ? foreclosureTimeline(loan, fee) : []), [loan, fee])
  const defaultTarget = loan?.endDate ? addMonths(loan.endDate, -24) : ''
  const targetDate = target || defaultTarget
  const by = useMemo(() => (loan && targetDate ? closeByDate(loan, targetDate, fee) : null), [loan, targetDate, fee])
  const lumpChoices = useMemo(() => bestLumpTarget(loans, lumpAll, fee), [loans, lumpAll, fee])
  const strategies = useMemo(() => {
    const none = simulatePortfolio(loans, 0, 'none')
    const rows: { id: PayoffOrder; label: string; note: string }[] = [
      { id: 'rate', label: 'Highest rate first', note: 'the classic “avalanche”' },
      { id: 'balance', label: 'Smallest balance first', note: 'the “snowball” — quick wins' },
      { id: 'longest', label: 'Longest remaining first', note: 'best when rates are equal' },
    ]
    return { none, list: rows.map((r) => ({ ...r, sim: simulatePortfolio(loans, budget, r.id) })) }
  }, [loans, budget])

  if (!loan) return null
  const maxAmount = Math.round(loan.outstanding / 1000) * 1000

  return (
    <GlassCard hover={false} className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          <Calculator className="h-4 w-4 text-accent" /> Prepayment & closure calculators
        </h2>
        {loans.length > 1 && tab !== 'compare' && (
          <select value={loan.accountNo} onChange={(e) => setAccount(e.target.value)} aria-label="Loan" className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50">
            {loans.map((l) => (
              <option key={l.accountNo} value={l.accountNo} className="bg-card">{l.label}</option>
            ))}
          </select>
        )}
      </div>
      <Chips label="Calculator" value={tab} onChange={setTab} options={tabs} />

      <div className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-2 p-3.5 sm:grid-cols-[1fr_1fr_2fr]">
        <NumberField label="Pre-closure fee (%)" value={fee.feePct} step={0.5} max={10} onChange={(n) => onFee({ ...fee, feePct: n })} />
        <NumberField label="GST on fee (%)" value={fee.gstPct} step={1} onChange={(n) => onFee({ ...fee, gstPct: n })} />
        <p className="self-center text-[11px] leading-relaxed text-text-secondary">
          <strong className="text-text">Assumption:</strong> your statement says pre-closure charges apply but not the rate. Banks typically charge a % of the amount prepaid (often falling with age of the loan). Ask ICICI for the exact rate and any free part-prepayment allowance, then set it here — every calculator and the advice below update.
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab + loan.accountNo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-5">
          {tab === 'prepay' && prepay && (
            <div>
              <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
                <div>
                  <NumberField label="Amount to prepay now (₹)" value={lump} step={5000} max={maxAmount} onChange={setLump} hint={`Outstanding ${loanInr(loan.outstanding)}`} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[50000, 100000, 200000, 500000].map((v) => (
                      <button key={v} type="button" data-cursor="hover" onClick={() => setLump(v)} className={cn('rounded-md border px-2.5 py-1 text-[11px] transition-colors', lump === v ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/40')}>
                        {loanInr(v)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">What should the bank do with it?</p>
                  <Chips label="Mode" value={mode} onChange={setMode} options={[{ id: 'tenure', label: 'Finish sooner (keep EMI)' }, { id: 'emi', label: 'Lower the EMI (same end date)' }]} />
                  <p className="mt-2 text-[11px] text-text-secondary">{mode === 'tenure' ? 'Saves the most interest.' : `EMI drops to ${loanInr(prepay.newEmi)}. Better for cash-flow, saves less interest.`}</p>
                </div>
              </div>
              <div className="mt-4"><ImpactStats imp={prepay} showFee /></div>
              <p className="mt-3 text-xs text-text-secondary">
                You pay <strong className="text-text">{loanInr(prepay.outflowNow)}</strong> today ({loanInr(Math.min(lump, loan.outstanding))} + {loanInr(prepay.fee)} fee incl. GST) to save <strong className="text-accent">{loanInr(prepay.interestSaved)}</strong> in interest.
                {prepay.netSaving < 0 ? ' At this fee the prepayment costs more than it saves.' : ''}
              </p>
              <CompareChart base={prepay.base} after={prepay.after} afterLabel="After prepayment" />
            </div>
          )}

          {tab === 'extra' && extraImp && (
            <div>
              <NumberField label="Extra to pay with every EMI (₹ / month)" value={extra} step={500} max={50000} onChange={setExtra} hint={`Your EMI is ${loanInr(loan.emi)} — this makes it ${loanInr(loan.emi + extra)}`} />
              <div className="mt-4"><ImpactStats imp={extraImp} /></div>
              <p className="mt-3 text-xs text-text-secondary">Many banks allow part-payments only in multiples or after a lock-in; if extra EMIs aren&apos;t allowed, save the same amount and prepay in one lump every few months.</p>
              <CompareChart base={extraImp.base} after={extraImp.after} afterLabel={`With +${loanInr(extra)}/month`} />
            </div>
          )}

          {tab === 'close' && fc && (
            <div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Principal outstanding" value={loanInr(fc.outstanding)} />
                <Stat label="Accrued interest" value={loanInr(fc.accrued)} sub="since last EMI" />
                <Stat label={`Pre-closure fee (${fee.feePct}% + GST)`} value={loanInr(fc.fee)} tone="warn" />
                <Stat label="Pay to close today" value={<CountNumber value={fc.total} format={loanInr} />} big tone="good" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                <Stat label="If you keep paying" value={loanInr(fc.remainingIfContinue)} sub={`${remainingMonths(loan)} more EMIs (${loanInr(fc.interestIfContinue)} is interest)`} />
                <Stat label="Net saving by closing now" value={<CountNumber value={fc.netSaving} format={loanInr} />} tone={fc.netSaving > 0 ? 'good' : 'bad'} sub="after the fee" />
                <Stat label="Fee as share of the saving" value={`${fc.feePctOfSaving.toFixed(1)}%`} sub="lower is better" />
              </div>
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Net saving if you keep paying for k more EMIs, then close</p>
                <BarChart labels={timeline.map((t) => (t.k % 6 === 0 ? `${t.k}m` : ''))} bars={[{ key: 's', label: 'Net saving', color: 'var(--viz-3)', values: timeline.map((t) => Math.max(0, t.netSaving)) }]} height={200} format={loanInr} />
                <p className="mt-2 text-[11px] text-text-secondary">The saving shrinks every month you wait — the interest still left to avoid keeps falling while the fee is a % of what you owe.</p>
              </div>
            </div>
          )}

          {tab === 'target' && (
            <div>
              <label className="flex max-w-xs flex-col gap-1.5 text-[11px] text-text-secondary">
                <span className="font-medium uppercase tracking-wide">I want to be debt-free by</span>
                <input type="month" value={targetDate.slice(0, 7)} min={addMonths(loan.asOf, 1).slice(0, 7)} max={loan.endDate.slice(0, 7)} onChange={(e) => e.target.value && setTarget(`${e.target.value}-05`)} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent/50" />
                <span className="text-[10px] text-text-secondary/70">Current end date: {loan.endDate ? monthYear(loan.endDate) : '—'} ({monthsBetween(targetDate, loan.endDate)} months earlier if you hit the target)</span>
              </label>
              {by && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-accent/35 bg-accent/[0.06] p-4">
                    <p className="text-xs font-semibold text-text">Option A — pay a little extra every month</p>
                    {by.extraMonthly === null ? (
                      <p className="mt-2 text-xs text-text-secondary">Not reachable with monthly extras alone.</p>
                    ) : by.extraMonthly === 0 ? (
                      <p className="mt-2 text-xs text-text-secondary">Your current plan already finishes by then.</p>
                    ) : (
                      <>
                        <p className="mt-2 font-mono text-2xl font-semibold text-accent"><CountNumber value={by.extraMonthly} format={loanInr} /> <span className="text-xs font-normal text-text-secondary">extra / month</span></p>
                        {by.extraImpact && <p className="mt-1 text-xs text-text-secondary">Total EMI becomes {loanInr(loan.emi + by.extraMonthly)} and saves {loanInr(by.extraImpact.interestSaved)} in interest.</p>}
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-sky-500/35 bg-sky-500/[0.06] p-4">
                    <p className="text-xs font-semibold text-text">Option B — one lump sum today</p>
                    {by.lumpNow === null ? (
                      <p className="mt-2 text-xs text-text-secondary">Not reachable with a single part-payment.</p>
                    ) : by.lumpNow === 0 ? (
                      <p className="mt-2 text-xs text-text-secondary">Your current plan already finishes by then.</p>
                    ) : (
                      <>
                        <p className="mt-2 font-mono text-2xl font-semibold text-sky-500"><CountNumber value={by.lumpNow} format={loanInr} /> <span className="text-xs font-normal text-text-secondary">once, now</span></p>
                        {by.lumpImpact && <p className="mt-1 text-xs text-text-secondary">Plus {loanInr(by.lumpImpact.fee)} pre-closure fee; net interest saving {loanInr(by.lumpImpact.netSaving)}.</p>}
                      </>
                    )}
                  </div>
                </div>
              )}
              {by?.extraImpact && <CompareChart base={by.extraImpact.base} after={by.extraImpact.after} afterLabel="With the monthly extra" />}
            </div>
          )}

          {tab === 'compare' && loans.length > 1 && (
            <div className="space-y-6">
              <div>
                <NumberField label="I have a lump sum of (₹)" value={lumpAll} step={10000} max={1000000} onChange={setLumpAll} />
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-secondary">
                        <th className="py-2 pr-3 font-medium">Put it on…</th>
                        <th className="py-2 pr-3 text-right font-medium">Interest saved</th>
                        <th className="py-2 pr-3 text-right font-medium">Fee</th>
                        <th className="py-2 pr-3 text-right font-medium">Net saving</th>
                        <th className="py-2 text-right font-medium">Sooner by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lumpChoices.map((c, i) => (
                        <tr key={c.loan.accountNo} className={cn('border-b border-border/60', i === 0 && 'bg-accent/[0.07]')}>
                          <td className="py-2.5 pr-3 font-medium text-text">{c.loan.label}{i === 0 && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">BEST</span>}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-text">{loanInr(c.impact.interestSaved)}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-text-secondary">{loanInr(c.impact.fee)}</td>
                          <td className={cn('py-2.5 pr-3 text-right font-mono font-semibold', c.impact.netSaving > 0 ? 'text-positive' : 'text-error')}>{loanInr(c.impact.netSaving)}</td>
                          <td className="py-2.5 text-right font-mono text-text-secondary">{monthsSpan(c.impact.monthsSaved)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <NumberField label="Extra I can pay every month across all loans (₹)" value={budget} step={1000} max={100000} onChange={setBudget} hint="When a loan closes, its EMI automatically rolls onto the next one." />
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Stat label="No extra payments" value={strategies.none.endDate ? monthYear(strategies.none.endDate) : '—'} sub={`interest ${loanInr(strategies.none.totalInterest)}`} />
                  {strategies.list.map((s) => (
                    <Stat key={s.id} label={s.label} value={s.sim.endDate ? monthYear(s.sim.endDate) : '—'} tone="good" sub={`saves ${loanInr(strategies.none.totalInterest - s.sim.totalInterest)} · ${strategies.none.months - s.sim.months} months sooner`} />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-text-secondary">{strategies.list.map((s) => `${s.label}: ${s.note}`).join(' · ')}. Debt-free date assumes all EMIs are paid on time.</p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <Reveal>
        <p className="mt-5 text-[11px] leading-relaxed text-text-secondary/80">Calculations use a reducing balance at the loan&apos;s rate ÷ 12 and track ICICI&apos;s own schedule within about 0.5%. Real figures depend on the bank&apos;s foreclosure quote, so treat these as planning numbers.</p>
      </Reveal>
    </GlassCard>
  )
}
