import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Moon, Footprints } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty, Field, Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useMoney } from '@/lib/privacy'
import { saveLog } from '@/lib/healthApi'
import { useGrowthDoc } from '@/lib/growthApi'
import { clearSources, useSources } from '@/lib/growth/sources'
import { checkGuardrails } from '@/lib/growth/guardrails'
import { buildMindMoney, MIN_DAYS, type Bucket } from '@/lib/growth/mindMoney'
import { todayStr } from '@/lib/journal'
import type { DailyLog as HealthLog } from '@/lib/health'

const useS = defineStrings(
  {
    eyebrow: 'Health',
    title: 'Mind & Money',
    lede: 'How your sleep and movement line up with your trading and your spending. Counts only — patterns, not proof.',
    loading: 'Matching your health logs with trades and spending…',
    logToday: 'Log today',
    logHint: 'Two numbers a day is enough. Saved to your Health log.',
    sleep: 'Sleep (hours)',
    steps: 'Steps',
    save: 'Save',
    saved: 'Saved.',
    bySleep: 'By sleep',
    bySteps: 'By steps',
    days: (n: number) => `${n} days`,
    traded: (n: number) => `${n} traded`,
    avgPnl: 'Avg P&L on trading days',
    winDays: 'Winning days',
    breakDays: 'Rule-break days',
    wants: 'Impulse spend / day',
    few: (n: number) => `Only ${n} day${n === 1 ? '' : 's'} so far — needs ${MIN_DAYS}+ to mean anything.`,
    noLogs: 'No sleep or step logs yet',
    noLogsHint: 'Log sleep and steps for a couple of weeks and this page will show whether short nights line up with red trading days or impulse buys.',
    health: 'Open Health Report',
    under6: 'Under 6 h',
    '6to7': '6–7 h',
    '7plus': '7 h or more',
    under5k: 'Under 5,000',
    '5to10k': '5,000–10,000',
    '10kplus': '10,000 or more',
  },
  {
    eyebrow: 'உடல்நலம்',
    title: 'மனம் & பணம்',
    lede: 'உங்கள் தூக்கமும் நடையும் வர்த்தகம், செலவுடன் எப்படி ஒத்துப்போகின்றன. எண்ணிக்கை மட்டும் — நிரூபணம் அல்ல.',
    loading: 'பொருத்துகிறது…',
    logToday: 'இன்று பதிவு செய்',
    logHint: 'ஒரு நாளுக்கு இரண்டு எண்கள் போதும்.',
    sleep: 'தூக்கம் (மணி)',
    steps: 'அடிகள்',
    save: 'சேமி',
    saved: 'சேமிக்கப்பட்டது.',
    bySleep: 'தூக்கத்தின்படி',
    bySteps: 'அடிகளின்படி',
    days: (n: number) => `${n} நாட்கள்`,
    traded: (n: number) => `${n} வர்த்தக நாட்கள்`,
    avgPnl: 'சராசரி லாப/நஷ்டம்',
    winDays: 'லாப நாட்கள்',
    breakDays: 'விதி மீறிய நாட்கள்',
    wants: 'நாளுக்கு ஆசைச் செலவு',
    few: (n: number) => `இதுவரை ${n} நாட்கள் மட்டும் — குறைந்தது ${MIN_DAYS} தேவை.`,
    noLogs: 'இன்னும் தூக்கம் / அடிகள் பதிவு இல்லை',
    noLogsHint: 'இரண்டு வாரங்கள் பதிவு செய்தால் இங்கு முறைகள் தெரியும்.',
    health: 'உடல்நல அறிக்கையைத் திற',
    under6: '6 மணிக்குக் கீழ்',
    '6to7': '6–7 மணி',
    '7plus': '7 மணி அல்லது அதிகம்',
    under5k: '5,000-க்குக் கீழ்',
    '5to10k': '5,000–10,000',
    '10kplus': '10,000 அல்லது அதிகம்',
  },
)

type S = ReturnType<typeof useS>

function BucketCard({ b, s, i }: { b: Bucket; s: S; i: number }) {
  const m = useMoney()
  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
      className={cn('rounded-2xl border p-4', b.enough ? 'border-border bg-surface-2' : 'border-dashed border-border bg-transparent')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg text-text">{s[b.key as keyof S] as string}</p>
        <p className="text-xs text-text-secondary">
          {s.days(b.days)} · {s.traded(b.tradingDays)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-text-secondary">{s.avgPnl}</dt>
        <dd className={cn('text-right font-mono', b.avgPnl === null ? 'text-text-secondary' : b.avgPnl < 0 ? 'text-error' : 'text-positive')}>{b.avgPnl === null ? '—' : m.signed(b.avgPnl)}</dd>
        <dt className="text-text-secondary">{s.winDays}</dt>
        <dd className="text-right font-mono text-text">{pct(b.winDayPct)}</dd>
        <dt className="text-text-secondary">{s.breakDays}</dt>
        <dd className="text-right font-mono text-text">{pct(b.breachDayPct)}</dd>
        <dt className="text-text-secondary">{s.wants}</dt>
        <dd className="text-right font-mono text-text">{m.inr(b.avgWants)}</dd>
      </dl>
      {!b.enough && <p className="mt-3 text-2xs text-text-secondary">{s.few(b.days)}</p>}
    </motion.div>
  )
}

function LogToday({ s, existing, onSaved }: { s: S; existing?: HealthLog; onSaved: () => void }) {
  const [sleep, setSleep] = useState(existing?.sleepH?.toString() ?? '')
  const [steps, setSteps] = useState(existing?.steps?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const date = todayStr()
      const log: HealthLog = { weight: null, waterL: null, note: '', ...existing, date, sleepH: sleep ? Number(sleep) : null, steps: steps ? Math.round(Number(steps)) : null }
      await saveLog(log)
      setDone(true)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={s.logToday} hint={s.logHint}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={s.sleep}>
          <div className="relative">
            <Moon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <input type="number" min={0} max={24} step={0.5} inputMode="decimal" className={cn(inputCls, 'pl-8')} value={sleep} onChange={(e) => setSleep(e.target.value)} />
          </div>
        </Field>
        <Field label={s.steps}>
          <div className="relative">
            <Footprints className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <input type="number" min={0} step={500} inputMode="numeric" className={cn(inputCls, 'pl-8')} value={steps} onChange={(e) => setSteps(e.target.value)} />
          </div>
        </Field>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" magnetic={false} onClick={save} disabled={busy || (!sleep && !steps)}>
          {s.save}
        </Button>
        {done && <span className="text-xs text-positive">{s.saved}</span>}
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </Panel>
  )
}

export function MindMoney() {
  const s = useS()
  const [reload, setReload] = useState(0)
  const { data, loading, errors } = useSources(['health', 'trades', 'bank', 'card', 'tags', 'settings'], reload)
  const rules = useGrowthDoc('guardrails')

  const report = useMemo(() => {
    if (loading || !data.settings) return null
    const breachDays = new Set(checkGuardrails(data.trades ?? [], data.settings, rules.value).days.filter((d) => d.status === 'breach').map((d) => d.date))
    return buildMindMoney({ logs: data.health ?? [], trades: data.trades ?? [], txns: [...(data.bank ?? []), ...(data.card ?? [])], tags: data.tags ?? {}, breachDays })
  }, [loading, data, rules.value])

  const todayLog = data.health?.find((l) => l.date === todayStr())

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {!report ? (
        <Loading label={s.loading} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-4">
            {report.loggedDays === 0 ? (
              <Empty title={s.noLogs}>
                <p>{s.noLogsHint}</p>
                <Link to="/health-report" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
                  {s.health} →
                </Link>
              </Empty>
            ) : (
              <>
                <Panel title={s.bySleep}>
                  <div className="grid gap-3 md:grid-cols-3">
                    {report.sleep.map((b, i) => (
                      <BucketCard key={b.key} b={b} s={s} i={i} />
                    ))}
                  </div>
                </Panel>
                <Panel title={s.bySteps}>
                  <div className="grid gap-3 md:grid-cols-3">
                    {report.steps.map((b, i) => (
                      <BucketCard key={b.key} b={b} s={s} i={i} />
                    ))}
                  </div>
                </Panel>
              </>
            )}
          </div>
          <div>
            <LogToday
              key={todayLog?.date ?? 'new'}
              s={s}
              existing={todayLog}
              onSaved={() => {
                clearSources()
                setReload((n) => n + 1)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
