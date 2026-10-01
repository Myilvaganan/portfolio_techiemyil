import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BedDouble } from 'lucide-react'
import { Field, Loading, Notice, PageHero, Panel, Stat, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useMoney } from '@/lib/privacy'
import { useGrowthDoc, type MoodDay } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { lastDays } from '@/lib/growth/habits'
import { netInr, todayStr } from '@/lib/journal'

// Two taps a morning — sleep and mood — and after a few weeks the page shows how they line up with your trading and
// spending.

const FACES = ['', '😫', '😕', '😐', '🙂', '😄']
const EMPTY: MoodDay = { sleepH: 0, quality: 0, mood: 0, energy: 0, note: '' }

function Scale({ label, value, onPick }: { label: string; value: number; onPick: (n: number) => void }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-text-secondary">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onPick(n)} className={cn('flex h-11 flex-1 items-center justify-center rounded-xl border text-xl transition-transform', value === n ? 'scale-105 border-accent bg-accent/15' : 'border-border bg-surface-2 opacity-60')}>
            {FACES[n]}
          </button>
        ))}
      </div>
    </div>
  )
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export function SleepMood() {
  const today = todayStr()
  const m = useMoney()
  const doc = useGrowthDoc('mood')
  const { data } = useSources(['trades', 'bank', 'card'])
  const [date, setDate] = useState(today)
  const d = doc.value.days[date] ?? EMPTY
  const set = (patch: Partial<MoodDay>) => {
    haptic(6)
    doc.save({ days: { ...doc.value.days, [date]: { ...d, ...patch } } })
  }
  const days = useMemo(() => lastDays(today, 30), [today])

  const insight = useMemo(() => {
    const pnlBy = new Map<string, number>()
    for (const t of data.trades ?? []) pnlBy.set(t.date, (pnlBy.get(t.date) ?? 0) + netInr(t))
    const spendBy = new Map<string, number>()
    for (const t of [...(data.bank ?? []), ...(data.card ?? [])]) spendBy.set(t.date, (spendBy.get(t.date) ?? 0) + (t.debit || 0))
    const logged = Object.entries(doc.value.days)
    const goodSleep = logged.filter(([dt, v]) => v.sleepH >= 7 && pnlBy.has(dt)).map(([dt]) => pnlBy.get(dt)!)
    const poorSleep = logged.filter(([dt, v]) => v.sleepH > 0 && v.sleepH < 6.5 && pnlBy.has(dt)).map(([dt]) => pnlBy.get(dt)!)
    const lowMood = logged.filter(([dt, v]) => v.mood > 0 && v.mood <= 2 && spendBy.has(dt)).map(([dt]) => spendBy.get(dt)!)
    const okMood = logged.filter(([dt, v]) => v.mood >= 4 && spendBy.has(dt)).map(([dt]) => spendBy.get(dt)!)
    return { good: avg(goodSleep), poor: avg(poorSleep), nGood: goodSleep.length, nPoor: poorSleep.length, low: avg(lowMood), ok: avg(okMood) }
  }, [doc.value.days, data])

  const sleeps = days.map((x) => doc.value.days[x]?.sleepH || 0)
  const avgSleep = avg(sleeps.filter(Boolean))
  const avgMood = avg(days.map((x) => doc.value.days[x]?.mood || 0).filter(Boolean))

  if (doc.loading) return <Loading label="Loading…" />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow="Health" title="Sleep & Mood" lede="Log how you slept and how you feel each morning; see how it shows up in your trading and spending." />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Avg sleep (30d)" value={avgSleep ? `${avgSleep.toFixed(1)} h` : '—'} tone={avgSleep && avgSleep < 6.5 ? 'bad' : 'good'} />
        <Stat label="Avg mood (30d)" value={avgMood ? FACES[Math.round(avgMood)] : '—'} />
        <Stat label="P&L after 7h+ sleep" value={insight.good != null ? m.inr(insight.good) : '—'} sub={`${insight.nGood} trading days`} tone={insight.good != null && insight.good >= 0 ? 'good' : 'bad'} />
        <Stat label="P&L after < 6.5h" value={insight.poor != null ? m.inr(insight.poor) : '—'} sub={`${insight.nPoor} trading days`} tone={insight.poor != null && insight.poor >= 0 ? 'good' : 'bad'} />
      </div>
      {insight.low != null && insight.ok != null && (
        <Notice tone="info">On low-mood days you spend about {m.inr(insight.low)} a day, against {m.inr(insight.ok)} on good days.</Notice>
      )}
      <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Panel title="Log" action={<input type="date" className={cn(inputCls, 'w-auto py-1 text-xs')} max={today} value={date} onChange={(e) => setDate(e.target.value)} />}>
          <div className="space-y-4">
            <Field label={`Hours slept: ${d.sleepH || '—'}`}>
              <input type="range" min={0} max={12} step={0.5} value={d.sleepH} onChange={(e) => set({ sleepH: Number(e.target.value) })} className="w-full accent-amber-500" />
            </Field>
            <Scale label="Sleep quality" value={d.quality} onPick={(n) => set({ quality: n })} />
            <Scale label="Mood" value={d.mood} onPick={(n) => set({ mood: n })} />
            <Scale label="Energy" value={d.energy} onPick={(n) => set({ energy: n })} />
            <Field label="Note">
              <input className={inputCls} maxLength={200} defaultValue={d.note} key={date} onBlur={(e) => e.target.value !== d.note && set({ note: e.target.value })} placeholder="Anything worth remembering?" />
            </Field>
          </div>
        </Panel>
        <Panel title="Last 30 days" action={<BedDouble className="h-4 w-4 text-accent" />}>
          <div className="flex h-48 items-end gap-1">
            {days.map((x, i) => {
              const v = doc.value.days[x]
              const h = v?.sleepH || 0
              return (
                <button key={x} type="button" onClick={() => setDate(x)} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${x}: ${h}h`}>
                  <span className="text-[10px]">{v?.mood ? FACES[v.mood] : ''}</span>
                  <motion.span initial={{ height: 0 }} animate={{ height: `${(h / 12) * 100}%` }} transition={{ delay: i * 0.01 }} className={cn('w-full rounded-t', h >= 7 ? 'bg-positive/70' : h > 0 ? 'bg-amber-500/70' : 'bg-surface-5', x === date && 'ring-2 ring-accent')} />
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-text-secondary">Green: 7 hours or more. Tap a bar to edit that day.</p>
        </Panel>
      </div>
    </div>
  )
}
