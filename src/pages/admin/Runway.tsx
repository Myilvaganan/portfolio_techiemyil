import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Briefcase, HandCoins, Scissors, TrendingDown } from 'lucide-react'
import { CountUp, Empty, Loading, Notice, PageHero, Panel } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useMoney } from '@/lib/privacy'
import { useSources } from '@/lib/growth/sources'
import { runwayInputs, scenarios, type ScenarioKey } from '@/lib/growth/runway'
import { monthLabel, todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Wealth & debt',
    title: 'Runway & Stress Test',
    lede: 'If income stopped today, how long would your money last — and what changes that number most.',
    loading: 'Adding up cash, investments and spending…',
    headline: 'months of runway',
    headlineSub: 'if income stopped today',
    target: 'Aim for 6 months or more.',
    outflow: 'Monthly outflow',
    outflowSub: (m: string) => `Average of ${m} — needs, wants and family, EMIs included`,
    cash: 'Cash',
    investments: 'Investments',
    owed: 'Owed to you',
    scenarios: 'Stress tests',
    jobLoss: 'Income stops',
    jobLossHint: 'Cash and investments only',
    marketDrop: '…and markets fall 20%',
    marketDropHint: 'Investments lose a fifth',
    cutWants: '…but you halve the wants',
    cutWantsHint: 'Shopping, eating out, subscriptions cut by half',
    repaid: '…and borrowers repay you',
    repaidHint: 'Money you lent comes back',
    months: (n: string) => `${n} months`,
    snapshotFrom: (m: string) => `Balances from your ${m} net-worth snapshot.`,
    noSnapshot: 'Take a net-worth snapshot on the Net Worth page to include your cash and investments.',
    noSpend: 'Not enough statement history yet — import at least one full month of bank statements.',
  },
  {
    eyebrow: 'செல்வம் & கடன்',
    title: 'அவசரகால இருப்பு',
    lede: 'இன்று வருமானம் நின்றால், உங்கள் பணம் எவ்வளவு காலம் நீடிக்கும்.',
    loading: 'கணக்கிடப்படுகிறது…',
    headline: 'மாத இருப்பு',
    headlineSub: 'இன்று வருமானம் நின்றால்',
    target: '6 மாதம் அல்லது அதிகம் இலக்கு.',
    outflow: 'மாதச் செலவு',
    outflowSub: (m: string) => `${m} சராசரி`,
    cash: 'ரொக்கம்',
    investments: 'முதலீடுகள்',
    owed: 'உங்களுக்கு வர வேண்டியது',
    scenarios: 'அழுத்தச் சோதனைகள்',
    jobLoss: 'வருமானம் நிற்கிறது',
    jobLossHint: 'ரொக்கமும் முதலீடும் மட்டும்',
    marketDrop: '…சந்தை 20% சரிகிறது',
    marketDropHint: 'முதலீடுகள் ஐந்தில் ஒரு பங்கு குறைகின்றன',
    cutWants: '…ஆசைச் செலவைப் பாதியாக்கினால்',
    cutWantsHint: 'ஷாப்பிங், உணவு, சந்தாக்கள் பாதி',
    repaid: '…கடன் வாங்கியவர்கள் திருப்பினால்',
    repaidHint: 'நீங்கள் கொடுத்த கடன் திரும்பும்',
    months: (n: string) => `${n} மாதங்கள்`,
    snapshotFrom: (m: string) => `${m} நிகர மதிப்புப் பதிவிலிருந்து.`,
    noSnapshot: 'நிகர மதிப்புப் பக்கத்தில் ஒரு பதிவை எடுக்கவும்.',
    noSpend: 'போதுமான அறிக்கைகள் இல்லை.',
  },
)

const ICONS: Record<ScenarioKey, typeof Briefcase> = { jobLoss: Briefcase, marketDrop: TrendingDown, cutWants: Scissors, repaid: HandCoins }
const TARGET = 6

export function Runway() {
  const s = useS()
  const m = useMoney()
  const { data, loading, errors } = useSources(['bank', 'card', 'tags', 'snapshots', 'lending'])

  const r = useMemo(() => (loading ? null : runwayInputs({ txns: [...(data.bank ?? []), ...(data.card ?? [])], tags: data.tags ?? {}, snapshots: data.snapshots ?? [], lending: data.lending ?? [], today: todayStr() })), [loading, data])
  const list = useMemo(() => (r ? scenarios(r) : []), [r])
  const base = list[0]?.months ?? null
  const scale = Math.max(TARGET * 1.5, ...list.map((x) => x.months ?? 0))
  const fmt1 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {!r ? (
        <Loading label={s.loading} />
      ) : r.monthlyOutflow === 0 ? (
        <Empty title={s.noSpend} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {/* The headline number, big, with a ring that fills toward the six-month target. */}
            <Panel className="flex flex-col items-center justify-center py-8 text-center">
              <div className="relative h-44 w-44">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" className="text-surface-7" strokeWidth="7" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke={base !== null && base >= TARGET ? 'var(--color-positive)' : base !== null && base >= 3 ? 'var(--color-accent)' : 'var(--color-error)'}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 44}
                    initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - Math.min(1, (base ?? 0) / TARGET)) }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
                <span className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-5xl text-text">{base === null ? '—' : <CountUp value={base} format={fmt1} />}</span>
                  <span className="text-xs text-text-secondary">{s.headline}</span>
                </span>
              </div>
              <p className="mt-3 text-sm text-text-secondary">{s.headlineSub}</p>
              <p className="text-2xs text-text-secondary">{s.target}</p>
            </Panel>

            <div className="grid grid-cols-2 gap-3">
              <Panel>
                <p className="label-caps">{s.outflow}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-text">{m.inr(r.monthlyOutflow)}</p>
                <p className="mt-1 text-xs text-text-secondary">{s.outflowSub(r.monthsUsed.map(monthLabel).join(', '))}</p>
              </Panel>
              <Panel>
                <p className="label-caps">{s.cash}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-accent">{m.inr(r.cash)}</p>
              </Panel>
              <Panel>
                <p className="label-caps">{s.investments}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-text">{m.inr(r.investments)}</p>
              </Panel>
              <Panel>
                <p className="label-caps">{s.owed}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-text">{m.inr(r.owedToYou)}</p>
              </Panel>
              <p className="col-span-2 px-1 text-2xs text-text-secondary">{r.snapshotMonth ? s.snapshotFrom(monthLabel(r.snapshotMonth)) : s.noSnapshot}</p>
            </div>
          </div>

          <Panel title={s.scenarios}>
            <ul className="space-y-4">
              {list.map((x, i) => {
                const Icon = ICONS[x.key]
                const months = x.months ?? 0
                return (
                  <li key={x.key} className="grid grid-cols-[2.25rem_minmax(0,14rem)_minmax(0,1fr)_6.5rem] items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{s[x.key]}</span>
                      <span className="block truncate text-2xs text-text-secondary">{s[`${x.key}Hint`]}</span>
                    </span>
                    <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-5">
                      {/* The six-month target as a hairline. */}
                      <span className="absolute inset-y-0 z-10 w-px bg-text-secondary/60" style={{ left: `${(TARGET / scale) * 100}%` }} />
                      <motion.span
                        className={cn('block h-full rounded-full', months >= TARGET ? 'bg-positive' : months >= 3 ? 'bg-accent' : 'bg-error')}
                        initial={{ width: 0 }}
                        animate={{ width: `${(months / scale) * 100}%` }}
                        transition={{ duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </span>
                    <span className="whitespace-nowrap text-right font-mono text-sm text-text">{x.months === null ? '—' : s.months(fmt1(months))}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}
