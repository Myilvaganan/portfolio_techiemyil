import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, ChevronLeft, ChevronRight, Flame, Loader2, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { Empty, Field, Loading, Notice, PageHero, Panel, Pill, inputCls } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { estimateFood, useGrowthDoc, type FoodEntry, type FoodItem, type FoodProfile, type Meal } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { latestWeight } from '@/lib/growth/water'
import { lastDays } from '@/lib/growth/habits'
import { todayStr } from '@/lib/journal'
import { ACTIVITY, MEALS, dayTotals, insights, logStreak, targets, topFoods } from '@/lib/calories'

// Type what you ate or snap a photo; the AI splits it into items with calories and macros, you check and save. The
// dashboard tracks the day against your target and points out patterns over the last weeks.

const MEAL_TONE: Record<Meal, string> = { breakfast: 'border-l-amber-400 bg-gradient-to-r from-amber-500/10 to-transparent', lunch: 'border-l-emerald-500 bg-gradient-to-r from-emerald-500/10 to-transparent', dinner: 'border-l-indigo-500 bg-gradient-to-r from-indigo-500/10 to-transparent', snack: 'border-l-pink-500 bg-gradient-to-r from-pink-500/10 to-transparent' }
const MEAL_ROW: Record<Meal, string> = { breakfast: 'bg-amber-500/10', lunch: 'bg-emerald-500/10', dinner: 'bg-indigo-500/10', snack: 'bg-pink-500/10' }
const MEAL_BAR: Record<Meal, string> = { breakfast: 'bg-amber-400', lunch: 'bg-emerald-500', dinner: 'bg-indigo-500', snack: 'bg-pink-500' }

const newId = () => Math.random().toString(36).slice(2, 10)
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const mealNow = (): Meal => {
  const h = new Date().getHours()
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'
}

function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => reject(new Error('That file is not an image.'))
    img.src = url
  })
}

function Ring({ value, target }: { value: number; target: number }) {
  const r = 78
  const c = 2 * Math.PI * r
  const pct = target ? value / target : 0
  const over = pct > 1
  return (
    <div className="relative grid place-items-center">
      <svg viewBox="0 0 180 180" className="h-48 w-48 -rotate-90">
        <circle cx="90" cy="90" r={r} fill="none" strokeWidth="14" className="stroke-surface-5" />
        <motion.circle cx="90" cy="90" r={r} fill="none" strokeWidth="14" strokeLinecap="round" stroke={over ? 'rgb(239 68 68)' : 'url(#kcal-grad)'} strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, pct)) }} transition={{ type: 'spring', stiffness: 70, damping: 18 }} />
        <defs>
          <linearGradient id="kcal-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#f6e2a8" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <Flame className={cn('mx-auto h-5 w-5', over ? 'text-error' : 'text-orange-400')} />
        <p className="font-mono text-3xl font-semibold text-text">{Math.round(value)}</p>
        <p className="text-xs text-text-secondary">{target ? (over ? `${Math.round(value - target)} over` : `${Math.round(target - value)} left`) : 'kcal'}</p>
      </div>
    </div>
  )
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-text-secondary">{label}</span><span className="font-mono text-text">{Math.round(value)}{target ? ` / ${target}` : ''} g</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-5">
        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${target ? Math.min(100, (value / target) * 100) : 0}%` }} />
      </div>
    </div>
  )
}

export function Calories() {
  const doc = useGrowthDoc('food')
  const { data } = useSources(['health'])
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [meal, setMeal] = useState<Meal>(mealNow())
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<FoodItem[] | null>(null)
  const [setup, setSetup] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { profile, entries } = doc.value
  const logWeight = latestWeight(data.health ?? [])?.kg ?? 0
  const t = targets(profile, logWeight)
  const day = dayTotals(entries, date)
  const last30 = useMemo(() => lastDays(today, 30), [today])
  const last14 = last30.slice(-14)
  const tips = useMemo(() => insights(entries, last14, t), [entries, last14, t])
  const top = useMemo(() => topFoods(entries, new Set(last30)), [entries, last30])
  const streak = logStreak(entries, today)
  const loggedDays = last30.filter((d) => entries.some((e) => e.date === d))
  const avg7 = (() => {
    const ds = last30.slice(-7).filter((d) => entries.some((e) => e.date === d))
    return ds.length ? ds.reduce((s, d) => s + dayTotals(entries, d).kcal, 0) / ds.length : 0
  })()
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: FoodEntry[] = []
    for (const e of [...entries].reverse()) {
      const k = e.name.toLowerCase()
      if (!seen.has(k)) {
        seen.add(k)
        out.push(e)
      }
      if (out.length >= 8) break
    }
    return out
  }, [entries])

  async function estimate() {
    setBusy(true)
    setError(null)
    try {
      const r = await estimateFood({ text: text.trim() || undefined, image: photo ?? undefined })
      setDraft(r.items)
      haptic(15)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function saveDraft() {
    if (!draft) return
    doc.save({ ...doc.value, entries: [...entries, ...draft.map((i) => ({ ...i, id: newId(), date, meal }))] })
    setDraft(null)
    setText('')
    setPhoto(null)
    haptic(20)
  }

  const setProfile = (patch: Partial<FoodProfile>) => doc.save({ ...doc.value, profile: { ...profile, ...patch } })

  if (doc.loading) return <Loading label="Loading your food log…" />

  const needsSetup = !t

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHero eyebrow="Health" title="Calories" lede="Type what you ate or snap a photo — the AI works out calories and macros. Your day against your target, and what to improve." />
      {(error || doc.error) && <Notice tone="bad">{error || doc.error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Daily target', value: t ? `${t.kcal}` : '—', unit: 'kcal', sub: t?.tdee ? `Maintenance ${t.tdee}` : 'Set up below', from: 'from-orange-500', to: 'to-amber-400', emoji: '🎯' },
          { label: '7-day average', value: avg7 ? `${Math.round(avg7)}` : '—', unit: 'kcal', sub: t && avg7 ? (avg7 > t.kcal * 1.05 ? 'Above target' : avg7 < t.kcal * 0.9 ? 'Below target' : 'On target') : '', from: 'from-emerald-500', to: 'to-teal-400', emoji: '📈' },
          { label: 'Logging streak', value: String(streak), unit: streak === 1 ? 'day' : 'days', sub: streak >= 7 ? 'Great consistency' : 'Log every meal', from: 'from-pink-500', to: 'to-rose-400', emoji: '🔥' },
          { label: 'Days logged', value: String(loggedDays.length), unit: '/ 30', sub: 'Last 30 days', from: 'from-violet-500', to: 'to-indigo-400', emoji: '🗓️' },
        ].map((x, i) => (
          <motion.div key={x.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn('relative overflow-hidden rounded-[20px] bg-gradient-to-br p-4 text-white shadow-lg', x.from, x.to)}>
            <span className="absolute -right-2 -top-2 text-5xl opacity-25" aria-hidden>{x.emoji}</span>
            <p className="text-2xs font-semibold uppercase tracking-wider text-white/80">{x.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold">{x.value} <span className="text-sm font-medium text-white/80">{x.unit}</span></p>
            {x.sub && <p className="mt-0.5 text-xs text-white/85">{x.sub}</p>}
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 space-y-4">
          {/* The day */}
          <Panel>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" aria-label="Previous day" onClick={() => setDate(shift(date, -1))} className="rounded-full p-2 text-text-secondary hover:text-text"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setDate(today)} className="font-display text-base font-semibold text-text">
                {date === today ? 'Today' : new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </button>
              <button type="button" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shift(date, 1))} className="rounded-full p-2 text-text-secondary hover:text-text disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Ring value={day.kcal} target={t?.kcal ?? 0} />
              <div className="w-full flex-1 space-y-3">
                <Macro label="Protein" value={day.protein} target={t?.protein ?? 0} color="#3b82f6" />
                <Macro label="Carbs" value={day.carbs} target={t?.carbs ?? 0} color="#f59e0b" />
                <Macro label="Fat" value={day.fat} target={t?.fat ?? 0} color="#ec4899" />
                <Macro label="Fibre" value={day.fiber} target={t?.fiber ?? 0} color="#10b981" />
              </div>
            </div>
            {day.kcal > 0 && (
              <div className="mt-4">
                <div className="flex h-3 overflow-hidden rounded-full">
                  {MEALS.map((m) => day.byMeal[m.id] > 0 && <motion.span key={m.id} initial={{ width: 0 }} animate={{ width: `${(day.byMeal[m.id] / day.kcal) * 100}%` }} className={MEAL_BAR[m.id]} title={`${m.label}: ${Math.round(day.byMeal[m.id])} kcal`} />)}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-text-secondary">
                  {MEALS.map((m) => <span key={m.id} className="flex items-center gap-1"><span className={cn('h-2 w-2 rounded-full', MEAL_BAR[m.id])} />{m.label} {Math.round(day.byMeal[m.id])}</span>)}
                </div>
              </div>
            )}
          </Panel>

          {/* Meals */}
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.date === date && e.meal === m.id)
            return (
              <Panel key={m.id} title={`${m.emoji} ${m.label}`} hint={list.length ? `${Math.round(day.byMeal[m.id])} kcal` : undefined} className={cn('border-l-4', MEAL_TONE[m.id])}>
                {list.length === 0 ? <p className="text-sm text-text-secondary">Nothing logged.</p> : (
                  <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                      {list.map((e) => (
                        <motion.li key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 30 }} className={cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm', MEAL_ROW[e.meal])}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-text">{e.name}</span>
                            <span className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
                              {e.qty && <span className="mr-1">{e.qty}</span>}
                              <span className="rounded-full bg-blue-500/15 px-1.5 text-blue-500">P {Math.round(e.protein)}</span>
                              <span className="rounded-full bg-amber-500/15 px-1.5 text-amber-600 dark:text-amber-400">C {Math.round(e.carbs)}</span>
                              <span className="rounded-full bg-pink-500/15 px-1.5 text-pink-500">F {Math.round(e.fat)}</span>
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 font-mono text-sm font-semibold text-orange-500">{Math.round(e.kcal)}</span>
                          <button type="button" aria-label={`Remove ${e.name}`} onClick={() => doc.save({ ...doc.value, entries: entries.filter((x) => x.id !== e.id) })} className="p-1 text-text-secondary hover:text-error"><Trash2 className="h-3.5 w-3.5" /></button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </Panel>
            )
          })}

          {/* 30-day trend */}
          <Panel title="Last 30 days" hint="Calories per day against your target">
            <div className="relative flex h-40 items-end gap-[3px]">
              {t && <span className="absolute inset-x-0 border-t border-dashed border-accent/60" style={{ bottom: `${(t.kcal / Math.max(t.kcal * 1.4, ...last30.map((d) => dayTotals(entries, d).kcal))) * 100}%` }} />}
              {last30.map((d, i) => {
                const k = dayTotals(entries, d).kcal
                const max = Math.max((t?.kcal ?? 2000) * 1.4, ...last30.map((x) => dayTotals(entries, x).kcal))
                return (
                  <button key={d} type="button" title={`${d}: ${Math.round(k)} kcal`} onClick={() => setDate(d)} className="flex h-full flex-1 items-end">
                    <motion.span initial={{ height: 0 }} animate={{ height: `${(k / max) * 100}%` }} transition={{ delay: i * 0.01 }} className={cn('w-full rounded-t', !k ? 'bg-surface-5' : t && k > t.kcal * 1.1 ? 'bg-error/70' : t && k < t.kcal * 0.7 ? 'bg-sky-400/60' : 'bg-positive/70', d === date && 'ring-2 ring-accent')} />
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-text-secondary">Green: near target · red: 10%+ over · blue: well under. Dashed line: target.</p>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          {/* Add food */}
          <Panel title="Add food" action={<Sparkles className="h-4 w-4 text-accent" />}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {MEALS.map((m) => <Pill key={m.id} active={meal === m.id} onClick={() => setMeal(m.id)}>{m.emoji} {m.label}</Pill>)}
              </div>
              <textarea className={cn(inputCls, 'min-h-[4.5rem]')} value={text} maxLength={500} placeholder="e.g. 3 idli, sambar, coconut chutney and a filter coffee" onChange={(e) => setText(e.target.value)} />
              {photo && (
                <div className="relative">
                  <img src={photo} alt="Your meal" className="max-h-48 w-full rounded-xl object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text"><Camera className="h-4 w-4" /> Photo</button>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void shrink(f).then(setPhoto).catch((err) => setError(err.message)) }} />
                <button type="button" disabled={busy || (!text.trim() && !photo)} onClick={() => void estimate()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#0b0a09] disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {busy ? 'Working it out…' : 'Estimate'}
                </button>
              </div>

              {draft && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-2xl border border-accent/40 bg-accent/5 p-3">
                  <p className="text-xs font-semibold text-text-secondary">Check and adjust, then add:</p>
                  {draft.map((i, k) => (
                    <div key={k} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-2">
                      <span className="min-w-0">
                        <input className="w-full bg-transparent text-sm text-text outline-none" value={i.name} onChange={(e) => setDraft(draft.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
                        <input className="w-full bg-transparent text-xs text-text-secondary outline-none" value={i.qty} onChange={(e) => setDraft(draft.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} />
                      </span>
                      <input inputMode="numeric" aria-label="kcal" className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1 text-right font-mono text-sm text-text" value={Math.round(i.kcal)} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, '')) || 0; const f = i.kcal ? n / i.kcal : 1; setDraft(draft.map((x, j) => (j === k ? { ...x, kcal: n, protein: x.protein * f, carbs: x.carbs * f, fat: x.fat * f, fiber: x.fiber * f } : x))) }} />
                      <button type="button" aria-label="Remove" onClick={() => setDraft(draft.filter((_, j) => j !== k))} className="p-1 text-text-secondary hover:text-error"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="font-mono text-sm text-text">{Math.round(draft.reduce((s, i) => s + i.kcal, 0))} kcal</span>
                    <button type="button" disabled={!draft.length} onClick={saveDraft} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-[#0b0a09]"><Plus className="h-4 w-4" /> Add to {MEALS.find((m) => m.id === meal)!.label.toLowerCase()}</button>
                  </div>
                </motion.div>
              )}

              {recent.length > 0 && !draft && (
                <div>
                  <p className="mb-1.5 text-xs text-text-secondary">Quick add</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((e) => (
                      <button key={e.id} type="button" onClick={() => { haptic(10); doc.save({ ...doc.value, entries: [...entries, { ...e, id: newId(), date, meal }] }) }} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text hover:border-accent/50">
                        {e.name} · {Math.round(e.kcal)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {tips.length > 0 && (
            <Panel title="Insights" hint="From the last 14 days">
              <ul className="space-y-2">
                {tips.map((x) => <li key={x.text} className={cn('rounded-xl px-3 py-2 text-sm', x.tone === 'good' ? 'border-l-4 border-emerald-500 bg-emerald-500/10 text-text' : x.tone === 'warn' ? 'border-l-4 border-amber-500 bg-amber-500/10 text-text' : 'border-l-4 border-sky-500 bg-sky-500/10 text-text')}>{x.text}</li>)}
              </ul>
            </Panel>
          )}

          {top.length > 0 && (
            <Panel title="Biggest calorie sources" hint="Last 30 days">
              <ul className="space-y-1.5 text-sm">
                {top.map((f) => <li key={f.name} className="flex justify-between gap-2"><span className="truncate capitalize text-text">{f.name}</span><span className="shrink-0 font-mono text-text-secondary">{Math.round(f.kcal)} kcal · {f.times}×</span></li>)}
              </ul>
            </Panel>
          )}

          <Panel title="Your target" hint={t ? `BMR ${t.bmr} kcal · ${ACTIVITY[profile.activity].label}` : 'Fill these in to get your daily target.'} action={<button type="button" onClick={() => setSetup(!setup)} className="text-xs text-accent">{setup || needsSetup ? 'Hide' : 'Edit'}</button>}>
            {(setup || needsSetup) ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sex">
                  <select className={inputCls} value={profile.sex} onChange={(e) => setProfile({ sex: e.target.value as FoodProfile['sex'] })}><option value="male">Male</option><option value="female">Female</option></select>
                </Field>
                <Field label="Age"><input className={inputCls} inputMode="numeric" defaultValue={profile.age || ''} onBlur={(e) => setProfile({ age: Number(e.target.value) || 0 })} /></Field>
                <Field label="Height (cm)"><input className={inputCls} inputMode="numeric" defaultValue={profile.heightCm || ''} onBlur={(e) => setProfile({ heightCm: Number(e.target.value) || 0 })} /></Field>
                <Field label="Weight (kg)" hint={logWeight && !profile.weightKg ? `Using ${logWeight} kg from Health` : undefined}><input className={inputCls} inputMode="decimal" defaultValue={profile.weightKg || ''} placeholder={logWeight ? String(logWeight) : ''} onBlur={(e) => setProfile({ weightKg: Number(e.target.value) || 0 })} /></Field>
                <div className="col-span-2">
                  <Field label="Activity">
                    <select className={inputCls} value={profile.activity} onChange={(e) => setProfile({ activity: e.target.value as FoodProfile['activity'] })}>
                      {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-span-2 flex flex-wrap gap-1.5">
                  {(['lose', 'maintain', 'gain'] as const).map((g) => <Pill key={g} active={profile.goal === g} onClick={() => setProfile({ goal: g })}>{g === 'lose' ? 'Lose weight' : g === 'gain' ? 'Gain muscle' : 'Maintain'}</Pill>)}
                </div>
                <div className="col-span-2"><Field label="Custom daily target (optional)"><input className={inputCls} inputMode="numeric" defaultValue={profile.customKcal || ''} placeholder={t ? String(t.kcal) : ''} onBlur={(e) => setProfile({ customKcal: Number(e.target.value) || 0 })} /></Field></div>
              </div>
            ) : t ? (
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                {[['kcal', t.kcal], ['Protein', `${t.protein} g`], ['Carbs', `${t.carbs} g`], ['Fat', `${t.fat} g`]].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface-2 py-2"><p className="font-mono font-semibold text-text">{v}</p><p className="text-2xs text-text-secondary">{l}</p></div>
                ))}
              </div>
            ) : <Empty title="Set your details above." />}
          </Panel>
        </div>
      </div>
    </div>
  )
}
