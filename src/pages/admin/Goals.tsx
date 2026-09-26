import { useCallback, useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'framer-motion'
import { Bike, Home, LifeBuoy, Pencil, Plus, ShieldCheck, Target, Trash2, X } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Chips } from '@/components/statements/parts'
import { Reveal } from '@/components/viz/motion'
import { useStatements } from '@/hooks/useStatements'
import { useLoans } from '@/hooks/useLoans'
import { averageMonthlySpend, emergencyTarget, planGoal, type Goal, type GoalKind } from '@/lib/goals'
import { DEFAULT_FEE } from '@/lib/loans'
import { bankAccountBalances, computeNetWorth } from '@/lib/netWorth'
import { HOLDINGS, totalValue } from '@/lib/portfolio'
import { cardsSummary } from '@/lib/statements'
import { useMoney } from '@/lib/privacy'
import { deleteGoal, fetchGoals, saveGoal } from '@/lib/wealthApi'
import { cn } from '@/lib/utils'

const KINDS: { id: GoalKind; label: string; icon: typeof Home }[] = [
  { id: 'house', label: 'House', icon: Home },
  { id: 'bike', label: 'Bike', icon: Bike },
  { id: 'emergency', label: 'Emergency', icon: LifeBuoy },
  { id: 'other', label: 'Other', icon: Target },
]
const STATUS = {
  done: { label: 'Reached', cls: 'text-positive' },
  'on-track': { label: 'On track', cls: 'text-positive' },
  behind: { label: 'Behind', cls: 'text-error' },
  'no-plan': { label: 'No monthly plan', cls: 'text-amber-500' },
} as const

type Basis = 'saved' | 'networth'
type Draft = { id?: string; name: string; targetAmount: string; targetDate: string; startAmount: string; monthlyContribution: string; kind: GoalKind }

const todayIso = () => new Date().toISOString().slice(0, 10)
const inYears = (y: number) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() + y)
  return d.toISOString().slice(0, 10)
}
const blank = (): Draft => ({ name: '', targetAmount: '', targetDate: inYears(1), startAmount: '', monthlyContribution: '', kind: 'other' })

function Ring({ pct, tone }: { pct: number; tone: string }) {
  const R = 30
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" role="img" aria-label={`${pct.toFixed(0)}% complete`}>
        <circle cx="38" cy="38" r={R} fill="none" stroke="currentColor" className="text-surface-7" strokeWidth="7" />
        <circle cx="38" cy="38" r={R} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold text-text">{pct.toFixed(0)}%</span>
    </div>
  )
}

const fieldCls = 'mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent/50'

export function Goals() {
  const money = useMoney()
  const bank = useStatements('bank', {}, false)
  const card = useStatements('card', {}, false)
  const loansHook = useLoans(DEFAULT_FEE, false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [basis, setBasis] = useState<Basis>('saved')
  const [returnPct, setReturnPct] = useState(0)

  const reload = useCallback(async () => {
    try {
      setGoals(await fetchGoals())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  const netWorth = useMemo(() => {
    const balances = bankAccountBalances(bank.data.transactions, bank.data.statements).map((b) => ({ label: b.label, balance: b.balance }))
    const dues = cardsSummary(card.data.transactions, card.data.statements).map((c) => ({ label: c.label, due: c.totalDue ?? 0 }))
    return computeNetWorth({ portfolioValue: totalValue(HOLDINGS), bankBalances: balances, loanOutstanding: loansHook.loans.map((l) => ({ label: l.label, outstanding: l.outstanding })), cardDues: dues }).netWorth
  }, [bank.data, card.data, loansHook.loans])
  const avgSpend = useMemo(() => averageMonthlySpend(bank.data.transactions), [bank.data.transactions])

  const today = todayIso()
  const plans = useMemo(() => goals.map((g) => ({ goal: g, plan: planGoal(g, basis === 'networth' ? Math.max(0, netWorth) : (g.startAmount ?? 0), today, returnPct) })), [goals, basis, netWorth, today, returnPct])

  function edit(g: Goal) {
    setDraft({ id: g.id, name: g.name, targetAmount: String(g.targetAmount), targetDate: g.targetDate, startAmount: g.startAmount != null ? String(g.startAmount) : '', monthlyContribution: g.monthlyContribution != null ? String(g.monthlyContribution) : '', kind: g.kind })
  }

  function emergencyPreset() {
    setDraft({ ...blank(), name: 'Emergency fund', kind: 'emergency', targetAmount: avgSpend > 0 ? String(emergencyTarget(avgSpend)) : '', targetDate: inYears(1) })
  }

  async function submit() {
    if (!draft) return
    const targetAmount = Number(draft.targetAmount)
    if (!draft.name.trim() || !(targetAmount > 0)) {
      setError('Give the goal a name and a target amount.')
      return
    }
    setBusy(true)
    try {
      const body: Omit<Goal, 'id'> & { id?: string } = { id: draft.id, name: draft.name.trim(), targetAmount, targetDate: draft.targetDate, kind: draft.kind }
      if (draft.startAmount !== '') body.startAmount = Number(draft.startAmount)
      if (draft.monthlyContribution !== '') body.monthlyContribution = Number(draft.monthlyContribution)
      setGoals(await saveGoal(body))
      setDraft(null)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this goal?')) return
    try {
      setGoals(await deleteGoal(id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="w-full space-y-5 xl:space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="page-eyebrow">Plan ahead</p>
            <h1 className="mt-1 page-title">Goals</h1>
            <p className="page-lede">House, bike, emergency fund — what to save each month and whether you are on track.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-cursor="hover" onClick={emergencyPreset} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
              <ShieldCheck className="h-3.5 w-3.5" /> Emergency fund
            </button>
            <button type="button" data-cursor="hover" onClick={() => setDraft(blank())} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 font-semibold text-bg transition-opacity hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> New goal
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary">
          <Chips label="Progress from" value={basis} onChange={setBasis} options={[{ id: 'saved', label: 'Amount saved' }, { id: 'networth', label: 'Net worth' }]} />
          <label className="flex items-center gap-2">
            Assumed return
            <input type="number" min={0} max={30} step={0.5} value={returnPct} onChange={(e) => setReturnPct(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-text" /> % / yr
          </label>
          {avgSpend > 0 && <span>Average monthly spend {money.inr(avgSpend)}</span>}
        </div>

        {error && <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

        {loading ? (
          <GlassCard hover={false} className="py-16 text-center text-sm text-text-secondary">Loading goals…</GlassCard>
        ) : plans.length === 0 ? (
          <GlassCard hover={false} className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <Target className="h-8 w-8 text-accent" />
            <p className="text-sm text-text-secondary">No goals yet. Add one, or start with the emergency-fund preset (6 months of your average spend).</p>
          </GlassCard>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map(({ goal: g, plan }, i) => {
              const Icon = KINDS.find((k) => k.id === g.kind)?.icon ?? Target
              const st = STATUS[plan.status]
              return (
                <Reveal key={g.id} delay={i * 0.04}>
                  <GlassCard hover={false} className="p-4">
                    <div className="flex items-start gap-3">
                      <Ring pct={plan.progress} tone={plan.status === 'behind' ? 'var(--color-error)' : plan.status === 'no-plan' ? '#f59e0b' : 'var(--color-positive)'} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-text"><Icon className="h-3.5 w-3.5 shrink-0 text-accent" /> <span className="truncate">{g.name}</span></p>
                          <span className="flex shrink-0 gap-1">
                            <button type="button" aria-label={`Edit ${g.name}`} onClick={() => edit(g)} className="rounded p-1 text-text-secondary hover:text-text"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" aria-label={`Delete ${g.name}`} onClick={() => void remove(g.id)} className="rounded p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-text-secondary">{money.inr(plan.current)} of {money.inr(g.targetAmount)}</p>
                        <p className={cn('mt-1 text-xs font-semibold', st.cls)}>{st.label}</p>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-2xs">
                      <div><dt className="text-text-secondary">Target date</dt><dd className="font-mono text-text">{g.targetDate}</dd></div>
                      <div><dt className="text-text-secondary">Need / month</dt><dd className="font-mono text-text">{money.inr(plan.required)}</dd></div>
                      <div><dt className="text-text-secondary">Projected</dt><dd className="font-mono text-text">{plan.finish ?? '—'}</dd></div>
                    </dl>
                    {plan.status === 'behind' && <p className="mt-2 text-2xs text-text-secondary">Save {money.inr(plan.shortfall)} more each month to hit the date.</p>}
                  </GlassCard>
                </Reveal>
              )
            })}
          </div>
        )}

        {draft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit goal' : 'New goal'}>
            <GlassCard hover={false} className="w-full max-w-md p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="section-title">{draft.id ? 'Edit goal' : 'New goal'}</h2>
                <button type="button" aria-label="Close" onClick={() => setDraft(null)} className="text-text-secondary hover:text-text"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3 text-xs text-text-secondary">
                <label className="block">Name<input className={fieldCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></label>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Kind">
                  {KINDS.map((k) => (
                    <button key={k.id} type="button" onClick={() => setDraft({ ...draft, kind: k.id })} aria-pressed={draft.kind === k.id} className={cn('rounded-full border px-3 py-1', draft.kind === k.id ? 'border-accent bg-accent/10 text-accent' : 'border-border')}>{k.label}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">Target amount<input type="number" min={0} className={fieldCls} value={draft.targetAmount} onChange={(e) => setDraft({ ...draft, targetAmount: e.target.value })} /></label>
                  <label className="block">Target date<input type="date" className={fieldCls} value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} /></label>
                  <label className="block">Saved so far<input type="number" min={0} className={fieldCls} value={draft.startAmount} onChange={(e) => setDraft({ ...draft, startAmount: e.target.value })} /></label>
                  <label className="block">Monthly saving<input type="number" min={0} className={fieldCls} value={draft.monthlyContribution} onChange={(e) => setDraft({ ...draft, monthlyContribution: e.target.value })} /></label>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-border px-4 py-2 text-text-secondary hover:text-text">Cancel</button>
                <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-full bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-50">{busy ? 'Saving…' : 'Save goal'}</button>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </MotionConfig>
  )
}
