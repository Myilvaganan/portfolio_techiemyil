import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Cake, Flower2, Gift, Heart, Plus, Trash2 } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc, type Person } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { NAKSHATRA, TAMIL_MONTH } from '@/lib/panchang/core'

// Birthdays, anniversaries and remembrance days — by English date, or by Tamil star (natchathiram) the way many
// families keep them. A reminder comes 3 days before, the day before and on the day.

const KINDS: { id: Person['kind']; label: string; icon: typeof Cake }[] = [
  { id: 'birthday', label: 'Birthday', icon: Cake },
  { id: 'anniversary', label: 'Anniversary', icon: Heart },
  { id: 'memorial', label: 'Remembrance', icon: Flower2 },
  { id: 'other', label: 'Other', icon: Gift },
]
const newId = () => Math.random().toString(36).slice(2, 10)
const daysUntil = (date: string, today: string) => {
  const y = Number(today.slice(0, 4))
  let next = `${y}-${date.slice(5)}`
  if (next < today) next = `${y + 1}-${date.slice(5)}`
  return Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

export function Family() {
  const doc = useGrowthDoc('family')
  const today = todayStr()
  const [draft, setDraft] = useState<Omit<Person, 'id'>>({ name: '', relation: '', kind: 'birthday', date: '', star: -1, tamilMonth: -1 })
  const people = [...doc.value.people].sort((a, b) => (a.date ? daysUntil(a.date, today) : 999) - (b.date ? daysUntil(b.date, today) : 999))

  if (doc.loading) return <Loading label="Loading…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Life" title="Family dates" lede="Birthdays, anniversaries and remembrance days — by English date or Tamil star. Reminders 3 days before, the day before and on the day." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Upcoming">
          {people.length === 0 ? <Empty title="Add the dates you never want to miss." /> : (
            <div className="grid gap-2 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {people.map((p) => {
                  const k = KINDS.find((x) => x.id === p.kind)!
                  const d = p.date ? daysUntil(p.date, today) : null
                  const age = p.date ? Number(today.slice(0, 4)) - Number(p.date.slice(0, 4)) + (d === 0 ? 0 : 1) : null
                  return (
                    <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className={cn('flex items-center gap-3 rounded-2xl border p-3', d !== null && d <= 7 ? 'border-accent/50 bg-accent/10' : 'border-border bg-surface-2')}>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-card text-accent"><k.icon className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-text">{p.name}</span>
                        <span className="block truncate text-xs text-text-secondary">
                          {[p.relation, k.label, p.date && new Date(`${p.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), p.star >= 0 && `${NAKSHATRA[p.star][0]}${p.tamilMonth >= 0 ? ` in ${TAMIL_MONTH[p.tamilMonth][0]}` : ''}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {d !== null && (
                        <span className="text-right">
                          <span className={cn('block font-mono text-lg font-semibold', d <= 7 ? 'text-accent' : 'text-text')}>{d === 0 ? 'Today' : `${d}d`}</span>
                          {age && age > 0 && age < 120 && p.kind !== 'memorial' && <span className="block text-2xs text-text-secondary">{p.kind === 'birthday' ? `turns ${age}` : `${age} yrs`}</span>}
                        </span>
                      )}
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => doc.save({ people: doc.value.people.filter((x) => x.id !== p.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </Panel>
        <Panel title="Add a date">
          <div className="space-y-3">
            <Field label="Name"><input className={inputCls} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relation"><input className={inputCls} value={draft.relation} maxLength={40} placeholder="e.g. Mother" onChange={(e) => setDraft({ ...draft, relation: e.target.value })} /></Field>
              <Field label="Kind">
                <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Person['kind'] })}>
                  {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="English date (year optional for age)"><input type="date" className={inputCls} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tamil star (optional)">
                <select className={inputCls} value={draft.star} onChange={(e) => setDraft({ ...draft, star: Number(e.target.value) })}>
                  <option value={-1}>—</option>
                  {NAKSHATRA.map((n, i) => <option key={n[0]} value={i}>{n[0]}</option>)}
                </select>
              </Field>
              <Field label="In Tamil month">
                <select className={inputCls} value={draft.tamilMonth} onChange={(e) => setDraft({ ...draft, tamilMonth: Number(e.target.value) })}>
                  <option value={-1}>Any</option>
                  {TAMIL_MONTH.map((n, i) => <option key={n[0]} value={i}>{n[0]}</option>)}
                </select>
              </Field>
            </div>
            <button type="button" disabled={!draft.name.trim() || (!draft.date && draft.star < 0)} onClick={() => { doc.save({ people: [...doc.value.people, { ...draft, name: draft.name.trim(), id: newId() }] }); setDraft({ name: '', relation: '', kind: 'birthday', date: '', star: -1, tamilMonth: -1 }); haptic(12) }} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}
