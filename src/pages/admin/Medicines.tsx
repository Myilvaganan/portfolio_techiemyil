import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CalendarClock, Check, Pill as PillIcon, Plus, Trash2 } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, Pill, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { medDueOn, useGrowthDoc, type Med } from '@/lib/growthApi'
import { lastDays } from '@/lib/growth/habits'
import { todayStr } from '@/lib/journal'

// Medicines and supplements with their times and how often: daily, every other day, every N days, or on chosen
// weekdays (e.g. Vitamin D3 on Sundays). Reminders and the Today list only count a tablet on the days it's due.

const label = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`
const QUICK = [7, 8, 9, 13, 14, 19, 20, 21, 22]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const newId = () => Math.random().toString(36).slice(2, 10)
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** A colour per medicine, so each one is easy to spot. */
const COLORS = [
  { ring: '#f59e0b', bg: 'from-amber-500/20 to-amber-500/5', chip: 'bg-amber-500' },
  { ring: '#3b82f6', bg: 'from-blue-500/20 to-blue-500/5', chip: 'bg-blue-500' },
  { ring: '#ec4899', bg: 'from-pink-500/20 to-pink-500/5', chip: 'bg-pink-500' },
  { ring: '#10b981', bg: 'from-emerald-500/20 to-emerald-500/5', chip: 'bg-emerald-500' },
  { ring: '#8b5cf6', bg: 'from-violet-500/20 to-violet-500/5', chip: 'bg-violet-500' },
  { ring: '#f97316', bg: 'from-orange-500/20 to-orange-500/5', chip: 'bg-orange-500' },
  { ring: '#14b8a6', bg: 'from-teal-500/20 to-teal-500/5', chip: 'bg-teal-500' },
  { ring: '#ef4444', bg: 'from-red-500/20 to-red-500/5', chip: 'bg-red-500' },
]

type Freq = 'daily' | 'alternate' | 'everyN' | 'weekly'
const FREQS: { id: Freq; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'alternate', label: 'Every other day' },
  { id: 'everyN', label: 'Every few days' },
  { id: 'weekly', label: 'Weekly' },
]

export function scheduleText(m: Med) {
  if (m.weekdays?.length) return m.weekdays.length === 7 ? 'Every day' : m.weekdays.map((d) => DAYS[d]).join(', ')
  if (!m.every || m.every === 1) return 'Every day'
  if (m.every === 2) return 'Every other day'
  if (m.every === 7) return 'Once a week'
  return `Every ${m.every} days`
}

/** The next date it's due from today (inclusive). */
function nextDue(m: Med, today: string) {
  for (let i = 0; i < 60; i++) if (medDueOn(m, shift(today, i))) return shift(today, i)
  return null
}

export function Medicines() {
  const doc = useGrowthDoc('meds')
  const today = todayStr()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [hours, setHours] = useState<number[]>([8])
  const [freq, setFreq] = useState<Freq>('daily')
  const [everyN, setEveryN] = useState(3)
  const [weekdays, setWeekdays] = useState<number[]>([0])
  const [start, setStart] = useState(today)
  const { items, taken } = doc.value
  const todayTaken = new Set(taken[today] ?? [])
  const week = lastDays(today, 7)
  const colorOf = (id: string) => COLORS[Math.max(0, items.findIndex((x) => x.id === id)) % COLORS.length]
  const dueToday = items.filter((m) => m.active && medDueOn(m, today))
  const notToday = items.filter((m) => m.active && !medDueOn(m, today))

  const toggle = (key: string) => {
    haptic(12)
    const list = taken[today] ?? []
    doc.save({ ...doc.value, taken: { ...taken, [today]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] } })
  }

  const add = () => {
    const every = freq === 'alternate' ? 2 : freq === 'everyN' ? everyN : 1
    const med: Med = { id: newId(), name: name.trim(), dose: dose.trim(), hours, active: true, every, weekdays: freq === 'weekly' ? weekdays : [], start }
    doc.save({ ...doc.value, items: [...items, med] })
    setName('')
    setDose('')
    haptic(12)
  }

  if (doc.loading) return <Loading label="Loading your medicines…" />

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHero eyebrow="Health" title="Medicines" lede="Your tablets and supplements — daily, every other day, every few days or weekly — with a reminder at each time until it’s ticked." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Panel title="Today" hint={dueToday.length ? `${dueToday.reduce((s, m) => s + m.hours.length, 0)} doses` : undefined}>
            {dueToday.length === 0 ? <Empty title={items.length ? 'Nothing due today.' : 'Add a medicine to start.'} /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {dueToday.flatMap((m) => m.hours.map((h) => ({ m, h }))).sort((a, b) => a.h - b.h).map(({ m, h }) => {
                  const key = `${m.id}@${h}`
                  const done = todayTaken.has(key)
                  const c = colorOf(m.id)
                  return (
                    <motion.button key={key} type="button" whileTap={{ scale: 0.96 }} onClick={() => toggle(key)} className={cn('depth flex items-center gap-3 rounded-2xl border bg-gradient-to-br p-3 text-left', c.bg)} style={{ borderColor: done ? '#10b981' : `${c.ring}66` }}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md" style={{ background: done ? '#10b981' : c.ring }}>
                        {done ? <Check className="h-5 w-5" /> : <PillIcon className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate font-semibold', done ? 'text-text-secondary line-through' : 'text-text')}>{m.name}</span>
                        <span className="block truncate text-xs text-text-secondary">{label(h)}{m.dose ? ` · ${m.dose}` : ''}</span>
                      </span>
                      {!done && h <= new Date().getHours() && <span className="shrink-0 rounded-full bg-error/15 px-2 py-0.5 text-2xs font-semibold text-error">Due</span>}
                    </motion.button>
                  )
                })}
              </div>
            )}
            {notToday.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3 text-xs text-text-secondary">
                <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Not today:</span>
                {notToday.map((m) => {
                  const n = nextDue(m, today)
                  return (
                    <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
                      <span className={cn('h-2 w-2 rounded-full', colorOf(m.id).chip)} />
                      {m.name}{n ? ` · next ${new Date(`${n}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}
                    </span>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel title="Your medicines">
            {items.length === 0 ? <Empty title="None yet." /> : (
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {items.map((m) => {
                    const c = colorOf(m.id)
                    return (
                      <motion.div key={m.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }} className={cn('depth rounded-2xl border-l-4 bg-gradient-to-r p-3', c.bg)} style={{ borderLeftColor: c.ring }}>
                        <div className="flex items-center gap-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-text">{m.name}</span>
                            <span className="block truncate text-xs text-text-secondary">{scheduleText(m)} · {m.hours.map(label).join(', ')}{m.dose ? ` · ${m.dose}` : ''}</span>
                          </span>
                          <button type="button" aria-label={`Remove ${m.name}`} onClick={() => doc.save({ ...doc.value, items: items.filter((x) => x.id !== m.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                        {/* The last 7 days: filled when every dose that day was taken; days it wasn't due are dotted. */}
                        <div className="mt-2 flex gap-1">
                          {week.map((d) => {
                            const due = medDueOn(m, d)
                            const n = (taken[d] ?? []).filter((k) => k.startsWith(`${m.id}@`)).length
                            return (
                              <span key={d} title={`${d}: ${due ? `${n}/${m.hours.length}` : 'not due'}`} className="flex h-7 flex-1 items-center justify-center rounded-md text-[10px] font-semibold" style={!due ? { border: '1px dashed var(--color-border)' } : n >= m.hours.length ? { background: c.ring, color: '#fff' } : n ? { background: `${c.ring}66`, color: '#fff' } : { background: 'var(--color-surface-5, rgba(127,127,127,.15))' }}>
                                {DAYS[new Date(`${d}T00:00:00Z`).getUTCDay()].slice(0, 1)}
                              </span>
                            )
                          })}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Add a medicine">
            <div className="space-y-3">
              <Field label="Name"><input className={inputCls} value={name} maxLength={60} placeholder="e.g. Vitamin D3" onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Dose"><input className={inputCls} value={dose} maxLength={40} placeholder="e.g. 60,000 IU after food" onChange={(e) => setDose(e.target.value)} /></Field>
              <Field label="How often">
                <div className="flex flex-wrap gap-1.5">
                  {FREQS.map((f) => <Pill key={f.id} active={freq === f.id} onClick={() => setFreq(f.id)}>{f.label}</Pill>)}
                </div>
              </Field>
              {freq === 'everyN' && (
                <Field label={`Every ${everyN} days`}>
                  <input type="range" min={3} max={30} value={everyN} onChange={(e) => setEveryN(Number(e.target.value))} className="w-full accent-amber-500" />
                </Field>
              )}
              {freq === 'weekly' && (
                <Field label="On">
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS.map((d, i) => (
                      <button key={d} type="button" aria-pressed={weekdays.includes(i)} onClick={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i].sort())} className={cn('h-9 rounded-lg text-xs font-semibold', weekdays.includes(i) ? 'bg-accent text-[#0b0a09]' : 'bg-surface-2 text-text-secondary')}>{d.slice(0, 2)}</button>
                    ))}
                  </div>
                </Field>
              )}
              {(freq === 'alternate' || freq === 'everyN') && (
                <Field label="Starting from" hint="The first day you take it; it repeats from here.">
                  <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
                </Field>
              )}
              <Field label="Times">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((h) => <Pill key={h} active={hours.includes(h)} onClick={() => setHours(hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h].sort((a, b) => a - b))}>{label(h)}</Pill>)}
                </div>
              </Field>
              <button type="button" disabled={!name.trim() || !hours.length || (freq === 'weekly' && !weekdays.length)} onClick={add} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </Panel>
          <Panel>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={doc.value.reminders} onChange={(e) => doc.save({ ...doc.value, reminders: e.target.checked })} className="h-4 w-4 accent-amber-500" />
              <BellRing className="h-4 w-4 text-accent" /> Phone reminders at each time, on the days it’s due
            </label>
          </Panel>
        </div>
      </div>
    </div>
  )
}
