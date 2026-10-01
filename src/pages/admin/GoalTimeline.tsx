import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Flag, Mountain } from 'lucide-react'
import { Field, Loading, PageHero, Panel, Stat, inputCls } from '@/components/growth/kit'
import { useMoney } from '@/lib/privacy'
import { useSources } from '@/lib/growth/sources'

// When will you be debt-free, and when will you reach your net-worth goal? Move the sliders to see how saving more,
// a better return or prepaying loans changes the dates.

const monthLabel = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

/** Months until a loan pool is cleared, paying the EMIs plus `extra` a month (avalanche: extra goes to the dearest loan). */
export function monthsToDebtFree(loans: { outstanding: number; ratePct: number; emi: number }[], extra: number, max = 600) {
  const pool = loans.filter((l) => l.outstanding > 0).map((l) => ({ ...l }))
  let n = 0
  while (pool.some((l) => l.outstanding > 0.5) && n < max) {
    n++
    let spare = extra
    for (const l of pool) {
      if (l.outstanding <= 0) {
        spare += l.emi
        continue
      }
      l.outstanding = l.outstanding * (1 + l.ratePct / 1200) - l.emi
      if (l.outstanding < 0) {
        spare += -l.outstanding
        l.outstanding = 0
      }
    }
    for (const l of [...pool].sort((a, b) => b.ratePct - a.ratePct)) {
      if (spare <= 0) break
      const pay = Math.min(spare, l.outstanding)
      l.outstanding -= pay
      spare -= pay
    }
  }
  return n
}

/** Months until net worth reaches the goal, saving `monthly` at `ratePct` a year. */
export function monthsToGoal(start: number, goal: number, monthly: number, ratePct: number, max = 600) {
  let v = start
  let n = 0
  while (v < goal && n < max) {
    v = v * (1 + ratePct / 1200) + monthly
    n++
  }
  return v >= goal ? n : null
}

export function GoalTimeline() {
  const m = useMoney()
  const { data, loading } = useSources(['loans', 'snapshots'])
  const latest = data.snapshots?.[data.snapshots.length - 1]
  const [goal, setGoal] = useState(10_000_000)
  const [monthly, setMonthly] = useState(30_000)
  const [ret, setRet] = useState(10)
  const [extra, setExtra] = useState(0)

  const loans = useMemo(() => (data.loans ?? []).map((l) => ({ outstanding: l.outstanding, ratePct: l.ratePct, emi: l.emi })), [data.loans])
  const debtNow = loans.reduce((s, l) => s + l.outstanding, 0)
  const debtFree = monthsToDebtFree(loans, extra)
  const debtFreeBase = monthsToDebtFree(loans, 0)
  const start = latest?.net ?? 0
  const toGoal = monthsToGoal(start, goal, monthly, ret)

  if (loading) return <Loading label="Projecting…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Money" title="Goal timeline" lede="When you’ll be debt-free and when you’ll reach your net-worth goal — move the sliders to see what changes the dates." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net worth now" value={latest ? m.inr(start) : '—'} sub={latest ? `as of ${latest.month}` : 'Take a snapshot in Net Worth'} />
        <Stat label="Debt now" value={m.inr(debtNow)} tone={debtNow ? 'bad' : 'good'} />
        <Stat label="Debt-free" value={debtNow ? monthLabel(debtFree) : 'Already'} sub={extra && debtFreeBase > debtFree ? `${debtFreeBase - debtFree} months sooner` : undefined} tone="good" />
        <Stat label="Goal reached" value={toGoal != null ? monthLabel(toGoal) : '50+ years'} sub={toGoal != null ? `${Math.floor(toGoal / 12)}y ${toGoal % 12}m` : undefined} tone="gold" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Debt-free date" action={<Flag className="h-4 w-4 text-positive" />}>
          <Field label={`Extra towards loans each month: ${m.inr(extra)}`}>
            <input type="range" min={0} max={100_000} step={1000} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="w-full accent-emerald-500" />
          </Field>
          <Track months={debtFree} base={debtFreeBase} color="bg-positive" />
          <p className="mt-2 text-sm text-text-secondary">Extra goes to the highest-interest loan first; each cleared loan’s EMI rolls into the next.</p>
        </Panel>
        <Panel title="Net-worth goal" action={<Mountain className="h-4 w-4 text-accent" />}>
          <div className="space-y-3">
            <Field label="Goal (₹)"><input className={inputCls} inputMode="numeric" value={goal} onChange={(e) => setGoal(Number(e.target.value.replace(/\D/g, '')) || 0)} /></Field>
            <Field label={`Saving each month: ${m.inr(monthly)}`}>
              <input type="range" min={0} max={300_000} step={5000} value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} className="w-full accent-amber-500" />
            </Field>
            <Field label={`Expected return: ${ret}% a year`}>
              <input type="range" min={0} max={18} step={0.5} value={ret} onChange={(e) => setRet(Number(e.target.value))} className="w-full accent-amber-500" />
            </Field>
            {toGoal != null && <Track months={toGoal} color="bg-accent" />}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Track({ months, base, color }: { months: number; base?: number; color: string }) {
  const max = Math.max(months, base ?? 0, 12)
  return (
    <div className="mt-3">
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-5">
        {base != null && base > months && <span className="absolute inset-y-0 left-0 rounded-full bg-surface-15" style={{ width: `${(base / max) * 100}%` }} />}
        <motion.span className={`absolute inset-y-0 left-0 rounded-full ${color}`} animate={{ width: `${(months / max) * 100}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
      </div>
      <div className="mt-1 flex justify-between text-2xs text-text-secondary"><span>Now</span><span>{monthLabel(months)}</span></div>
    </div>
  )
}
