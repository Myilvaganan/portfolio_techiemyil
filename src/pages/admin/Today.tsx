import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, BookOpenCheck, Check, CheckCircle2, Clock, Droplets, Flame, GlassWater, Gift, ListTodo, Moon, Pill as PillIcon, ShieldCheck, Sun, Wallet, XCircle } from 'lucide-react'
import { Loading, PageHero, Panel } from '@/components/growth/kit'
import { FestiveIcon, ICON_TONE } from '@/components/calendar/FestiveIcon'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc, type GateDay } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { todayStr } from '@/lib/journal'
import { useProfile } from '@/lib/profile'
import { addWater, latestWeight, waterTarget } from '@/lib/growth/water'
import { toggle as toggleHabit } from '@/lib/growth/habits'
import { checkAutopay } from '@/lib/autopay'
import { gateAdvice } from '@/lib/gate'
import { dayDivisions, istTime, nallaNeram } from '@/lib/panchang/core'
import { dayFacts, rasiPalan, specialsFor } from '@/lib/panchang/days'
import { placeOf } from '@/lib/panchang/note'

// The one screen to open each morning: everything due today across the app, with the things you can do right here
// (tick a task, a habit, a medicine, a glass of water) done right here.

const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const daysTo = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

function Row({ icon, title, sub, done, onClick, to, tone }: { icon: React.ReactNode; title: string; sub?: string; done?: boolean; onClick?: () => void; to?: string; tone?: 'bad' | 'warn' | 'good' }) {
  const body = (
    <>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', done ? 'bg-positive/15 text-positive' : tone === 'bad' ? 'bg-error/10 text-error' : tone === 'warn' ? 'bg-amber-500/10 text-amber-500' : 'bg-accent/10 text-accent')}>
        {done ? <Check className="h-4 w-4" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', done ? 'text-text-secondary line-through' : 'text-text')}>{title}</span>
        {sub && <span className="block truncate text-xs text-text-secondary">{sub}</span>}
      </span>
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 p-2.5 text-left transition-colors hover:border-accent/40'
  if (to) return <Link to={to} className={cls}>{body}</Link>
  return (
    <motion.button type="button" whileTap={onClick ? { scale: 0.97 } : undefined} onClick={onClick} disabled={!onClick} className={cls}>
      {body}
    </motion.button>
  )
}

const SCALE = ['', '😫', '😕', '😐', '🙂', '😄']

export function Today() {
  const today = todayStr()
  const m = useMoney()
  const { firstName } = useProfile()
  const { data, loading } = useSources(['trades', 'settings', 'bank', 'loans', 'health'])
  const tasks = useGrowthDoc('tasks')
  const gate = useGrowthDoc('gate')
  const rules = useGrowthDoc('guardrails')
  const habits = useGrowthDoc('habits')
  const water = useGrowthDoc('water')
  const meds = useGrowthDoc('meds')
  const life = useGrowthDoc('life-admin')
  const family = useGrowthDoc('family')
  const cal = useGrowthDoc('calendar')

  const sky = useMemo(() => {
    const place = placeOf(cal.value.place)
    const f = dayFacts(today, place)
    const div = dayDivisions(today, place)
    return { f, div, specials: specialsFor(f, dayFacts(shift(today, -1), place), dayFacts(shift(today, 1), place)), good: nallaNeram(div) }
  }, [today, cal.value.place])
  const palan = cal.value.rasi >= 0 ? rasiPalan(cal.value.rasi, cal.value.star, sky.f) : null

  const g: GateDay = gate.value.days[today] ?? { sleep: 0, mood: 0, rulesRead: false, plan: '', checks: [] }
  const setGate = (patch: Partial<GateDay>) => gate.save({ days: { ...gate.value.days, [today]: { ...g, ...patch } } })
  const checklist = rules.value.checklist
  const advice = gateAdvice({ day: gate.value.days[today], today, trades: data.trades ?? [], settings: data.settings ?? null, checklistLength: checklist.length, chandrashtamam: palan?.chandrashtamam })

  const wt = waterTarget(water.value, latestWeight(data.health ?? [])?.kg ?? null)
  const drunk = water.value.logs[today] || 0
  const autopay = useMemo(() => (data.loans && data.bank ? checkAutopay(data.loans, data.bank, today) : []), [data.loans, data.bank, today])
  const nowHour = new Date().getHours()

  const ready = !(loading || tasks.loading || gate.loading || habits.loading || water.loading)
  if (!ready) return <Loading label="Planning your day…" />

  const todayTasks = tasks.value.tasks.filter((t) => t.when === 'today' && (!t.done || t.doneOn === today))
  const manualHabits = habits.value.habits.filter((h) => !h.auto)
  const medSlots = meds.value.items.filter((x) => x.active).flatMap((x) => x.hours.map((h) => ({ med: x, hour: h, key: `${x.id}@${h}` })))
  const taken = new Set(meds.value.taken[today] ?? [])
  const lifeDue = life.value.items.filter((i) => !i.done && daysTo(today, i.dueDate) <= 7)
  const familySoon = family.value.people.filter((p) => p.date).map((p) => {
    const next = `${today.slice(0, 4)}-${p.date.slice(5)}`
    const d = daysTo(today, next < today ? `${Number(today.slice(0, 4)) + 1}-${p.date.slice(5)}` : next)
    return { p, d }
  }).filter((x) => x.d <= 7).sort((a, b) => a.d - b.d)
  const nextEmis = (data.loans ?? []).flatMap((l) => (l.nextDue && daysTo(today, l.nextDue.date) <= 7 ? [{ loan: l.label || l.short, date: l.nextDue.date, amount: l.nextDue.installment }] : []))
  const missing = autopay.filter((a) => a.status === 'missing')

  const total = todayTasks.length + manualHabits.length + medSlots.length + (wt ? 1 : 0)
  const doneCount = todayTasks.filter((t) => t.done).length + manualHabits.filter((h) => habits.value.checks[today]?.includes(h.id)).length + medSlots.filter((x) => taken.has(x.key)).length + (wt && drunk >= wt.target ? 1 : 0)
  const pct = total ? doneCount / total : 0
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={`${greeting}, ${firstName}`} lede={`${sky.f.tamil.monthTa} ${sky.f.tamil.day} · ${doneCount} of ${total} done today`} />

      {/* Progress */}
      <div className="h-2 overflow-hidden rounded-full bg-surface-5">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-[#d6b36a] to-positive" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {/* Alerts */}
          {(missing.length > 0 || advice.size === 'skip' || palan?.chandrashtamam) && (
            <div className="space-y-2">
              {missing.map((a) => (
                <Row key={`${a.loan}-${a.date}`} icon={<AlertTriangle className="h-4 w-4" />} tone="bad" title={`EMI not seen in the bank: ${a.loan}`} sub={`${m.inr(a.amount)} due ${a.date} — check the auto-debit`} to="/loans" />
              ))}
            </div>
          )}

          <Panel title="Today’s list" action={<Link to="/focus" className="text-xs text-accent">All tasks</Link>}>
            <div className="space-y-2">
              {todayTasks.map((t) => (
                <Row key={t.id} icon={<ListTodo className="h-4 w-4" />} title={t.title} done={t.done} onClick={() => { haptic(12); tasks.save({ ...tasks.value, tasks: tasks.value.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, doneOn: x.done ? '' : today } : x)) }) }} />
              ))}
              {manualHabits.map((h) => (
                <Row key={h.id} icon={<Flame className="h-4 w-4" />} title={h.name} sub="Habit" done={habits.value.checks[today]?.includes(h.id)} onClick={() => { haptic(12); habits.save(toggleHabit(habits.value, h.id, today)) }} />
              ))}
              {medSlots.sort((a, b) => a.hour - b.hour).map((x) => (
                <Row key={x.key} icon={<PillIcon className="h-4 w-4" />} tone={!taken.has(x.key) && x.hour < nowHour ? 'warn' : undefined} title={`${x.med.name}${x.med.dose ? ` · ${x.med.dose}` : ''}`} sub={`${((x.hour + 11) % 12) + 1} ${x.hour < 12 ? 'AM' : 'PM'}`} done={taken.has(x.key)} onClick={() => {
                  haptic(12)
                  const list = meds.value.taken[today] ?? []
                  meds.save({ ...meds.value, taken: { ...meds.value.taken, [today]: list.includes(x.key) ? list.filter((k) => k !== x.key) : [...list, x.key] } })
                }} />
              ))}
              {wt && (
                <Row icon={<GlassWater className="h-4 w-4" />} title={drunk >= wt.target ? 'Water target reached' : `Water: ${(drunk / 1000).toFixed(1)} of ${(wt.target / 1000).toFixed(1)} L`} sub={drunk >= wt.target ? undefined : `Tap to add a glass (${water.value.glassMl} ml)`} done={drunk >= wt.target} onClick={drunk >= wt.target ? undefined : () => { haptic(12); water.save(addWater(water.value, today, water.value.glassMl)) }} />
              )}
              {total === 0 && <p className="text-sm text-text-secondary">Nothing planned. Add tasks in <Link to="/focus" className="text-accent">Tasks & Focus</Link> or habits in <Link to="/habits" className="text-accent">Habits</Link>.</p>}
            </div>
          </Panel>

          {(nextEmis.length > 0 || lifeDue.length > 0 || familySoon.length > 0) && (
            <Panel title="Coming up">
              <div className="space-y-2">
                {nextEmis.map((e) => (
                  <Row key={e.loan} icon={<Wallet className="h-4 w-4" />} tone={daysTo(today, e.date) <= 1 ? 'warn' : undefined} title={`EMI ${m.inr(e.amount)} · ${e.loan}`} sub={daysTo(today, e.date) === 0 ? 'Due today' : `In ${daysTo(today, e.date)} days`} to="/loans" />
                ))}
                {lifeDue.map((i) => (
                  <Row key={i.id} icon={<BookOpenCheck className="h-4 w-4" />} tone={daysTo(today, i.dueDate) < 0 ? 'bad' : 'warn'} title={i.title} sub={daysTo(today, i.dueDate) < 0 ? `Overdue since ${i.dueDate}` : `Due ${i.dueDate}`} to="/life-admin" />
                ))}
                {familySoon.map(({ p, d }) => (
                  <Row key={p.id} icon={<Gift className="h-4 w-4" />} title={`${p.name}’s ${p.kind}`} sub={d === 0 ? 'Today!' : `In ${d} day${d === 1 ? '' : 's'}`} to="/family" />
                ))}
              </div>
            </Panel>
          )}

          {autopay.length > 0 && (
            <Panel title="EMI auto-debit check" hint="Each EMI matched to a bank debit within three days of the due date.">
              <div className="space-y-1.5 text-sm">
                {autopay.map((a) => (
                  <div key={`${a.loan}-${a.date}`} className="flex items-center gap-2">
                    {a.status === 'paid' ? <CheckCircle2 className="h-4 w-4 text-positive" /> : a.status === 'missing' ? <XCircle className="h-4 w-4 text-error" /> : <Clock className="h-4 w-4 text-text-secondary" />}
                    <span className="min-w-0 flex-1 truncate text-text">{a.loan} · {a.date}</span>
                    <span className="font-mono text-text-secondary">{m.inr(a.amount)}</span>
                    <span className={cn('w-16 text-right text-xs', a.status === 'paid' ? 'text-positive' : a.status === 'missing' ? 'text-error' : 'text-text-secondary')}>{a.status === 'paid' ? `paid ${a.paidOn?.slice(5)}` : a.status === 'missing' ? 'not found' : 'waiting'}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {/* Trading check-in */}
          <Panel title="Trading check-in" hint="Before the market opens." action={<ShieldCheck className={cn('h-5 w-5', advice.ready ? 'text-positive' : 'text-text-secondary')} />}>
            <div className="space-y-3">
              {(['sleep', 'mood'] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-medium text-text-secondary">{k === 'sleep' ? 'How did you sleep?' : 'How do you feel?'}</p>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" aria-pressed={g[k] === n} onClick={() => { haptic(6); setGate({ [k]: n }) }} className={cn('flex h-10 flex-1 items-center justify-center rounded-xl border text-lg transition-transform', g[k] === n ? 'scale-105 border-accent bg-accent/15' : 'border-border bg-surface-2 opacity-70')}>{SCALE[n]}</button>
                    ))}
                  </div>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={g.rulesRead} onChange={(e) => setGate({ rulesRead: e.target.checked })} className="h-4 w-4 accent-amber-500" />
                I’ve read my <Link to="/guardrails" className="text-accent">trading rules</Link>
              </label>
              {checklist.map((c, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-text">
                  <input type="checkbox" checked={g.checks.includes(i)} onChange={(e) => setGate({ checks: e.target.checked ? [...g.checks, i] : g.checks.filter((x) => x !== i) })} className="h-4 w-4 accent-amber-500" />
                  {c}
                </label>
              ))}
              <motion.div key={advice.size + advice.ready} initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('rounded-2xl p-3', advice.size === 'full' ? 'bg-positive/10' : advice.size === 'half' ? 'bg-amber-500/10' : 'bg-error/10')}>
                <p className={cn('font-display text-lg', advice.size === 'full' ? 'text-positive' : advice.size === 'half' ? 'text-amber-500' : 'text-error')}>
                  {advice.size === 'full' ? 'Normal size' : advice.size === 'half' ? 'Half size today' : 'Sit out today'}
                </p>
                {advice.reasons.map((r) => <p key={r} className="text-xs text-text-secondary">• {r}</p>)}
              </motion.div>
            </div>
          </Panel>

          {/* The day */}
          <Panel title="The day" action={<Link to="/tamil-calendar" className="text-xs text-accent">Calendar</Link>}>
            {sky.specials.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {sky.specials.map((x) => (
                  <span key={x.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-xs text-text">
                    <FestiveIcon kind={x.icon} className={cn('h-4 w-4', ICON_TONE[x.icon])} /> {x.name}
                  </span>
                ))}
              </div>
            )}
            <div className="space-y-1.5 text-sm">
              <p className="flex justify-between"><span className="flex items-center gap-1.5 text-text-secondary"><Sun className="h-4 w-4 text-positive" /> Good time</span><span className="text-right font-mono text-positive">{sky.good.map((x) => `${istTime(x.start)}–${istTime(x.end)}`).join(', ') || '—'}</span></p>
              <p className="flex justify-between"><span className="flex items-center gap-1.5 text-text-secondary"><Moon className="h-4 w-4 text-error" /> Rahu kalam</span><span className="font-mono text-error">{istTime(sky.div.rahu.start)}–{istTime(sky.div.rahu.end)}</span></p>
              <p className="flex justify-between"><span className="flex items-center gap-1.5 text-text-secondary"><Moon className="h-4 w-4 text-error" /> Yamagandam</span><span className="font-mono text-error">{istTime(sky.div.yama.start)}–{istTime(sky.div.yama.end)}</span></p>
            </div>
            {palan && <p className={cn('mt-3 rounded-xl p-2.5 text-xs', palan.chandrashtamam ? 'bg-error/10 text-error' : 'bg-surface-2 text-text-secondary')}>{'★'.repeat(palan.score)} {palan.line}</p>}
          </Panel>

          {wt && (
            <Panel>
              <div className="flex items-center gap-3">
                <Droplets className="h-8 w-8 text-sky-400" />
                <div className="flex-1">
                  <p className="text-sm text-text">{(drunk / 1000).toFixed(1)} / {(wt.target / 1000).toFixed(1)} L water</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-5"><div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, (drunk / wt.target) * 100)}%` }} /></div>
                </div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
