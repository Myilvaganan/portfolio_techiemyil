import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { CountUp, Empty, Loading, Notice, PageHero, Panel, Stat } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { CARD_RATE_PCT, collectDebts, simulate, type PayoffResult } from '@/lib/growth/debt'
import { todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Wealth & debt',
    title: 'Debt-Free Plan',
    lede: 'Every loan and card balance in one plan: when you’ll be free, what it costs, and where each spare rupee should go first.',
    loading: 'Reading your loans and cards…',
    debtFree: 'Debt-free by',
    never: 'Not on minimums alone',
    months: (n: number) => `${n} months`,
    interest: 'Interest still to pay',
    saved: 'Interest saved',
    savedSub: 'vs minimums only, with no roll-over of cleared payments',
    total: 'Total owed now',
    extra: 'Extra per month',
    extraHint: 'On top of all the EMIs and minimum card payments.',
    strategy: 'Where the extra goes',
    avalanche: 'Highest interest first',
    avalancheHint: 'Least interest overall',
    snowball: 'Smallest balance first',
    snowballHint: 'Quickest wins',
    save: 'Save plan',
    savedOk: 'Saved.',
    order: 'Your debts, in payoff order',
    rate: (r: string) => `${r}% a year`,
    min: (v: string) => `min ${v}/mo`,
    clears: (d: string) => `clear by ${d}`,
    chart: 'Balance over time',
    chartHint: 'Gold: your plan · Grey: minimums only',
    cardNote: (r: number) => `Card balances assume ${r}% a year if not paid in full.`,
    empty: 'No loans or card balances found — nothing to pay off.',
  },
  {
    eyebrow: 'செல்வம் & கடன்',
    title: 'கடனில்லா திட்டம்',
    lede: 'ஒவ்வொரு கடனும் கார்டு நிலுவையும் ஒரே திட்டத்தில்: எப்போது விடுபடுவீர்கள், எவ்வளவு செலவு, மிச்சப் பணம் எங்கே செல்ல வேண்டும்.',
    loading: 'கடன்கள் படிக்கப்படுகின்றன…',
    debtFree: 'கடனில்லாமல்',
    never: 'குறைந்தபட்சத் தொகையால் மட்டும் முடியாது',
    months: (n: number) => `${n} மாதங்கள்`,
    interest: 'இன்னும் செலுத்த வேண்டிய வட்டி',
    saved: 'மிச்சமான வட்டி',
    savedSub: 'குறைந்தபட்சத் தொகையுடன் ஒப்பிட',
    total: 'இப்போதைய மொத்தக் கடன்',
    extra: 'மாதம் கூடுதல் தொகை',
    extraHint: 'EMI மற்றும் குறைந்தபட்சக் கார்டுத் தொகைக்கு மேல்.',
    strategy: 'கூடுதல் தொகை எங்கே',
    avalanche: 'அதிக வட்டி முதலில்',
    avalancheHint: 'மொத்த வட்டி குறைவு',
    snowball: 'சிறிய நிலுவை முதலில்',
    snowballHint: 'விரைவான வெற்றிகள்',
    save: 'திட்டத்தைச் சேமி',
    savedOk: 'சேமிக்கப்பட்டது.',
    order: 'செலுத்தும் வரிசையில் உங்கள் கடன்கள்',
    rate: (r: string) => `ஆண்டுக்கு ${r}%`,
    min: (v: string) => `குறைந்தது ${v}/மாதம்`,
    clears: (d: string) => `${d} க்குள் முடியும்`,
    chart: 'காலப்போக்கில் நிலுவை',
    chartHint: 'தங்கம்: உங்கள் திட்டம் · சாம்பல்: குறைந்தபட்சம்',
    cardNote: (r: number) => `கார்டு நிலுவைக்கு ஆண்டுக்கு ${r}% என்று கணக்கிடப்பட்டது.`,
    empty: 'கடன்கள் இல்லை.',
  },
)

const monthAfter = (n: number) => {
  const d = new Date(`${todayStr().slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** Two lines drawn in: the plan (gold) and minimums only (grey). */
function PayoffChart({ plan, base }: { plan: PayoffResult; base: PayoffResult }) {
  const len = Math.max(plan.path.length, Math.min(base.path.length, plan.path.length * 2), 2)
  const max = Math.max(1, ...plan.path, ...base.path.slice(0, len))
  const pts = (path: number[]) => path.slice(0, len).map((v, i) => `${(i / (len - 1)) * 100},${40 - (v / max) * 38}`).join(' ')
  return (
    <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Debt balance over time">
      <defs>
        <clipPath id="debt-reveal">
          {/* The lines are revealed left to right, like time passing. */}
          <motion.rect x="0" y="0" height="42" initial={{ width: 0 }} animate={{ width: 100 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
        </clipPath>
      </defs>
      <g clipPath="url(#debt-reveal)">
        <polyline points={pts(base.path)} fill="none" stroke="currentColor" className="text-text-secondary/40" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={pts(plan.path)} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function DebtFree() {
  const s = useS()
  const m = useMoney()
  const doc = useGrowthDoc('debt')
  const { data, loading, errors } = useSources(['loans', 'cardStatements'])
  const [extra, setExtra] = useState(0)
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!doc.loading) {
      setExtra(doc.value.extraPerMonth)
      setStrategy(doc.value.strategy)
    }
  }, [doc.loading, doc.value])

  const debts = useMemo(() => (loading ? null : collectDebts(data.loans ?? [], data.cardStatements ?? [])), [loading, data])
  const plan = useMemo(() => (debts ? simulate(debts, extra, strategy) : null), [debts, extra, strategy])
  const base = useMemo(() => (debts ? simulate(debts, 0, 'minimum') : null), [debts])
  const ordered = useMemo(() => (debts && plan ? [...debts].sort((a, b) => (plan.clearedAt[a.id] ?? 9999) - (plan.clearedAt[b.id] ?? 9999)) : []), [debts, plan])
  const total = debts?.reduce((sum, d) => sum + d.balance, 0) ?? 0
  const maxExtra = Math.max(50000, Math.ceil(total / 12 / 5000) * 5000)

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {!debts || !plan || !base ? (
        <Loading label={s.loading} />
      ) : debts.length === 0 ? (
        <Empty title={s.empty} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={s.debtFree} tone="gold" value={plan.months === null ? '—' : monthAfter(plan.months)} sub={plan.months === null ? s.never : s.months(plan.months)} />
            <Stat label={s.total} tone="bad" value={<CountUp value={total} format={(n) => m.inr(n)} />} />
            <Stat label={s.interest} value={<CountUp value={plan.totalInterest} format={(n) => m.inr(n)} />} />
            <Stat label={s.saved} tone="good" value={<CountUp value={Math.max(0, base.totalInterest - plan.totalInterest)} format={(n) => m.inr(n)} />} sub={s.savedSub} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-4">
              <Panel title={s.chart} hint={s.chartHint}>
                <PayoffChart key={`${extra}-${strategy}`} plan={plan} base={base} />
              </Panel>
              <Panel title={s.order}>
                <ol className="space-y-2">
                  {ordered.map((d, i) => {
                    const at = plan.clearedAt[d.id]
                    return (
                      <motion.li key={d.id} layout transition={{ type: 'spring', stiffness: 400, damping: 36 }} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 font-display text-sm text-accent">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{d.name}</p>
                          <p className="text-xs text-text-secondary">
                            {s.rate(d.ratePct.toFixed(1))} · {s.min(m.inr(d.minPayment))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm text-text">{m.inr(d.balance)}</p>
                          <p className="text-2xs text-accent">{at ? s.clears(monthAfter(at)) : s.never}</p>
                        </div>
                      </motion.li>
                    )
                  })}
                </ol>
                {debts.some((d) => d.kind === 'card') && <p className="mt-3 text-2xs text-text-secondary">{s.cardNote(CARD_RATE_PCT)}</p>}
              </Panel>
            </div>

            <Panel title={s.extra} hint={s.extraHint}>
              <p className="font-mono text-3xl font-semibold text-accent">{m.inr(extra)}</p>
              <input type="range" min={0} max={maxExtra} step={1000} value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="mt-3 w-full accent-[var(--color-accent)]" aria-label={s.extra} />
              <p className="label-caps mt-5 mb-2">{s.strategy}</p>
              <div className="grid gap-2">
                {(['avalanche', 'snowball'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setStrategy(k)} aria-pressed={strategy === k} className={cn('rounded-xl border px-3 py-2.5 text-left transition-colors', strategy === k ? 'border-accent/50 bg-accent/10' : 'border-border bg-surface-2')}>
                    <span className="block text-sm font-medium text-text">{s[k]}</span>
                    <span className="block text-xs text-text-secondary">{s[`${k}Hint`]}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  size="sm"
                  magnetic={false}
                  disabled={doc.saving}
                  onClick={async () => {
                    await doc.save({ extraPerMonth: extra, strategy })
                    setSaved(true)
                    window.setTimeout(() => setSaved(false), 2000)
                  }}
                >
                  {s.save}
                </Button>
                {saved && <span className="text-xs text-positive">{s.savedOk}</span>}
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
