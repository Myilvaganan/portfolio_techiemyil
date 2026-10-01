import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BellRing, ChevronLeft, ChevronRight, Droplets, Flame, GlassWater, Minus, Plus } from 'lucide-react'
import { Field, Loading, Notice, PageHero, Panel, Pill, Stat, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { defineStrings } from '@/lib/i18n'
import { useGrowthDoc, type WaterActivity } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { addWater, latestWeight, monthGrid, monthStats, shiftMonth, waterStreak, waterTarget } from '@/lib/growth/water'
import { todayStr } from '@/lib/journal'

const useS = defineStrings(
  {
    eyebrow: 'Health',
    title: 'Water',
    lede: 'Your daily water target from your weight, a tap per glass, a calendar of every day, and phone reminders when you fall behind.',
    loading: 'Loading your water log…',
    today: 'Today',
    of: (t: string) => `of ${t}`,
    left: (l: string) => `${l} to go`,
    done: 'Target reached — well done!',
    glass: (ml: number) => `+${ml} ml`,
    undo: 'Undo a glass',
    streak: 'Streak',
    days: (n: number) => `${n} day${n === 1 ? '' : 's'}`,
    onTarget: 'On target this month',
    avg: 'Average a day',
    avgSub: 'on days you logged',
    calendar: 'Daily track',
    calHint: 'Tap a day to see it. Full blue = target met.',
    target: 'Your target',
    targetHint: 'About 35 ml for every kg you weigh, plus extra for activity and heat.',
    weight: 'Weight (kg)',
    weightFromLog: (kg: number, d: string) => `From your Health log: ${kg} kg on ${d}. Type a number to override.`,
    weightNone: 'No weight in your Health log yet — enter it here.',
    activity: 'Activity',
    low: 'Light',
    moderate: 'Moderate',
    high: 'Active',
    hot: 'Hot weather / sweating a lot',
    custom: 'Custom target (ml)',
    customHint: 'Leave empty to use the weight-based target.',
    glassSize: 'Glass size (ml)',
    base: (kg: number) => `${kg} kg × 35 ml`,
    actX: 'Activity',
    hotX: 'Heat',
    recommended: 'Recommended',
    reminders: 'Phone reminders',
    remindersHint: 'Every two hours between these times, only when you’re behind pace — plus a last call in the evening. Turn on Notifications from your avatar menu.',
    remindOn: 'Remind me',
    from: 'From',
    to: 'Until',
    noTarget: 'Enter your weight below to get your target.',
  },
  {
    eyebrow: 'உடல்நலம்',
    title: 'தண்ணீர்',
    lede: 'உங்கள் எடையிலிருந்து தினசரி இலக்கு, ஒவ்வொரு கிளாஸுக்கும் ஒரு தட்டு, நாள்காட்டி, பின்தங்கும்போது நினைவூட்டல்.',
    loading: 'ஏற்றுகிறது…',
    today: 'இன்று',
    of: (t: string) => `${t} இல்`,
    left: (l: string) => `இன்னும் ${l}`,
    done: 'இலக்கை அடைந்தீர்கள்!',
    glass: (ml: number) => `+${ml} மி.லி`,
    undo: 'ஒரு கிளாஸைத் திரும்பப் பெறு',
    streak: 'தொடர்',
    days: (n: number) => `${n} நாள்`,
    onTarget: 'இம்மாதம் இலக்கில்',
    avg: 'தினசரி சராசரி',
    avgSub: 'பதிவு செய்த நாட்களில்',
    calendar: 'தினசரி பதிவு',
    calHint: 'ஒரு நாளைத் தட்டவும். முழு நீலம் = இலக்கு.',
    target: 'உங்கள் இலக்கு',
    targetHint: 'ஒவ்வொரு கிலோவுக்கும் சுமார் 35 மி.லி, செயல்பாடு, வெப்பத்துக்குக் கூடுதல்.',
    weight: 'எடை (கிலோ)',
    weightFromLog: (kg: number, d: string) => `உடல்நலப் பதிவிலிருந்து: ${kg} கிலோ (${d}).`,
    weightNone: 'உடல்நலப் பதிவில் எடை இல்லை — இங்கே உள்ளிடவும்.',
    activity: 'செயல்பாடு',
    low: 'குறைவு',
    moderate: 'மிதமான',
    high: 'அதிகம்',
    hot: 'வெப்பமான நாள் / அதிக வியர்வை',
    custom: 'தனிப்பயன் இலக்கு (மி.லி)',
    customHint: 'எடை அடிப்படையிலான இலக்குக்குக் காலியாக விடவும்.',
    glassSize: 'கிளாஸ் அளவு (மி.லி)',
    base: (kg: number) => `${kg} கிலோ × 35 மி.லி`,
    actX: 'செயல்பாடு',
    hotX: 'வெப்பம்',
    recommended: 'பரிந்துரை',
    reminders: 'தொலைபேசி நினைவூட்டல்',
    remindersHint: 'இந்த நேரங்களுக்கிடையே இரண்டு மணிக்கு ஒருமுறை, பின்தங்கினால் மட்டும்.',
    remindOn: 'நினைவூட்டு',
    from: 'முதல்',
    to: 'வரை',
    noTarget: 'இலக்கைப் பெற உங்கள் எடையை உள்ளிடவும்.',
  },
)

const L = (ml: number) => `${(ml / 1000).toFixed(ml % 100 ? 2 : 1)} L`
const hourLabel = (h: number) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`

/** A glass that fills as the day goes on. */
function WaterRing({ pct }: { pct: number }) {
  const r = 70
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90">
      <circle cx="80" cy="80" r={r} fill="none" strokeWidth="12" className="stroke-surface-10" />
      <motion.circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        strokeWidth="12"
        strokeLinecap="round"
        stroke="url(#water-grad)"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }}
        transition={{ type: 'spring', stiffness: 80, damping: 18 }}
      />
      <defs>
        <linearGradient id="water-grad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Water() {
  const s = useS()
  const doc = useGrowthDoc('water')
  const { data } = useSources(['health'])
  const today = todayStr()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [picked, setPicked] = useState(today)
  const w = doc.value
  const logWeight = useMemo(() => latestWeight(data.health ?? []), [data.health])
  const t = waterTarget(w, logWeight?.kg ?? null)
  const target = t?.target ?? 0

  // Keep the saved target in step so the server's reminders use the same number as this page.
  useEffect(() => {
    if (!doc.loading && !doc.saving && target && target !== w.targetMl) doc.save({ ...w, targetMl: target })
  }, [doc, target, w])

  const drunk = w.logs[today] || 0
  const streak = waterStreak(w, today, target)
  const stats = monthStats(w, month, today, target)
  const add = (ml: number) => {
    haptic(ml > 0 ? 12 : 6)
    doc.save(addWater(w, today, ml))
  }
  const set = (patch: Partial<typeof w>) => doc.save({ ...w, ...patch })

  if (doc.loading) return <Loading label={s.loading} />

  return (
    <div className="w-full space-y-5">
      <PageHero eyebrow={s.eyebrow} title={s.title} lede={s.lede} />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {/* Today */}
          <Panel>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-8">
              <div className="relative grid place-items-center">
                <WaterRing pct={target ? drunk / target : 0} />
                <div className="absolute text-center">
                  <Droplets className="mx-auto h-5 w-5 text-sky-400" />
                  <p className="mt-1 font-mono text-2xl font-semibold text-text">{L(drunk)}</p>
                  <p className="text-xs text-text-secondary">{target ? s.of(L(target)) : '—'}</p>
                </div>
              </div>
              <div className="w-full flex-1 space-y-3">
                <p className="label-caps">{s.today}</p>
                <p className={cn('text-sm', target && drunk >= target ? 'font-semibold text-positive' : 'text-text-secondary')}>
                  {!target ? s.noTarget : drunk >= target ? s.done : s.left(L(target - drunk))}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[w.glassMl, 500, 1000].map((ml) => (
                    <motion.button
                      key={ml}
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => add(ml)}
                      className="flex flex-col items-center gap-1 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-2 py-3 text-sm font-semibold text-sky-500 dark:text-sky-300"
                    >
                      <GlassWater className="h-5 w-5" />
                      {s.glass(ml)}
                    </motion.button>
                  ))}
                </div>
                <button type="button" disabled={!drunk} onClick={() => add(-w.glassMl)} className="inline-flex items-center gap-1 text-xs text-text-secondary disabled:opacity-40">
                  <Minus className="h-3.5 w-3.5" /> {s.undo}
                </button>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-3 gap-3">
            <Stat label={s.streak} value={<span className="inline-flex items-center gap-1"><Flame className="h-5 w-5" />{streak}</span>} sub={s.days(streak)} tone={streak ? 'gold' : 'neutral'} />
            <Stat label={s.onTarget} value={`${stats.met}/${stats.days}`} tone={stats.met ? 'good' : 'neutral'} />
            <Stat label={s.avg} value={stats.avg ? L(Math.round(stats.avg / 10) * 10) : '—'} sub={s.avgSub} />
          </div>

          {/* Calendar */}
          <Panel
            title={s.calendar}
            hint={s.calHint}
            action={
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-lg p-1.5 text-text-secondary hover:text-text">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[7rem] text-center text-sm font-medium text-text">
                  {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-lg p-1.5 text-text-secondary hover:text-text disabled:opacity-30">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-7 gap-1.5 text-center text-2xs text-text-secondary">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
              {monthGrid(month).map((d, i) => {
                if (!d) return <span key={`b${i}`} />
                const ml = w.logs[d] || 0
                const pct = target ? Math.min(1, ml / target) : 0
                const future = d > today
                return (
                  <motion.button
                    key={d}
                    type="button"
                    disabled={future}
                    onClick={() => setPicked(d)}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.008 }}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-xl border text-xs font-medium',
                      future ? 'border-transparent text-text-secondary/30' : 'border-border text-text',
                      d === picked && 'ring-2 ring-sky-400',
                      d === today && 'border-sky-400/60',
                    )}
                    title={`${d}: ${L(ml)}`}
                  >
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-blue-600/80 to-sky-400/60 transition-all" style={{ height: `${pct * 100}%` }} />
                    <span className={cn('relative', pct >= 1 && 'text-white')}>{Number(d.slice(8))}</span>
                  </motion.button>
                )
              })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="text-text-secondary">{new Date(`${picked}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="flex items-center gap-2 font-mono text-text">
                {picked !== today && (
                  <button type="button" aria-label="Less" onClick={() => doc.save(addWater(w, picked, -w.glassMl))} className="rounded-lg border border-border p-1">
                    <Minus className="h-3 w-3" />
                  </button>
                )}
                {L(w.logs[picked] || 0)}
                {target ? <span className="text-text-secondary"> / {L(target)}</span> : null}
                {picked !== today && (
                  <button type="button" aria-label="More" onClick={() => doc.save(addWater(w, picked, w.glassMl))} className="rounded-lg border border-border p-1">
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </span>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title={s.target} hint={s.targetHint}>
            {t && t.weightKg > 0 && (
              <div className="mb-4 space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
                <Row label={s.base(t.weightKg)} value={L(Math.round(t.base))} />
                <Row label={s.actX} value={`+ ${L(t.activity)}`} />
                {t.hot > 0 && <Row label={s.hotX} value={`+ ${L(t.hot)}`} />}
                <div className="border-t border-border pt-1.5">
                  <Row label={s.recommended} value={L(t.recommended)} strong />
                </div>
              </div>
            )}
            <div className="space-y-3">
              <Field label={s.weight} hint={logWeight ? s.weightFromLog(logWeight.kg, logWeight.date) : s.weightNone}>
                <NumberInput value={w.weightKg} placeholder={logWeight ? String(logWeight.kg) : '70'} onCommit={(v) => set({ weightKg: v })} max={400} />
              </Field>
              <Field label={s.activity}>
                <div className="flex flex-wrap gap-2">
                  {(['low', 'moderate', 'high'] as WaterActivity[]).map((a) => (
                    <Pill key={a} active={w.activity === a} onClick={() => set({ activity: a })}>
                      {s[a]}
                    </Pill>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={w.hot} onChange={(e) => set({ hot: e.target.checked })} className="h-4 w-4 accent-sky-500" /> {s.hot}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label={s.custom} hint={s.customHint}>
                  <NumberInput value={w.customMl} placeholder={t ? String(t.recommended) : ''} onCommit={(v) => set({ customMl: Math.round(v) })} max={10000} />
                </Field>
                <Field label={s.glassSize}>
                  <NumberInput value={w.glassMl} placeholder="250" onCommit={(v) => set({ glassMl: Math.round(v) || 250 })} max={2000} />
                </Field>
              </div>
            </div>
          </Panel>

          <Panel title={s.reminders} hint={s.remindersHint} action={<BellRing className="h-4 w-4 text-sky-400" />}>
            <label className="mb-3 flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={w.reminders} onChange={(e) => set({ reminders: e.target.checked })} className="h-4 w-4 accent-sky-500" /> {s.remindOn}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label={s.from}>
                <select className={inputCls} value={w.startHour} disabled={!w.reminders} onChange={(e) => set({ startHour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => h).filter((h) => h < w.endHour).map((h) => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              </Field>
              <Field label={s.to}>
                <select className={inputCls} value={w.endHour} disabled={!w.reminders} onChange={(e) => set({ endHour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => h).filter((h) => h > w.startHour).map((h) => (
                    <option key={h} value={h}>{hourLabel(h)}</option>
                  ))}
                </select>
              </Field>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong ? 'font-semibold text-text' : 'text-text-secondary')}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

/** Saves on blur, so typing doesn't write on every keystroke. */
function NumberInput({ value, placeholder, onCommit, max }: { value: number; placeholder: string; onCommit: (v: number) => void; max: number }) {
  const [draft, setDraft] = useState(value ? String(value) : '')
  useEffect(() => setDraft(value ? String(value) : ''), [value])
  return (
    <input
      className={inputCls}
      inputMode="decimal"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        const n = Math.min(max, Number(draft) || 0)
        if (n !== value) onCommit(n)
      }}
    />
  )
}

