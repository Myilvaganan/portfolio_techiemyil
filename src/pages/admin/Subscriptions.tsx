import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, EyeOff, Scissors, TrendingUp } from 'lucide-react'
import { CountUp, Empty, Loading, Notice, PageHero, Panel, Pill, Stat } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { buildSubscriptions, type Subscription } from '@/lib/growth/subscriptions'
import { todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Money',
    title: 'Subscriptions & Renewals',
    lede: 'Every repeating charge from your bank and cards — what it costs a year, what’s due next, and what quietly went up.',
    loading: 'Finding repeating charges…',
    yearly: 'Cost per year',
    yearlySub: (n: number) => `${n} active charges`,
    monthly: 'Per month',
    monthlySub: 'Averaged across the year',
    rises: 'Price rises',
    risesSub: 'Last charge above the usual',
    saved: 'Saved by cancelling',
    savedSub: 'Per year',
    dueSoon: 'Due in the next 30 days',
    asOf: (d: string) => `Statements up to ${d}`,
    nothingDue: 'Nothing due in the next 30 days.',
    all: 'All charges',
    filterAll: 'All',
    filterMonthly: 'Monthly',
    filterYearly: 'Yearly',
    filterStopped: 'Stopped',
    in: (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`),
    overdue: 'expected, not seen yet',
    every: (d: number) => `every ~${d} days`,
    perYear: '/ year',
    up: (p: string) => `up ${p}%`,
    down: (p: string) => `down ${p}%`,
    stopped: 'Stopped — no recent charge',
    cancel: 'Cancelled',
    hide: 'Not a subscription',
    empty: 'No repeating charges found yet. Import a few months of bank and card statements.',
  },
  {
    eyebrow: 'பணம்',
    title: 'சந்தாக்கள் & புதுப்பித்தல்கள்',
    lede: 'உங்கள் வங்கி, கார்டுகளிலிருந்து மீண்டும் வரும் ஒவ்வொரு கட்டணமும் — ஆண்டுச் செலவு, அடுத்து எது, எது விலை ஏறியது.',
    loading: 'கட்டணங்கள் தேடப்படுகின்றன…',
    yearly: 'ஆண்டுச் செலவு',
    yearlySub: (n: number) => `${n} செயலில் உள்ளவை`,
    monthly: 'மாதத்திற்கு',
    monthlySub: 'ஆண்டு சராசரி',
    rises: 'விலை உயர்வுகள்',
    risesSub: 'வழக்கத்தைவிட அதிகம்',
    saved: 'ரத்து செய்ததால் மிச்சம்',
    savedSub: 'ஆண்டுக்கு',
    dueSoon: 'அடுத்த 30 நாட்களில்',
    asOf: (d: string) => `${d} வரையிலான அறிக்கைகள்`,
    nothingDue: 'அடுத்த 30 நாட்களில் எதுவும் இல்லை.',
    all: 'அனைத்துக் கட்டணங்களும்',
    filterAll: 'அனைத்தும்',
    filterMonthly: 'மாதாந்திர',
    filterYearly: 'ஆண்டு',
    filterStopped: 'நின்றவை',
    in: (d: number) => (d === 0 ? 'இன்று' : d === 1 ? 'நாளை' : `${d} நாட்களில்`),
    overdue: 'எதிர்பார்க்கப்பட்டது',
    every: (d: number) => `~${d} நாட்களுக்கு ஒருமுறை`,
    perYear: '/ ஆண்டு',
    up: (p: string) => `${p}% உயர்வு`,
    down: (p: string) => `${p}% குறைவு`,
    stopped: 'நின்றுவிட்டது',
    cancel: 'ரத்து செய்தேன்',
    hide: 'சந்தா அல்ல',
    empty: 'மீண்டும் வரும் கட்டணங்கள் இல்லை.',
  },
)

type Filter = 'all' | 'monthly' | 'yearly' | 'stopped'

export function Subscriptions() {
  const s = useS()
  const m = useMoney()
  const doc = useGrowthDoc('subscriptions')
  const { data, loading, errors } = useSources(['bank', 'card'])
  const [filter, setFilter] = useState<Filter>('all')
  const today = todayStr()

  const txns = useMemo(() => [...(data.bank ?? []), ...(data.card ?? [])], [data])
  // Measured against the latest statement, so charges don't all look overdue between imports.
  const asOf = useMemo(() => txns.reduce((max, t) => (t.date > max ? t.date : max), '') || today, [txns, today])
  const r = useMemo(() => (loading || doc.loading ? null : buildSubscriptions(txns, doc.value, asOf)), [loading, doc.loading, txns, doc.value, asOf])

  const shown = (r?.subscriptions ?? []).filter((x) => (filter === 'all' ? true : filter === 'stopped' ? x.status === 'stopped' : x.cadence === filter && x.status === 'active'))

  const cancel = (x: Subscription) => doc.save({ ...doc.value, cancelled: [...doc.value.cancelled, { key: x.key, date: today, yearly: Math.round(x.yearlyCost) }] })
  const hide = (x: Subscription) => doc.save({ ...doc.value, ignored: [...doc.value.ignored, x.key] })

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      {!r ? (
        <Loading label={s.loading} />
      ) : r.subscriptions.length === 0 ? (
        <Empty title={s.empty} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={s.yearly} tone="gold" value={<CountUp value={r.yearlyTotal} format={(n) => m.inr(n)} />} sub={s.yearlySub(r.activeCount)} />
            <Stat label={s.monthly} value={<CountUp value={r.monthlyTotal} format={(n) => m.inr(n)} />} sub={s.monthlySub} />
            <Stat label={s.rises} tone={r.priceRises ? 'warn' : 'good'} value={r.priceRises} sub={s.risesSub} />
            <Stat label={s.saved} tone="good" value={<CountUp value={r.savedPerYear} format={(n) => m.inr(n)} />} sub={s.savedSub} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <Panel title={s.dueSoon} hint={s.asOf(asOf)}>
              {r.dueSoon.length === 0 ? (
                <p className="text-sm text-text-secondary">{s.nothingDue}</p>
              ) : (
                // A vertical timeline: the gold line fills as items draw in.
                <ol className="relative space-y-4 border-l border-accent/30 pl-5">
                  {r.dueSoon.map((x, i) => (
                    <motion.li key={x.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="relative">
                      <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_rgb(var(--aurum-glow)/0.7)]" />
                      <p className="text-sm font-medium text-text">{x.merchant}</p>
                      <p className="text-xs text-text-secondary">
                        {s.in(x.daysToDue)} · {x.nextDueDate} · <span className="font-mono text-text">{m.inr(x.lastAmount)}</span>
                      </p>
                    </motion.li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel
              title={s.all}
              action={
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'monthly', 'yearly', 'stopped'] as Filter[]).map((f) => (
                    <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
                      {s[`filter${f[0].toUpperCase()}${f.slice(1)}` as 'filterAll']}
                    </Pill>
                  ))}
                </div>
              }
            >
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {shown.map((x) => (
                    <motion.li key={x.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 py-3">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', x.status === 'stopped' ? 'bg-surface-5 text-text-secondary' : 'bg-accent/15 text-accent')}>
                        <CalendarClock className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">
                          {x.merchant} <span className="ml-1 text-2xs font-normal text-text-secondary">{x.category}</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                          {x.status === 'stopped' ? s.stopped : `${s.every(x.avgIntervalDays)} · ${x.daysToDue < 0 ? s.overdue : s.in(x.daysToDue)}`}
                          {x.amountChanged && x.status === 'active' && (
                            <span className={cn('ml-2 inline-flex items-center gap-0.5 font-medium', x.changePct > 0 ? 'text-amber-500' : 'text-positive')}>
                              <TrendingUp className="h-3 w-3" /> {x.changePct > 0 ? s.up(x.changePct.toFixed(0)) : s.down(Math.abs(x.changePct).toFixed(0))}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm text-text">{m.inr(x.lastAmount)}</p>
                        <p className="font-mono text-2xs text-text-secondary">
                          {m.inr(x.yearlyCost)} {s.perYear}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" title={s.cancel} aria-label={`${s.cancel}: ${x.merchant}`} onClick={() => cancel(x)} className="rounded-lg p-2 text-text-secondary hover:bg-surface-5 hover:text-positive">
                          <Scissors className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title={s.hide} aria-label={`${s.hide}: ${x.merchant}`} onClick={() => hide(x)} className="rounded-lg p-2 text-text-secondary hover:bg-surface-5 hover:text-text">
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
