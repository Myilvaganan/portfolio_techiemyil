import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, ChevronDown, Flame, GlassWater, ListTodo, Pill as PillIcon, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { addWater } from '@/lib/growth/water'
import { toggle as toggleHabit } from '@/lib/growth/habits'

// Home's first card: how much of today is done, the next thing to do, and — tapped open — the whole list to tick
// right there. "Open Today" goes to the full page with the trading check-in, bills and the day's timings.

interface Item {
  key: string
  icon: typeof Check
  title: string
  sub?: string
  done: boolean
  late?: boolean
  onTap?: () => void
}

const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`

export function TodayCard() {
  const navigate = useNavigate()
  const today = todayStr()
  const [open, setOpen] = useState(false)
  const tasks = useGrowthDoc('tasks')
  const habits = useGrowthDoc('habits')
  const water = useGrowthDoc('water')
  const meds = useGrowthDoc('meds')
  const gate = useGrowthDoc('gate')
  const reminders = useGrowthDoc('reminders')
  const loading = tasks.loading || habits.loading || water.loading || meds.loading

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const now = new Date().getHours()
    const taken = new Set(meds.value.taken[today] ?? [])
    for (const x of meds.value.items.filter((m) => m.active).flatMap((m) => m.hours.map((h) => ({ m, h }))).sort((a, b) => a.h - b.h)) {
      const key = `${x.m.id}@${x.h}`
      out.push({
        key: `med-${key}`,
        icon: PillIcon,
        title: x.m.name,
        sub: hourLabel(x.h),
        done: taken.has(key),
        late: !taken.has(key) && x.h < now,
        onTap: () => {
          const list = meds.value.taken[today] ?? []
          meds.save({ ...meds.value, taken: { ...meds.value.taken, [today]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] } })
        },
      })
    }
    for (const r of reminders.value.items.filter((r) => !r.done && r.date <= today)) {
      out.push({ key: `rem-${r.id}`, icon: ListTodo, title: r.title, sub: `Reminder · ${hourLabel(r.hour)}`, done: false, late: r.date < today || r.hour < now, onTap: () => navigate('/reminders') })
    }
    for (const t of tasks.value.tasks.filter((t) => t.when === 'today' && (!t.done || t.doneOn === today))) {
      out.push({ key: `task-${t.id}`, icon: ListTodo, title: t.title, sub: 'Task', done: t.done, onTap: () => tasks.save({ ...tasks.value, tasks: tasks.value.tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, doneOn: x.done ? '' : today } : x)) }) })
    }
    for (const h of habits.value.habits.filter((h) => !h.auto)) {
      out.push({ key: `habit-${h.id}`, icon: Flame, title: h.name, sub: 'Habit', done: Boolean(habits.value.checks[today]?.includes(h.id)), onTap: () => habits.save(toggleHabit(habits.value, h.id, today)) })
    }
    const target = water.value.customMl || water.value.targetMl
    if (target) {
      const drunk = water.value.logs[today] || 0
      out.push({ key: 'water', icon: GlassWater, title: drunk >= target ? 'Water target reached' : `Water ${(drunk / 1000).toFixed(1)} / ${(target / 1000).toFixed(1)} L`, sub: drunk >= target ? undefined : `Tap to add ${water.value.glassMl} ml`, done: drunk >= target, onTap: drunk >= target ? undefined : () => water.save(addWater(water.value, today, water.value.glassMl)) })
    }
    return out
  }, [tasks, habits, water, meds, reminders, today, navigate])

  const done = items.filter((i) => i.done).length
  const pct = items.length ? done / items.length : 0
  const next = items.find((i) => !i.done && i.late) ?? items.find((i) => !i.done)
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay()
  const checkedIn = Boolean(gate.value.days[today]?.rulesRead)
  const r = 22
  const c = 2 * Math.PI * r

  return (
    <section aria-label="Today" className="depth overflow-hidden rounded-[20px] border border-border bg-card">
      <button type="button" onClick={() => { haptic(8); setOpen(!open) }} aria-expanded={open} className="flex w-full items-center gap-4 p-4 text-left">
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90">
            <circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" className="stroke-surface-5" />
            <motion.circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" strokeLinecap="round" className={pct === 1 ? 'stroke-positive' : 'stroke-accent'} strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} />
          </svg>
          <span className="font-mono text-sm font-semibold text-text">{loading ? '…' : `${done}/${items.length}`}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-semibold uppercase tracking-[0.18em] text-text-secondary">Today</span>
          <span className="block truncate text-base font-semibold text-text">
            {loading ? 'Loading your day…' : items.length === 0 ? 'Nothing planned yet' : pct === 1 ? 'All done for today 🎉' : next ? `Next: ${next.title}` : ''}
          </span>
          <span className={cn('block truncate text-xs', next?.late ? 'text-error' : 'text-text-secondary')}>
            {next?.late ? 'Overdue — tap to see' : next?.sub ?? (items.length ? 'Tap to see your list' : 'Add tasks, habits or medicines')}
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="shrink-0 text-text-secondary">
          <ChevronDown className="h-5 w-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="space-y-1.5 border-t border-border px-3 pb-3 pt-3">
              {wd >= 1 && wd <= 5 && !checkedIn && (
                <button type="button" onClick={() => navigate('/today')} className="flex w-full items-center gap-3 rounded-2xl bg-amber-500/10 p-2.5 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500"><ShieldCheck className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-text">Trading check-in not done</span>
                  <ArrowRight className="h-4 w-4 text-text-secondary" />
                </button>
              )}
              {items.map((i) => (
                <motion.button key={i.key} type="button" layout whileTap={i.onTap ? { scale: 0.97 } : undefined} onClick={() => { if (i.onTap) { haptic(12); i.onTap() } }} className="depth flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-2.5 text-left">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors', i.done ? 'bg-positive text-white' : i.late ? 'bg-error/10 text-error' : 'bg-accent/10 text-accent')}>
                    {i.done ? <Check className="h-4 w-4" /> : <i.icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm', i.done ? 'text-text-secondary line-through' : 'text-text')}>{i.title}</span>
                    {i.sub && <span className={cn('block truncate text-xs', i.late && !i.done ? 'text-error' : 'text-text-secondary')}>{i.sub}</span>}
                  </span>
                </motion.button>
              ))}
              <button type="button" onClick={() => navigate('/today')} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-text py-3 text-sm font-semibold text-bg transition-transform active:scale-[0.98]">
                Open Today <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
