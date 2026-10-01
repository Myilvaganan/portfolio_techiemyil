import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Pause, Play, Plus, RotateCcw, Timer, Trash2 } from 'lucide-react'
import { Empty, Loading, Notice, PageHero, Panel, Pill, Stat, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc, type Task, type TaskWhen } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { lastDays } from '@/lib/growth/habits'

// Tasks in three buckets and a focus timer. A finished focus block is logged against the task it was for, so the
// weekly review can show focused hours next to everything else.

const WHEN: { id: TaskWhen; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'someday', label: 'Someday' },
]
const LENGTHS = [15, 25, 45, 60]
const newId = () => Math.random().toString(36).slice(2, 10)
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

function FocusTimer({ tasks, onDone }: { tasks: Task[]; onDone: (minutes: number, task: string) => void }) {
  const [length, setLength] = useState(25)
  const [left, setLeft] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [task, setTask] = useState('')
  const endsAt = useRef(0)

  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => {
      const s = Math.max(0, Math.round((endsAt.current - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) {
        setRunning(false)
        haptic(300)
        try {
          new Notification('Focus block done', { body: task ? `Well done on “${task}”. Take 5 minutes.` : 'Take a 5-minute break.' })
        } catch {
          // Notifications not allowed: the screen still shows it.
        }
        onDone(length, task)
        setLeft(length * 60)
      }
    }, 500)
    return () => window.clearInterval(t)
  }, [running, length, task, onDone])

  const start = () => {
    endsAt.current = Date.now() + left * 1000
    setRunning(true)
    haptic(12)
  }
  const pct = 1 - left / (length * 60)
  const r = 88
  const c = 2 * Math.PI * r

  return (
    <Panel title="Focus" hint="Pick a task, start the timer, and stay on it until it rings.">
      <div className="flex flex-col items-center gap-4">
        <div className="relative grid place-items-center">
          <svg viewBox="0 0 200 200" className="h-52 w-52 -rotate-90">
            <circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" className="stroke-surface-5" />
            <motion.circle cx="100" cy="100" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className="stroke-accent" strokeDasharray={c} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.5 }} />
          </svg>
          <div className="absolute text-center">
            <p className="font-mono text-4xl font-semibold text-text">{mmss(left)}</p>
            <p className="text-xs text-text-secondary">{running ? 'Focusing' : 'Ready'}</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {LENGTHS.map((m) => (
            <Pill key={m} active={length === m} onClick={() => { if (!running) { setLength(m); setLeft(m * 60) } }}>{m} min</Pill>
          ))}
        </div>
        <select className={inputCls} value={task} disabled={running} onChange={(e) => setTask(e.target.value)}>
          <option value="">No particular task</option>
          {tasks.filter((t) => !t.done).map((t) => <option key={t.id}>{t.title}</option>)}
        </select>
        <div className="flex gap-2">
          <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={() => (running ? setRunning(false) : start())} className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[#0b0a09] shadow-lg">
            {running ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </motion.button>
          <button type="button" aria-label="Reset" onClick={() => { setRunning(false); setLeft(length * 60) }} className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-text-secondary">
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>
    </Panel>
  )
}

export function Focus() {
  const doc = useGrowthDoc('tasks')
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState<TaskWhen>('today')
  const today = todayStr()
  const { tasks, sessions } = doc.value

  const week = useMemo(() => new Set(lastDays(today, 7)), [today])
  const focusToday = sessions.filter((x) => x.date === today).reduce((s, x) => s + x.minutes, 0)
  const focusWeek = sessions.filter((x) => week.has(x.date)).reduce((s, x) => s + x.minutes, 0)
  const doneWeek = tasks.filter((t) => t.done && week.has(t.doneOn)).length

  const save = (next: Partial<typeof doc.value>) => doc.save({ ...doc.value, ...next })
  const add = () => {
    if (!title.trim()) return
    save({ tasks: [{ id: newId(), title: title.trim(), when, done: false, doneOn: '', created: today }, ...tasks] })
    setTitle('')
    haptic(8)
  }
  const toggle = (t: Task) => {
    haptic(t.done ? 6 : 14)
    save({ tasks: tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done, doneOn: x.done ? '' : today } : x)) })
  }
  const move = (t: Task, w: TaskWhen) => save({ tasks: tasks.map((x) => (x.id === t.id ? { ...x, when: w } : x)) })
  const remove = (t: Task) => save({ tasks: tasks.filter((x) => x.id !== t.id) })
  const clearDone = () => save({ tasks: tasks.filter((x) => !x.done || x.doneOn === today) })

  if (doc.loading) return <Loading label="Loading your tasks…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Productivity" title="Tasks & Focus" lede="What to do today, this week and someday — and a focus timer that logs your deep-work time." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Focus today" value={`${Math.floor(focusToday / 60)}h ${focusToday % 60}m`} tone="gold" />
        <Stat label="Focus this week" value={`${Math.floor(focusWeek / 60)}h ${focusWeek % 60}m`} />
        <Stat label="Done this week" value={String(doneWeek)} tone={doneWeek ? 'good' : 'neutral'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Panel>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
              <input className={inputCls} value={title} maxLength={160} placeholder="Add a task…" onChange={(e) => setTitle(e.target.value)} />
              <select className={cn(inputCls, 'w-auto')} value={when} onChange={(e) => setWhen(e.target.value as TaskWhen)}>
                {WHEN.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
              </select>
              <button type="submit" aria-label="Add task" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-[#0b0a09]"><Plus className="h-5 w-5" /></button>
            </form>
          </Panel>
          {WHEN.map((w) => {
            const list = tasks.filter((t) => t.when === w.id && (!t.done || t.doneOn === today))
            return (
              <Panel key={w.id} title={w.label} hint={`${list.filter((t) => !t.done).length} open`}>
                {list.length === 0 ? (
                  <Empty title={w.id === 'today' ? 'Nothing for today yet.' : 'Empty.'} />
                ) : (
                  <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {list.map((t) => (
                        <motion.li key={t.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
                          <button type="button" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => toggle(t)} className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors', t.done ? 'border-positive bg-positive text-white' : 'border-text-secondary/50')}>
                            {t.done && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <span className={cn('min-w-0 flex-1 text-sm', t.done ? 'text-text-secondary line-through' : 'text-text')}>{t.title}</span>
                          {!t.done && (
                            <select aria-label="Move" className="rounded-lg bg-transparent text-xs text-text-secondary" value={t.when} onChange={(e) => move(t, e.target.value as TaskWhen)}>
                              {WHEN.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                            </select>
                          )}
                          <button type="button" aria-label="Delete" onClick={() => remove(t)} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </Panel>
            )
          })}
          {tasks.some((t) => t.done && t.doneOn !== today) && (
            <button type="button" onClick={clearDone} className="text-xs text-text-secondary hover:text-text">Clear older finished tasks</button>
          )}
        </div>
        <div className="space-y-4">
          <FocusTimer tasks={tasks} onDone={(minutes, task) => save({ sessions: [...sessions, { date: todayStr(), minutes, task }] })} />
          <Panel title="Recent focus" action={<Timer className="h-4 w-4 text-accent" />}>
            {sessions.length === 0 ? <Empty title="No focus blocks yet." /> : (
              <ul className="space-y-1 text-sm">
                {[...sessions].reverse().slice(0, 8).map((x, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="truncate text-text">{x.task || 'Focus'}</span><span className="shrink-0 font-mono text-text-secondary">{x.minutes}m · {x.date.slice(5)}</span></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
