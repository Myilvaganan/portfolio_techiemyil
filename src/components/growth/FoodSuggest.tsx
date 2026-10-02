import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChefHat, Clock, IndianRupee, Leaf, Loader2, Plus, Sparkles } from 'lucide-react'
import { Panel, Pill } from '@/components/growth/kit'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { suggestFood, type FoodEntry, type FoodPlan, type FoodProfile, type FoodSuggestion } from '@/lib/growthApi'
import { dayTotals, type Targets } from '@/lib/calories'
import { lastDays } from '@/lib/growth/habits'

// "What should I eat?": the AI looks at today's target, what's been eaten, what's left and the last two weeks, then
// suggests easy South Indian dishes from an ordinary market — with the reasoning, macros, cooking time and cost — and
// an analysis of the day from every angle. Each suggestion adds to the log in one tap.

const VEG_KEY = 'admin-food-veg'
const MEAL_TINT: Record<string, string> = { breakfast: 'from-amber-500/15', lunch: 'from-emerald-500/15', dinner: 'from-indigo-500/15', snack: 'from-pink-500/15' }

export function FoodSuggest({ entries, profile, t, date, onAdd }: { entries: FoodEntry[]; profile: FoodProfile; t: Targets | null; date: string; onAdd: (s: FoodSuggestion) => void }) {
  const [veg, setVeg] = useState(() => {
    try {
      return localStorage.getItem(VEG_KEY) === '1'
    } catch {
      return false
    }
  })
  const [plan, setPlan] = useState<FoodPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())

  async function ask() {
    setBusy(true)
    setError(null)
    setAdded(new Set())
    const day = dayTotals(entries, date)
    const days14 = lastDays(date, 14).filter((d) => d !== date && entries.some((e) => e.date === d))
    const tot = days14.map((d) => dayTotals(entries, d))
    const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber') => (tot.length ? Math.round(tot.reduce((s, x) => s + x[k], 0) / tot.length) : null)
    const r = (n: number) => Math.round(n)
    try {
      const p = await suggestFood({
        now: new Date().toLocaleString('en-IN', { weekday: 'long', hour: 'numeric', minute: '2-digit' }),
        goal: profile.goal,
        veg,
        target: t ? { kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber } : null,
        eaten: { kcal: r(day.kcal), protein: r(day.protein), carbs: r(day.carbs), fat: r(day.fat), fiber: r(day.fiber), byMeal: day.byMeal },
        remaining: t ? { kcal: r(t.kcal - day.kcal), protein: r(t.protein - day.protein), carbs: r(t.carbs - day.carbs), fat: r(t.fat - day.fat), fiber: r(t.fiber - day.fiber) } : null,
        items: entries.filter((e) => e.date === date).map((e) => `${e.meal}: ${e.name} (${e.qty}) ${r(e.kcal)} kcal`),
        recent: tot.length ? { daysLogged: tot.length, avgKcal: avg('kcal'), avgProtein: avg('protein'), avgCarbs: avg('carbs'), avgFat: avg('fat'), avgFibre: avg('fiber') } : null,
      })
      setPlan(p)
      haptic(15)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ANALYSIS: [keyof FoodPlan['analysis'], string, string][] = [
    ['calories', 'Calories', 'border-orange-500'],
    ['protein', 'Protein', 'border-blue-500'],
    ['carbs', 'Carbs', 'border-amber-500'],
    ['fat', 'Fat', 'border-pink-500'],
    ['fibre', 'Fibre', 'border-emerald-500'],
    ['timing', 'Meal timing', 'border-violet-500'],
    ['health', 'Health', 'border-rose-500'],
  ]

  return (
    <Panel title="What should I eat?" hint="AI suggestions to hit today’s goal — South Indian, market-available, easy to cook." action={<Sparkles className="h-4 w-4 text-accent" />}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill active={!veg} onClick={() => { setVeg(false); try { localStorage.setItem(VEG_KEY, '0') } catch { /* ignore */ } }}>🍗 Non-veg ok</Pill>
        <Pill active={veg} onClick={() => { setVeg(true); try { localStorage.setItem(VEG_KEY, '1') } catch { /* ignore */ } }}>🥬 Vegetarian</Pill>
      </div>
      <button type="button" disabled={busy} onClick={() => void ask()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98] disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChefHat className="h-4 w-4" />} {busy ? 'Planning your next meals…' : plan ? 'Suggest again' : 'Suggest my next meals'}
      </button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}

      <AnimatePresence>
        {plan && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
            {/* Analysis from every angle */}
            <div className="rounded-2xl bg-gradient-to-br from-violet-500/15 to-transparent p-3">
              <p className="text-sm font-semibold text-text">{plan.analysis.summary}</p>
              <div className="mt-2 space-y-1.5">
                {ANALYSIS.map(([k, label, border]) => (
                  <p key={k} className={cn('border-l-2 pl-2 text-xs text-text-secondary', border)}>
                    <span className="font-semibold text-text">{label}:</span> {plan.analysis[k]}
                  </p>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            <div className="space-y-2">
              {plan.suggestions.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={cn('depth rounded-2xl border border-border bg-gradient-to-r to-transparent p-3', MEAL_TINT[s.meal])}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-text-secondary">{s.meal}{s.veg ? ' · veg' : ''}</p>
                      <p className="font-semibold text-text">{s.name}</p>
                      <p className="text-xs text-text-secondary">{s.qty}</p>
                    </div>
                    <button type="button" disabled={added.has(i)} onClick={() => { onAdd(s); setAdded(new Set(added).add(i)); haptic(15) }} className={cn('flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold', added.has(i) ? 'bg-positive/15 text-positive' : 'bg-accent text-[#0b0a09]')}>
                      {added.has(i) ? 'Added' : (<><Plus className="h-3.5 w-3.5" /> Add</>)}
                    </button>
                  </div>
                  <p className="mt-1.5 text-sm text-text">{s.why}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-2xs">
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-500">{Math.round(s.kcal)} kcal</span>
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-500">P {Math.round(s.protein)}g</span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-600 dark:text-amber-400">C {Math.round(s.carbs)}g</span>
                    <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-pink-500">F {Math.round(s.fat)}g</span>
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-600 dark:text-emerald-400">Fibre {Math.round(s.fiber)}g</span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-3 px-2 py-0.5 text-text-secondary"><Clock className="h-3 w-3" />{Math.round(s.cookMinutes)} min</span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-surface-3 px-2 py-0.5 text-text-secondary"><IndianRupee className="h-3 w-3" />{Math.round(s.costInr)}</span>
                  </div>
                  {s.ingredients.length > 0 && <p className="mt-1.5 flex items-start gap-1 text-xs text-text-secondary"><Leaf className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />{s.ingredients.join(', ')}</p>}
                </motion.div>
              ))}
            </div>

            {plan.tips.length > 0 && (
              <ul className="space-y-1.5">
                {plan.tips.map((tip) => <li key={tip} className="rounded-xl border-l-4 border-sky-500 bg-sky-500/10 px-3 py-2 text-xs text-text">{tip}</li>)}
              </ul>
            )}
            <p className="text-2xs text-text-secondary">Suggestions are estimates from AI, not medical advice. If you have a condition (diabetes, BP, kidney), follow your doctor’s diet.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}
