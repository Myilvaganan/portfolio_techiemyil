import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Footprints, Moon, Smile } from 'lucide-react'
import { Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc, type MoodDay } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { monthGrid, shiftMonth } from '@/lib/growth/water'
import { netInr, todayStr } from '@/lib/journal'
import { fetchLogs, saveLog } from '@/lib/healthApi'
import type { DailyLog } from '@/lib/health'

// Sleep, mood and steps, made simple:
//   • Sleep is logged on the morning you wake up — "last night" goes on today's date.
//   • Steps belong to the day you walked them — log today's tonight, or yesterday's in the morning.
// A month calendar shows every day at a glance; tap a day to fill it in.

const FACES = ['', '😫', '😕', '😐', '🙂', '😄']
const EMPTY: MoodDay = { sleepH: 0, quality: 0, mood: 0, energy: 0, note: '' }
const HOURS = [5, 6, 6.5, 7, 7.5, 8, 9]
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const nice = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const sleepTone = (h: number) => (h >= 7 ? 'bg-emerald-500 text-white' : h >= 6 ? 'bg-amber-400 text-white' : h > 0 ? 'bg-rose-500 text-white' : '')
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function Faces({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" aria-pressed={value === n} onClick={() => onPick(n)} className={cn('flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border text-xl transition-transform', value === n ? 'scale-105 border-accent bg-accent/15' : 'border-border bg-surface-2 opacity-60')}>
          {FACES[n]}
        </button>
      ))}
    </div>
  )
}

/** A steps box that saves when you leave it. */
function StepsInput({ date, logs, onSave, label }: { date: string; logs: DailyLog[]; onSave: (date: string, steps: number | null) => void; label: string }) {
  const current = logs.find((l) => l.date === date)?.steps ?? null
  const [draft, setDraft] = useState(current != null ? String(current) : '')
  useEffect(() => setDraft(current != null ? String(current) : ''), [current, date])
  return (
    <label className="block">
      <span className="text-xs text-text-secondary">{label}</span>
      <input
        className={cn(inputCls, 'mt-1 font-mono')}
        inputMode="numeric"
        placeholder="e.g. 8500"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => {
          const n = draft ? Number(draft) : null
          if (n !== current) onSave(date, n)
        }}
      />
    </label>
  )
}

export function SleepMood() {
  const today = todayStr()
  const m = useMoney()
  const doc = useGrowthDoc('mood')
  const { data } = useSources(['trades', 'bank', 'card'])
  const [date, setDate] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLogs().then(setLogs).catch(() => {})
  }, [])

  const d = doc.value.days[date] ?? EMPTY
  const set = (patch: Partial<MoodDay>) => {
    haptic(6)
    doc.save({ days: { ...doc.value.days, [date]: { ...d, ...patch } } })
  }
  const saveSteps = async (day: string, steps: number | null) => {
    const prev = logs.find((l) => l.date === day)
    const log: DailyLog = { date: day, weight: prev?.weight ?? null, steps, waterL: prev?.waterL ?? null, sleepH: prev?.sleepH ?? null, note: prev?.note ?? '' }
    try {
      setLogs(await saveLog(log))
      haptic(10)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const insight = useMemo(() => {
    const pnlBy = new Map<string, number>()
    for (const t of data.trades ?? []) pnlBy.set(t.date, (pnlBy.get(t.date) ?? 0) + netInr(t))
    const logged = Object.entries(doc.value.days)
    const good = logged.filter(([dt, v]) => v.sleepH >= 7 && pnlBy.has(dt)).map(([dt]) => pnlBy.get(dt)!)
    const poor = logged.filter(([dt, v]) => v.sleepH > 0 && v.sleepH < 6.5 && pnlBy.has(dt)).map(([dt]) => pnlBy.get(dt)!)
    return { good: avg(good), poor: avg(poor), nGood: good.length, nPoor: poor.length }
  }, [doc.value.days, data.trades])

  const last7 = Array.from({ length: 7 }, (_, i) => shift(today, -i))
  const avgSleep = avg(last7.map((x) => doc.value.days[x]?.sleepH || 0).filter(Boolean))
  const avgSteps = avg(last7.map((x) => logs.find((l) => l.date === x)?.steps ?? 0).filter(Boolean))
  const lead = (() => {
    const first = monthGrid(month).find(Boolean)
    return first ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0
  })()

  if (doc.loading) return <Loading label="Loading…" />

  const isToday = date === today

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHero eyebrow="Health" title="Sleep, mood & steps" lede="Log last night’s sleep when you wake up, how you feel, and your steps. The calendar shows every day at a glance." />
      {(doc.error || error) && <Notice tone="bad">{doc.error || error}</Notice>}

      {/* How dates work, in one line */}
      <div className="flex items-start gap-2 rounded-2xl bg-sky-500/10 px-3 py-2.5 text-xs text-text">
        <Moon className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
        <span><b>Sleep goes on the day you wake up.</b> This morning, log last night’s sleep under today. <b>Steps go on the day you walked them</b> — log today’s tonight, or yesterday’s in the morning.</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Sleep (7 days)', value: avgSleep ? `${avgSleep.toFixed(1)} h` : '—', from: 'from-indigo-500', to: 'to-violet-500' },
          { label: 'Steps (7 days)', value: avgSteps ? Math.round(avgSteps).toLocaleString('en-IN') : '—', from: 'from-emerald-500', to: 'to-teal-500' },
          { label: 'P&L after 7h+ sleep', value: insight.good != null ? m.inr(insight.good) : '—', sub: `${insight.nGood} days`, from: 'from-sky-500', to: 'to-blue-600' },
          { label: 'P&L after < 6.5h', value: insight.poor != null ? m.inr(insight.poor) : '—', sub: `${insight.nPoor} days`, from: 'from-rose-500', to: 'to-pink-500' },
        ].map((x) => (
          <div key={x.label} className={cn('rounded-[20px] bg-gradient-to-br p-4 text-white shadow-lg', x.from, x.to)}>
            <p className="text-2xs font-semibold uppercase tracking-wider text-white/80">{x.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold">{x.value}</p>
            {x.sub && <p className="text-xs text-white/85">{x.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
        {/* The day */}
        <AnimatePresence mode="wait">
          <motion.div key={date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="min-w-0 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-2 py-1.5">
              <button type="button" aria-label="Previous day" onClick={() => setDate(shift(date, -1))} className="rounded-full p-2 text-text-secondary"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setDate(today)} className="text-center">
                <span className="block font-display text-base font-semibold text-text">{isToday ? 'Today' : date === shift(today, -1) ? 'Yesterday' : nice(date)}</span>
                <span className="block text-2xs text-text-secondary">{nice(date)}</span>
              </button>
              <button type="button" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shift(date, 1))} className="rounded-full p-2 text-text-secondary disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            </div>

            <Panel title={isToday ? '😴 Last night’s sleep' : `😴 Sleep (woke up ${nice(date)})`} hint={`The night of ${nice(shift(date, -1))} → ${nice(date)} morning`}>
              <div className="flex flex-wrap gap-1.5">
                {HOURS.map((h) => (
                  <button key={h} type="button" aria-pressed={d.sleepH === h} onClick={() => set({ sleepH: h })} className={cn('rounded-xl border px-3 py-2 font-mono text-sm font-semibold', d.sleepH === h ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-border bg-surface-2 text-text')}>
                    {h}h
                  </button>
                ))}
              </div>
              <input type="range" min={0} max={12} step={0.5} value={d.sleepH} onChange={(e) => set({ sleepH: Number(e.target.value) })} className="mt-3 w-full accent-indigo-500" aria-label="Hours slept" />
              <p className="text-center font-mono text-sm text-text">{d.sleepH ? `${d.sleepH} hours` : 'Not logged'}</p>
              <p className="mb-1 mt-3 text-xs text-text-secondary">How well did you sleep?</p>
              <Faces value={d.quality} onPick={(n) => set({ quality: n })} />
            </Panel>

            <Panel title={isToday ? '🙂 How you feel today' : '🙂 How you felt'} action={<Smile className="h-4 w-4 text-amber-500" />}>
              <p className="mb-1 text-xs text-text-secondary">Mood</p>
              <Faces value={d.mood} onPick={(n) => set({ mood: n })} />
              <p className="mb-1 mt-3 text-xs text-text-secondary">Energy</p>
              <Faces value={d.energy} onPick={(n) => set({ energy: n })} />
            </Panel>

            <Panel title="🚶 Steps" action={<Footprints className="h-4 w-4 text-emerald-500" />}>
              <div className="grid grid-cols-2 gap-3">
                <StepsInput date={date} logs={logs} onSave={(dt, n) => void saveSteps(dt, n)} label={isToday ? 'Today so far' : `Walked on ${nice(date)}`} />
                <StepsInput date={shift(date, -1)} logs={logs} onSave={(dt, n) => void saveSteps(dt, n)} label={`${isToday ? 'Yesterday' : nice(shift(date, -1))} (final)`} />
              </div>
              <p className="mt-2 text-2xs text-text-secondary">Copy the number from your phone’s step counter or watch. Saves when you leave the box.</p>
            </Panel>
          </motion.div>
        </AnimatePresence>

        {/* Calendar */}
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-2 text-text-secondary"><ChevronLeft className="h-5 w-5" /></button>
            <span className="font-display text-lg font-semibold text-text">{new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-2 text-text-secondary disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i} className="pb-1 text-2xs font-semibold text-text-secondary">{x}</span>)}
            {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
            {monthGrid(month).filter((x): x is string => !!x).map((x) => {
              const v = doc.value.days[x]
              const steps = logs.find((l) => l.date === x)?.steps
              const future = x > today
              return (
                <button key={x} type="button" disabled={future} onClick={() => { setDate(x); haptic(6) }} className={cn('flex min-h-[4rem] min-w-0 flex-col items-center gap-0.5 rounded-xl border p-1 transition-colors', x === date ? 'border-accent bg-accent/10' : 'border-transparent bg-surface-2', future && 'opacity-30')}>
                  <span className="text-2xs font-semibold text-text-secondary">{Number(x.slice(8))}</span>
                  {v?.sleepH ? <span className={cn('rounded-md px-1 font-mono text-[11px] font-bold', sleepTone(v.sleepH))}>{v.sleepH}h</span> : <span className="text-[11px] text-text-secondary/40">–</span>}
                  <span className="text-xs leading-none">{v?.mood ? FACES[v.mood] : ''}</span>
                  {steps ? <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">{(steps / 1000).toFixed(1)}k</span> : null}
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-2xs text-text-secondary">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> 7h+</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-400" /> 6–7h</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-500" /> under 6h</span>
            <span>· mood face · steps in thousands</span>
          </div>
        </Panel>
      </div>
    </div>
  )
}
