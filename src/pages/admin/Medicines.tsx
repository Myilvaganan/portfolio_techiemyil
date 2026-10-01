import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, Check, Pill as PillIcon, Plus, Trash2 } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, Pill, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc } from '@/lib/growthApi'
import { lastDays } from '@/lib/growth/habits'
import { todayStr } from '@/lib/journal'

// Medicines and supplements with their times. The phone reminds you at each time until it's ticked.

const label = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`
const QUICK = [7, 8, 9, 13, 14, 19, 20, 21, 22]
const newId = () => Math.random().toString(36).slice(2, 10)

export function Medicines() {
  const doc = useGrowthDoc('meds')
  const today = todayStr()
  const [name, setName] = useState('')
  const [dose, setDose] = useState('')
  const [hours, setHours] = useState<number[]>([8])
  const { items, taken } = doc.value
  const todayTaken = new Set(taken[today] ?? [])
  const week = lastDays(today, 7)

  const toggle = (key: string) => {
    haptic(12)
    const list = taken[today] ?? []
    doc.save({ ...doc.value, taken: { ...taken, [today]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] } })
  }

  if (doc.loading) return <Loading label="Loading your medicines…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Health" title="Medicines" lede="Your medicines and supplements with their times. You’ll get a reminder at each time until it’s ticked." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Panel title="Today">
            {items.filter((m) => m.active).length === 0 ? <Empty title="Add a medicine to start." /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.filter((m) => m.active).flatMap((m) => m.hours.map((h) => ({ m, h }))).sort((a, b) => a.h - b.h).map(({ m, h }) => {
                  const key = `${m.id}@${h}`
                  const done = todayTaken.has(key)
                  return (
                    <motion.button key={key} type="button" whileTap={{ scale: 0.96 }} onClick={() => toggle(key)} className={cn('flex items-center gap-3 rounded-2xl border p-3 text-left', done ? 'border-positive/50 bg-positive/10' : 'border-border bg-surface-2')}>
                      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', done ? 'bg-positive text-white' : 'bg-accent/15 text-accent')}>{done ? <Check className="h-5 w-5" /> : <PillIcon className="h-5 w-5" />}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-text">{m.name}</span>
                        <span className="block text-xs text-text-secondary">{label(h)}{m.dose ? ` · ${m.dose}` : ''}</span>
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title="This week">
            <div className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="w-32 truncate text-sm text-text">{m.name}</span>
                  <div className="flex flex-1 gap-1">
                    {week.map((d) => {
                      const n = (taken[d] ?? []).filter((k) => k.startsWith(`${m.id}@`)).length
                      return <span key={d} title={`${d}: ${n}/${m.hours.length}`} className={cn('h-6 flex-1 rounded', n >= m.hours.length ? 'bg-positive/60' : n ? 'bg-amber-500/50' : 'bg-surface-5')} />
                    })}
                  </div>
                  <button type="button" aria-label={`Remove ${m.name}`} onClick={() => doc.save({ ...doc.value, items: items.filter((x) => x.id !== m.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Add a medicine">
            <div className="space-y-3">
              <Field label="Name"><input className={inputCls} value={name} maxLength={60} placeholder="e.g. Vitamin D3" onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Dose"><input className={inputCls} value={dose} maxLength={40} placeholder="e.g. 1 tablet after food" onChange={(e) => setDose(e.target.value)} /></Field>
              <Field label="Times">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK.map((h) => <Pill key={h} active={hours.includes(h)} onClick={() => setHours(hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h].sort((a, b) => a - b))}>{label(h)}</Pill>)}
                </div>
              </Field>
              <AnimatePresence>
                <button type="button" disabled={!name.trim() || !hours.length} onClick={() => { doc.save({ ...doc.value, items: [...items, { id: newId(), name: name.trim(), dose: dose.trim(), hours, active: true }] }); setName(''); setDose(''); haptic(12) }} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </AnimatePresence>
            </div>
          </Panel>
          <Panel>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={doc.value.reminders} onChange={(e) => doc.save({ ...doc.value, reminders: e.target.checked })} className="h-4 w-4 accent-amber-500" />
              <BellRing className="h-4 w-4 text-accent" /> Phone reminders at each time (7 AM – 10 PM)
            </label>
          </Panel>
        </div>
      </div>
    </div>
  )
}
