import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Baby, BellRing, Check, Plus, Repeat as RepeatIcon, Syringe, Trash2, Undo2 } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, Pill, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { childSchedule, complete, type DoseStatus, type Reminder, type Repeat } from '@/lib/vaccines'

// Any reminder at a date and hour — once, or repeating — and each child's vaccination schedule from their date of
// birth. The phone reminds you at the hour; vaccines a week before, the day before and on the day.

const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'none', label: 'Once' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'yearly', label: 'Yearly' },
]
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7) // 7 AM – 10 PM, when reminders are sent
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`
const newId = () => Math.random().toString(36).slice(2, 10)
const niceDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const ageOf = (dob: string, today: string) => {
  const m = (Number(today.slice(0, 4)) - Number(dob.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(dob.slice(5, 7)) - (today.slice(8) < dob.slice(8) ? 1 : 0)
  return m < 24 ? `${m} month${m === 1 ? '' : 's'}` : `${Math.floor(m / 12)} years`
}

const TONE: Record<DoseStatus, string> = {
  given: 'border-positive/40 bg-positive/10',
  overdue: 'border-error/40 bg-error/10',
  due: 'border-amber-500/50 bg-amber-500/10',
  upcoming: 'border-border bg-surface-2',
}

export function Reminders() {
  const doc = useGrowthDoc('reminders')
  const today = todayStr()
  const [tab, setTab] = useState<'reminders' | 'vaccines'>('reminders')
  const [draft, setDraft] = useState<Omit<Reminder, 'id' | 'done'>>({ title: '', note: '', date: today, hour: 9, repeat: 'none' })
  const [child, setChild] = useState({ name: '', dob: '' })
  const [childId, setChildId] = useState<string | null>(null)
  const { items, children, vaccines } = doc.value
  const save = (patch: Partial<typeof doc.value>) => doc.save({ ...doc.value, ...patch })

  const open = items.filter((r) => !r.done).sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
  const active = children.find((c) => c.id === childId) ?? children[0]
  const plan = useMemo(() => (active ? childSchedule(active.dob, vaccines[active.id] ?? {}, today) : []), [active, vaccines, today])
  const groups = useMemo(() => {
    const map = new Map<string, typeof plan>()
    for (const d of plan) map.set(d.age, [...(map.get(d.age) ?? []), d])
    return [...map.entries()]
  }, [plan])

  const toggleDose = (code: string) => {
    if (!active) return
    haptic(12)
    const given = { ...(vaccines[active.id] ?? {}) }
    if (given[code]) delete given[code]
    else given[code] = today
    save({ vaccines: { ...vaccines, [active.id]: given } })
  }

  if (doc.loading) return <Loading label="Loading reminders…" />

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHero eyebrow="Life" title="Reminders" lede="Anything you need to remember, once or on repeat — and your child’s vaccine schedule with reminders before each due date." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="flex gap-2">
        <Pill active={tab === 'reminders'} onClick={() => setTab('reminders')}>⏰ Reminders</Pill>
        <Pill active={tab === 'vaccines'} onClick={() => setTab('vaccines')}>💉 Child vaccines</Pill>
      </div>

      {tab === 'reminders' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Panel title="Upcoming" hint={`${open.length} open`}>
            {open.length === 0 ? <Empty title="No reminders yet." /> : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {open.map((r) => {
                    const late = r.date < today
                    return (
                      <motion.li key={r.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={cn('flex items-center gap-3 rounded-2xl border p-3', late ? 'border-error/40 bg-error/5' : r.date === today ? 'border-accent/50 bg-accent/5' : 'border-border bg-surface-2')}>
                        <button type="button" aria-label="Done" onClick={() => { haptic(14); save({ items: items.map((x) => (x.id === r.id ? complete(x, today) : x)) }) }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-accent/60 text-accent hover:bg-accent hover:text-[#0b0a09]">
                          <Check className="h-4 w-4" />
                        </button>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-text">{r.title}</span>
                          <span className={cn('flex flex-wrap items-center gap-x-2 text-xs', late ? 'text-error' : 'text-text-secondary')}>
                            {r.date === today ? 'Today' : niceDate(r.date)} · {hourLabel(r.hour)}
                            {r.repeat !== 'none' && <span className="inline-flex items-center gap-0.5"><RepeatIcon className="h-3 w-3" />{REPEATS.find((x) => x.id === r.repeat)!.label}</span>}
                          </span>
                          {r.note && <span className="block truncate text-xs text-text-secondary">{r.note}</span>}
                        </span>
                        <button type="button" aria-label="Delete" onClick={() => save({ items: items.filter((x) => x.id !== r.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </Panel>
          <Panel title="New reminder" action={<BellRing className="h-4 w-4 text-accent" />}>
            <div className="space-y-3">
              <Field label="What"><input className={inputCls} value={draft.title} maxLength={100} placeholder="e.g. Pay school fees" onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><input type="date" className={inputCls} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
                <Field label="Time">
                  <select className={inputCls} value={draft.hour} onChange={(e) => setDraft({ ...draft, hour: Number(e.target.value) })}>
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Repeat">
                <div className="flex flex-wrap gap-1.5">
                  {REPEATS.map((x) => <Pill key={x.id} active={draft.repeat === x.id} onClick={() => setDraft({ ...draft, repeat: x.id })}>{x.label}</Pill>)}
                </div>
              </Field>
              <Field label="Note"><input className={inputCls} value={draft.note} maxLength={300} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
              <button type="button" disabled={!draft.title.trim() || !draft.date} onClick={() => { save({ items: [...items, { ...draft, title: draft.title.trim(), id: newId(), done: false }] }); setDraft({ title: '', note: '', date: today, hour: 9, repeat: 'none' }); haptic(12) }} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
                <Plus className="h-4 w-4" /> Add reminder
              </button>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            {children.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {children.map((c) => <Pill key={c.id} active={active?.id === c.id} onClick={() => setChildId(c.id)}>{c.name}</Pill>)}
              </div>
            )}
            {!active ? (
              <Panel><Empty title="Add your child to see their vaccine schedule." /></Panel>
            ) : (
              <>
                <Panel>
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Baby className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xl text-text">{active.name}</p>
                      <p className="text-sm text-text-secondary">Born {niceDate(active.dob)} · {ageOf(active.dob, today)}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-mono text-lg font-semibold text-positive">{plan.filter((d) => d.status === 'given').length}/{plan.length}</p>
                      <p className="text-2xs text-text-secondary">given</p>
                    </div>
                  </div>
                  {plan.some((d) => d.status === 'overdue') && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{plan.filter((d) => d.status === 'overdue').length} doses past their due date — tick the ones already given.</p>}
                </Panel>
                {groups.map(([age, doses]) => (
                  <Panel key={age} title={age} hint={`Due ${niceDate(doses[0].due)}`}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {doses.map((d) => (
                        <motion.button key={d.code} type="button" whileTap={{ scale: 0.97 }} onClick={() => toggleDose(d.code)} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left', TONE[d.status])}>
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', d.status === 'given' ? 'bg-positive text-white' : 'bg-card text-accent')}>
                            {d.status === 'given' ? <Check className="h-4 w-4" /> : <Syringe className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text">{d.name}</span>
                            <span className="block truncate text-xs text-text-secondary">{d.status === 'given' ? `Given ${niceDate(d.givenOn!)}` : d.status === 'overdue' ? `Was due ${niceDate(d.due)}` : `Due ${niceDate(d.due)}`}{d.note ? ` · ${d.note}` : ''}</span>
                          </span>
                          {d.status === 'given' && <Undo2 className="h-3.5 w-3.5 text-text-secondary" />}
                        </motion.button>
                      ))}
                    </div>
                  </Panel>
                ))}
                <p className="text-xs text-text-secondary">Based on the Indian Academy of Pediatrics schedule. Your paediatrician’s advice and the vaccine card come first; some vaccines (e.g. rotavirus, typhoid, influenza) vary by brand and doctor.</p>
              </>
            )}
          </div>
          <div className="space-y-4">
            <Panel title="Add a child">
              <div className="space-y-3">
                <Field label="Name"><input className={inputCls} value={child.name} maxLength={40} onChange={(e) => setChild({ ...child, name: e.target.value })} /></Field>
                <Field label="Date of birth"><input type="date" className={inputCls} max={today} value={child.dob} onChange={(e) => setChild({ ...child, dob: e.target.value })} /></Field>
                <button type="button" disabled={!child.name.trim() || !child.dob} onClick={() => { const id = newId(); save({ children: [...children, { id, name: child.name.trim(), dob: child.dob }] }); setChildId(id); setChild({ name: '', dob: '' }); haptic(12) }} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </Panel>
            {children.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="text-text">{c.name}</span>
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => { const v = { ...vaccines }; delete v[c.id]; save({ children: children.filter((x) => x.id !== c.id), vaccines: v }) }} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <Notice tone="info">Phone reminders at 8 AM: a week before, the day before and on the day each dose is due.</Notice>
          </div>
        </div>
      )}
    </div>
  )
}
