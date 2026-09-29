import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty, Field, Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { defineStrings } from '@/lib/i18n'
import { useLocale } from '@/lib/locale'
import { useGrowthDoc, type Habit, type HabitAuto } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { checkGuardrails } from '@/lib/growth/guardrails'
import { dayState, lastDays, rate, streak, toggle, type AutoData } from '@/lib/growth/habits'
import { todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Growth',
    title: 'Habits',
    lede: 'A few daily habits as streaks. Some tick themselves from your data — no food delivery, steps, sleep, trading rules kept.',
    loading: 'Loading your habits…',
    streak: (n: number) => `${n}-day streak`,
    rate: (n: string) => `${n} of the last 30 days`,
    today: 'Today',
    tapToday: 'Tap today’s dot to tick it',
    add: 'Add a habit',
    name: 'Habit',
    namePh: 'e.g. Read 20 minutes',
    kind: 'Tracked by',
    manual: 'I tick it',
    addBtn: 'Add',
    starters: 'Quick start',
    remove: 'Remove',
    empty: 'No habits yet — pick a few below to start.',
    max: 'Up to 12 habits.',
  },
  {
    eyebrow: 'வளர்ச்சி',
    title: 'பழக்கங்கள்',
    lede: 'சில தினசரி பழக்கங்கள் தொடர்ச்சியாக. சில உங்கள் தரவிலிருந்து தானாக டிக் ஆகும்.',
    loading: 'ஏற்றுகிறது…',
    streak: (n: number) => `${n} நாள் தொடர்`,
    rate: (n: string) => `கடந்த 30 நாட்களில் ${n}`,
    today: 'இன்று',
    tapToday: 'இன்றைய புள்ளியைத் தட்டவும்',
    add: 'பழக்கத்தைச் சேர்',
    name: 'பழக்கம்',
    namePh: 'எ.கா. 20 நிமிடம் படித்தல்',
    kind: 'கண்காணிப்பு',
    manual: 'நானே டிக் செய்கிறேன்',
    addBtn: 'சேர்',
    starters: 'விரைவுத் தொடக்கம்',
    remove: 'நீக்கு',
    empty: 'இன்னும் பழக்கங்கள் இல்லை.',
    max: 'அதிகபட்சம் 12.',
  },
)

const AUTO_FROM_TA: Record<Exclude<HabitAuto, ''>, string> = {
  'no-delivery': 'உங்கள் கார்டு, வங்கிச் செலவிலிருந்து',
  steps: 'உடல்நலப் பதிவிலிருந்து',
  sleep: 'உடல்நலப் பதிவிலிருந்து',
  rules: 'வர்த்தக வரம்புகளிலிருந்து',
}

const AUTO_FROM_EN: Record<Exclude<HabitAuto, ''>, string> = {
  'no-delivery': 'From your card and bank spending',
  steps: 'From your Health log',
  sleep: 'From your Health log',
  rules: 'From Trading Guardrails',
}

const STARTERS: { name: string; auto: HabitAuto; target: number }[] = [
  { name: 'No food delivery', auto: 'no-delivery', target: 0 },
  { name: 'Kept my trading rules', auto: 'rules', target: 0 },
  { name: '10,000 steps', auto: 'steps', target: 10000 },
  { name: 'Slept 7 hours', auto: 'sleep', target: 7 },
  { name: 'Workout', auto: '', target: 0 },
  { name: 'Read 20 minutes', auto: '', target: 0 },
]

const newId = () => Math.random().toString(36).slice(2, 10)

export function Habits() {
  const s = useS()
  const { language } = useLocale()
  const AUTO_FROM = language === 'ta' ? AUTO_FROM_TA : AUTO_FROM_EN
  const doc = useGrowthDoc('habits')
  const rules = useGrowthDoc('guardrails')
  const { data, loading, errors } = useSources(['bank', 'card', 'health', 'trades', 'settings'])
  const [name, setName] = useState('')
  const [kind, setKind] = useState<HabitAuto>('')
  const today = todayStr()
  const days = useMemo(() => lastDays(today, 35), [today])
  const last30 = days.slice(-30)

  const auto: AutoData | null = useMemo(() => {
    if (loading || !data.settings) return null
    const txns = [...(data.bank ?? []), ...(data.card ?? [])]
    const breachDays = new Set(checkGuardrails(data.trades ?? [], data.settings, rules.value).days.filter((d) => d.status === 'breach').map((d) => d.date))
    return { txns, statementsTo: txns.reduce((m, t) => (t.date > m ? t.date : m), ''), health: data.health ?? [], breachDays }
  }, [loading, data, rules.value])

  const habits = doc.value.habits
  const add = (h: Omit<Habit, 'id'>) => habits.length < 12 && doc.save({ ...doc.value, habits: [...habits, { ...h, id: newId() }] })
  const remove = (id: string) => doc.save({ ...doc.value, habits: habits.filter((h) => h.id !== id) })

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      {doc.loading || !auto ? (
        <Loading label={s.loading} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-3">
            {habits.length === 0 && <Empty title={s.empty} />}
            <AnimatePresence initial={false}>
              {habits.map((h, hi) => {
                const st = streak(h, today, doc.value, auto)
                const r = rate(h, last30, doc.value, auto)
                return (
                  <motion.div key={h.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ delay: hi * 0.04 }}>
                    <Panel>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-display text-lg text-text">{h.name}</p>
                          <p className="text-xs text-text-secondary">
                            {h.auto ? AUTO_FROM[h.auto] : s.tapToday}
                            {r !== null && ` · ${s.rate(`${r.toFixed(0)}%`)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold', st > 0 ? 'bg-accent/15 text-accent' : 'bg-surface-5 text-text-secondary')}>
                            <motion.span animate={st >= 3 ? { scale: [1, 1.2, 1] } : {}} transition={{ repeat: st >= 3 ? 2 : 0, duration: 0.6 }}>
                              <Flame className="h-4 w-4" />
                            </motion.span>
                            {s.streak(st)}
                          </span>
                          <button type="button" aria-label={`${s.remove}: ${h.name}`} onClick={() => remove(h.id)} className="rounded-lg p-1.5 text-text-secondary hover:text-error">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {/* Five weeks of dots, oldest first; today is the last dot. */}
                      <div className="mt-4 grid grid-flow-col grid-rows-1 gap-1.5 sm:gap-2" style={{ gridTemplateColumns: 'repeat(35, minmax(0, 1fr))' }}>
                        {days.map((d, i) => {
                          const state = dayState(h, d, doc.value, auto)
                          const isToday = d === today
                          const clickable = !h.auto && isToday
                          return (
                            <motion.button
                              key={d}
                              type="button"
                              disabled={!clickable}
                              title={`${d} · ${state}`}
                              aria-label={isToday ? `${s.today}: ${h.name}` : d}
                              aria-pressed={clickable ? state === 'done' : undefined}
                              onClick={() => clickable && doc.save(toggle(doc.value, h.id, d))}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              whileTap={clickable ? { scale: 0.8 } : undefined}
                              transition={{ delay: i * 0.008, type: 'spring', stiffness: 500, damping: 30 }}
                              className={cn(
                                'aspect-square w-full rounded-full',
                                state === 'done' ? 'bg-accent shadow-[0_0_8px_rgb(var(--aurum-glow)/0.55)]' : state === 'missed' ? 'bg-surface-10' : 'border border-dashed border-border bg-transparent',
                                isToday && 'ring-2 ring-accent/60 ring-offset-2 ring-offset-card',
                                clickable && 'cursor-pointer',
                              )}
                            />
                          )
                        })}
                      </div>
                    </Panel>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          <div className="space-y-4">
            <Panel title={s.starters}>
              <div className="flex flex-wrap gap-2">
                {STARTERS.filter((x) => !habits.some((h) => h.name === x.name)).map((x) => (
                  <button key={x.name} type="button" onClick={() => add(x)} disabled={habits.length >= 12} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-accent/50">
                    {x.auto ? <Sparkles className="h-3 w-3 text-accent" /> : <Plus className="h-3 w-3" />} {x.name}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title={s.add} hint={s.max}>
              <div className="space-y-3">
                <Field label={s.name}>
                  <input className={inputCls} value={name} maxLength={60} placeholder={s.namePh} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label={s.kind}>
                  <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as HabitAuto)}>
                    <option value="">{s.manual}</option>
                    {(Object.keys(AUTO_FROM) as Exclude<HabitAuto, ''>[]).map((k) => (
                      <option key={k} value={k}>
                        {AUTO_FROM[k]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  size="sm"
                  magnetic={false}
                  disabled={!name.trim() || habits.length >= 12 || doc.saving}
                  onClick={() => {
                    add({ name: name.trim(), auto: kind, target: kind === 'steps' ? 10000 : kind === 'sleep' ? 7 : 0 })
                    setName('')
                  }}
                >
                  <Plus className="h-4 w-4" /> {s.addBtn}
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
