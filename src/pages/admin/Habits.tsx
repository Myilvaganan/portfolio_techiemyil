import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Flame, Plus, Sparkles, Trash2 } from 'lucide-react'
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
import { monthGrid, shiftMonth } from '@/lib/growth/water'

const useS = defineStrings(
  {
    eyebrow: 'Growth',
    title: 'Habits',
    lede: 'A few daily habits as streaks. Some tick themselves from your data — no food delivery, steps, sleep, trading rules kept.',
    loading: 'Loading your habits…',
    streak: (n: number) => `${n}-day streak`,
    rate: (n: string) => `${n} of the last 30 days`,
    today: 'Today',
    tapToday: 'Tap a day to tick it',
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

const PALETTE = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

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
  const [month, setMonth] = useState(today.slice(0, 7))
  const grid = useMemo(() => monthGrid(month), [month])
  const last30 = useMemo(() => lastDays(today, 30), [today])
  const monthLabel = new Date(`${month}-01T00:00:00`).toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-IN', { month: 'long', year: 'numeric' })

  const auto: AutoData | null = useMemo(() => {
    if (loading || !data.settings) return null
    const txns = [...(data.bank ?? []), ...(data.card ?? [])]
    const breachDays = new Set(checkGuardrails(data.trades ?? [], data.settings, rules.value).days.filter((d) => d.status === 'breach').map((d) => d.date))
    return { txns, statementsTo: txns.reduce((m, t) => (t.date > m ? t.date : m), ''), health: data.health ?? [], breachDays }
  }, [loading, data, rules.value])

  const habits = doc.value.habits
  const add = (h: Omit<Habit, 'id'>) => habits.length < 12 && doc.save({ ...doc.value, habits: [...habits, { ...h, id: newId() }] })
  const remove = (id: string) => doc.save({ ...doc.value, habits: habits.filter((h) => h.id !== id) })

  const [picked, setPicked] = useState(today)
  const [color, setColor] = useState(PALETTE[0])
  const colorOf = (h: Habit, i: number) => h.color || PALETTE[i % PALETTE.length]
  const recolor = (id: string, c: string) => doc.save({ ...doc.value, habits: habits.map((h) => (h.id === id ? { ...h, color: c } : h)) })
  const lead = (() => {
    const first = grid.find(Boolean)
    return first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0
  })()

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {errors.length > 0 && <Notice tone="warn">{errors.join(' · ')}</Notice>}
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      {doc.loading || !auto ? (
        <Loading label={s.loading} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="space-y-4">
            {habits.length === 0 && <Empty title={s.empty} />}

            {/* One calendar for every habit: each day shows a coloured dot per habit done, and a ring for how much of
                the day's habits are done. */}
            {habits.length > 0 && (
              <Panel>
                <div className="mb-3 flex items-center justify-between">
                  <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-2 text-text-secondary hover:text-text">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setPicked(today) }} className="font-display text-lg font-semibold text-text">
                    {monthLabel}
                  </button>
                  <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-2 text-text-secondary hover:text-text disabled:opacity-30">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center sm:gap-2">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <span key={i} className="pb-1 text-2xs font-semibold text-text-secondary">{d}</span>
                  ))}
                  {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
                  {grid.filter((d): d is string => !!d).map((d, i) => {
                    const future = d > today
                    const states = habits.map((h) => (future ? 'unknown' : dayState(h, d, doc.value, auto)))
                    const done = states.filter((x) => x === 'done').length
                    const known = states.filter((x) => x !== 'unknown').length
                    const pct = known ? done / known : 0
                    const isPicked = d === picked
                    return (
                      <motion.button
                        key={d}
                        type="button"
                        disabled={future}
                        onClick={() => setPicked(d)}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{ delay: i * 0.006 }}
                        aria-label={`${d}: ${done} of ${habits.length} done`}
                        className={cn(
                          'relative flex aspect-square min-h-[2.75rem] flex-col items-center justify-center gap-1 rounded-2xl border transition-colors',
                          isPicked ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface-3',
                          d === today && !isPicked && 'border-accent/50',
                          future && 'opacity-30',
                        )}
                      >
                        {/* Completion ring */}
                        {!future && known > 0 && (
                          <svg viewBox="0 0 36 36" className="absolute inset-1 -rotate-90" aria-hidden>
                            <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2" className="stroke-surface-5" />
                            <circle cx="18" cy="18" r="16" fill="none" strokeWidth="2.5" strokeLinecap="round" className={pct === 1 ? 'stroke-positive' : 'stroke-accent'} strokeDasharray={`${pct * 100.5} 100.5`} />
                          </svg>
                        )}
                        <span className="relative text-sm font-semibold text-text">{Number(d.slice(8))}</span>
                        <span className="relative flex h-1.5 gap-0.5">
                          {habits.map((h, hi) => states[hi] === 'done' && <span key={h.id} className="h-1.5 w-1.5 rounded-full" style={{ background: colorOf(h, hi) }} />)}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </Panel>
            )}

            {/* Habits: colour, streak and 30-day rate */}
            <div className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {habits.map((h, hi) => {
                  const st = streak(h, today, doc.value, auto)
                  const r = rate(h, last30, doc.value, auto)
                  const c = colorOf(h, hi)
                  return (
                    <motion.div key={h.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}>
                      <Panel className="h-full">
                        <div className="flex items-start gap-3">
                          <label className="relative mt-0.5 h-9 w-9 shrink-0 cursor-pointer rounded-xl shadow-inner" style={{ background: c }} title="Change colour">
                            <input type="color" value={c} onChange={(e) => recolor(h.id, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Colour for ${h.name}`} />
                          </label>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-text">{h.name}</p>
                            <p className="truncate text-xs text-text-secondary">{h.auto ? AUTO_FROM[h.auto] : s.tapToday}</p>
                          </div>
                          <button type="button" aria-label={`${s.remove}: ${h.name}`} onClick={() => remove(h.id)} className="rounded-lg p-1.5 text-text-secondary hover:text-error">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: `${c}26`, color: c }}>
                            <Flame className="h-3.5 w-3.5" /> {s.streak(st)}
                          </span>
                          {r !== null && (
                            <span className="flex flex-1 items-center gap-2 text-xs text-text-secondary">
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-5">
                                <motion.span className="block h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${r}%` }} />
                              </span>
                              {r.toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </Panel>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>

          <div className="space-y-4">
            {/* The picked day: tick manual habits, see automatic ones */}
            {habits.length > 0 && (
              <AnimatePresence mode="wait">
                <motion.div key={picked} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <Panel title={new Date(`${picked}T00:00:00`).toLocaleDateString(language === 'ta' ? 'ta-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} hint={picked === today ? s.today : undefined}>
                    <div className="space-y-2">
                      {habits.map((h, hi) => {
                        const state = dayState(h, picked, doc.value, auto)
                        const c = colorOf(h, hi)
                        const can = !h.auto
                        return (
                          <motion.button
                            key={h.id}
                            type="button"
                            disabled={!can}
                            whileTap={can ? { scale: 0.97 } : undefined}
                            onClick={() => can && doc.save(toggle(doc.value, h.id, picked))}
                            aria-pressed={can ? state === 'done' : undefined}
                            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3 text-left transition-colors"
                            style={state === 'done' ? { borderColor: c, background: `${c}1f` } : undefined}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors" style={{ borderColor: c, background: state === 'done' ? c : 'transparent' }}>
                              {state === 'done' && <Check className="h-4 w-4 text-white" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-text">{h.name}</span>
                              <span className="block text-xs text-text-secondary">
                                {state === 'done' ? 'Done' : state === 'missed' ? (can ? 'Tap to mark done' : 'Missed') : 'No data yet'}
                                {h.auto && ' · automatic'}
                              </span>
                            </span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </Panel>
                </motion.div>
              </AnimatePresence>
            )}

            <Panel title={s.starters}>
              <div className="flex flex-wrap gap-2">
                {STARTERS.filter((x) => !habits.some((h) => h.name === x.name)).map((x, i) => (
                  <button key={x.name} type="button" onClick={() => add({ ...x, color: PALETTE[(habits.length + i) % PALETTE.length] })} disabled={habits.length >= 12} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-text hover:border-accent/50">
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
                <Field label="Colour">
                  <div className="flex flex-wrap items-center gap-2">
                    {PALETTE.map((p) => (
                      <button key={p} type="button" aria-label={`Colour ${p}`} aria-pressed={color === p} onClick={() => setColor(p)} className={cn('h-8 w-8 rounded-full transition-transform', color === p && 'scale-110 ring-2 ring-text ring-offset-2 ring-offset-card')} style={{ background: p }} />
                    ))}
                    <label className={cn('relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border', !PALETTE.includes(color) && 'ring-2 ring-text ring-offset-2 ring-offset-card')} style={!PALETTE.includes(color) ? { background: color } : undefined} title="Custom colour">
                      <Plus className="h-4 w-4 text-text-secondary" />
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom colour" />
                    </label>
                  </div>
                </Field>
                <Button
                  size="sm"
                  magnetic={false}
                  disabled={!name.trim() || habits.length >= 12 || doc.saving}
                  onClick={() => {
                    add({ name: name.trim(), auto: kind, target: kind === 'steps' ? 10000 : kind === 'sleep' ? 7 : 0, color })
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
