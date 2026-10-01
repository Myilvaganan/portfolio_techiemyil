import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Moon, Sun, Sunrise, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useMoney } from '@/lib/privacy'
import { useProfile } from '@/lib/profile'
import { useGrowthDoc } from '@/lib/growthApi'
import { useSources } from '@/lib/growth/sources'
import { netInr, todayStr } from '@/lib/journal'
import { dayTotals } from '@/lib/calories'
import { FestiveIcon, ICON_TONE } from '@/components/calendar/FestiveIcon'
import { dayDivisions, istTime, nallaNeram, RASI } from '@/lib/panchang/core'
import { dayFacts, motivationFor, rasiPalan, specialsFor } from '@/lib/panchang/days'
import { placeOf } from '@/lib/panchang/note'

// The first time the app opens each day: a blessing, a Tamil verse with its meaning, how yesterday went, and what
// today holds — palan, good time, festival. Shown once a day; "Start my day" closes it.

const SEEN_KEY = 'admin-morning-brief'
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Thirukkural couplets and Bharathiyar lines (public domain), each with a plain English meaning. */
const VERSES: { ta: string; en: string; by: string }[] = [
  { ta: 'தெய்வத்தான் ஆகா தெனினும் முயற்சிதன்\nமெய்வருத்தக் கூலி தரும்', en: 'Even when fate does not allow it, sincere effort always pays its wage.', by: 'திருக்குறள் 619' },
  { ta: 'வெள்ளத் தனைய மலர்நீட்டம் மாந்தர்தம்\nஉள்ளத் தனையது உயர்வு', en: 'As the lotus stem rises with the water, a person rises with the height of their spirit.', by: 'திருக்குறள் 595' },
  { ta: 'இடுக்கண் வருங்கால் நகுக அதனை\nஅடுத்தூர்வது அஃதொப்ப தில்', en: 'When troubles come, smile at them; nothing defeats trouble like a smile.', by: 'திருக்குறள் 621' },
  { ta: 'உள்ளுவ தெல்லாம் உயர்வுள்ளல் மற்றது\nதள்ளினுந் தள்ளாமை நீர்த்து', en: 'Let every thought be lofty; even if it fails, it is never wasted.', by: 'திருக்குறள் 596' },
  { ta: 'முயற்சி திருவினை ஆக்கும் முயற்றின்மை\nஇன்மை புகுத்தி விடும்', en: 'Effort brings prosperity; the lack of it brings want.', by: 'திருக்குறள் 616' },
  { ta: 'கற்க கசடறக் கற்பவை கற்றபின்\nநிற்க அதற்குத் தக', en: 'Learn thoroughly what is worth learning, and then live by it.', by: 'திருக்குறள் 391' },
  { ta: 'மனதில் உறுதி வேண்டும்,\nவாக்கினிலே இனிமை வேண்டும்', en: 'Let the mind be firm, and the words be sweet.', by: 'பாரதியார்' },
  { ta: 'அச்சமில்லை அச்சமில்லை\nஅச்சமென்பதில்லையே', en: 'No fear, no fear — there is no such thing as fear.', by: 'பாரதியார்' },
  { ta: 'ஒளி படைத்த கண்ணினாய் வா வா வா', en: 'Come, you with eyes full of light — come forward.', by: 'பாரதியார்' },
]

const BLESSINGS = [
  'May today be calm, clear and kind to you.',
  'A blessed morning — one good decision at a time.',
  'Fresh day, fresh light. Make it gentle and strong.',
  'May your work be steady and your heart be light today.',
  'Breathe in. Today is a new page — write it well.',
]

const pick = <T,>(list: T[], date: string, salt = 0) => list[(Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000) + salt) % list.length]

function seenToday(today: string) {
  try {
    return localStorage.getItem(SEEN_KEY) === today
  } catch {
    return false
  }
}

export function MorningBrief() {
  const today = todayStr()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const m = useMoney()
  const { firstName } = useProfile()
  const { data } = useSources(['trades'])
  const cal = useGrowthDoc('calendar')
  const tasks = useGrowthDoc('tasks')
  const habits = useGrowthDoc('habits')
  const water = useGrowthDoc('water')
  const food = useGrowthDoc('food')
  const mood = useGrowthDoc('mood')

  useEffect(() => {
    if (seenToday(today)) return
    const t = window.setTimeout(() => {
      setOpen(true)
      haptic(20)
    }, 1200)
    return () => window.clearTimeout(t)
  }, [today])

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, today)
    } catch {
      // Shown again next open; harmless.
    }
    setOpen(false)
  }

  const sky = useMemo(() => {
    const place = placeOf(cal.value.place)
    const f = dayFacts(today, place)
    const div = dayDivisions(today, place)
    return { f, div, specials: specialsFor(f, dayFacts(shift(today, -1), place), dayFacts(shift(today, 1), place)), good: nallaNeram(div) }
  }, [today, cal.value.place])
  const palan = cal.value.rasi >= 0 ? rasiPalan(cal.value.rasi, cal.value.star, sky.f) : null

  const y = shift(today, -1)
  const yTrades = (data.trades ?? []).filter((t) => t.date === y)
  const yPnl = yTrades.reduce((s, t) => s + netInr(t), 0)
  const yTasks = tasks.value.tasks.filter((t) => t.done && t.doneOn === y).length
  const yHabits = (habits.value.checks[y] ?? []).length
  const habitCount = habits.value.habits.filter((h) => !h.auto).length
  const wTarget = water.value.customMl || water.value.targetMl
  const yWater = water.value.logs[y] || 0
  const yKcal = dayTotals(food.value.entries, y).kcal
  const ySleep = mood.value.days[today]?.sleepH || mood.value.days[y]?.sleepH || 0
  const rows = [
    yTrades.length > 0 && { label: 'Trading', value: m.signed(yPnl), tone: yPnl >= 0 ? 'text-positive' : 'text-error', sub: `${yTrades.length} trades` },
    yTasks > 0 && { label: 'Tasks done', value: String(yTasks) },
    habitCount > 0 && { label: 'Habits', value: `${yHabits}/${habitCount}` },
    wTarget > 0 && { label: 'Water', value: `${(yWater / 1000).toFixed(1)} L`, tone: yWater >= wTarget ? 'text-positive' : undefined },
    yKcal > 0 && { label: 'Calories', value: `${Math.round(yKcal)}` },
    ySleep > 0 && { label: 'Sleep', value: `${ySleep} h` },
  ].filter(Boolean) as { label: string; value: string; tone?: string; sub?: string }[]

  const verse = pick(VERSES, today)
  const hour = new Date().getHours()
  const Greet = hour < 12 ? Sunrise : hour < 17 ? Sun : Moon
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const tamilGreeting = hour < 12 ? 'காலை வணக்கம்' : hour < 17 ? 'மதிய வணக்கம்' : 'மாலை வணக்கம்'

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/60" onClick={close} />
          <motion.div
            key="brief"
            role="dialog"
            aria-label="Your morning brief"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%', transition: { duration: 0.22, ease: [0.3, 0, 0.8, 0.15] } }}
            transition={{ duration: 0.45, ease: [0.05, 0.7, 0.1, 1] }}
            className="fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[88dvh] max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] border-t border-border bg-card pb-[calc(1.25rem+var(--inset-bottom,0px))] sm:bottom-6 sm:rounded-[28px] sm:border"
          >
            {/* Header: a warm gradient with the greeting */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 px-5 pb-6 pt-5 text-white">
              <span className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/15" aria-hidden />
              <span className="absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-white/10" aria-hidden />
              <button type="button" aria-label="Close" onClick={close} className="absolute right-3 top-3 rounded-full bg-black/15 p-1.5"><X className="h-4 w-4" /></button>
              <motion.span initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }} className="inline-flex">
                <Greet className="h-9 w-9" />
              </motion.span>
              <p className="mt-2 text-sm font-medium text-white/90">{tamilGreeting} 🙏</p>
              <p className="font-display text-2xl font-semibold">{greeting}, {firstName}</p>
              <p className="mt-1 text-sm text-white/90">{pick(BLESSINGS, today, 3)}</p>
              <p className="mt-2 text-xs text-white/80">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} · {sky.f.tamil.monthTa} {sky.f.tamil.day}</p>
            </div>

            <div className="space-y-4 px-5 pt-4">
              {/* Verse */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-2xl border-l-4 border-amber-500 bg-amber-500/10 p-3.5">
                <p className="whitespace-pre-line text-[15px] font-semibold leading-relaxed text-text">{verse.ta}</p>
                <p className="mt-1.5 text-sm italic text-text-secondary">{verse.en}</p>
                <p className="mt-1 text-2xs font-semibold text-amber-600 dark:text-amber-400">— {verse.by}</p>
              </motion.div>

              {/* Today */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
                {sky.specials.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sky.specials.map((x) => (
                      <span key={x.key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 text-xs text-text">
                        <FestiveIcon kind={x.icon} className={cn('h-4 w-4', ICON_TONE[x.icon])} /> {x.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-positive/10 p-2.5"><p className="text-text-secondary">Good time</p><p className="font-mono font-semibold text-positive">{sky.good[0] ? `${istTime(sky.good[0].start)}–${istTime(sky.good[0].end)}` : '—'}</p></div>
                  <div className="rounded-xl bg-error/10 p-2.5"><p className="text-text-secondary">Rahu kalam</p><p className="font-mono font-semibold text-error">{istTime(sky.div.rahu.start)}–{istTime(sky.div.rahu.end)}</p></div>
                </div>
                {palan && (
                  <div className={cn('rounded-xl p-3 text-sm', palan.chandrashtamam ? 'bg-error/10' : 'bg-violet-500/10')}>
                    <p className="flex items-center justify-between font-semibold text-text"><span>{RASI[palan.rasi][1]} · {RASI[palan.rasi][0]}</span><span className="tracking-widest text-amber-500">{'★'.repeat(palan.score)}</span></p>
                    <p className="mt-1 text-text-secondary">{palan.line}</p>
                  </div>
                )}
              </motion.div>

              {/* Yesterday */}
              {rows.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-text-secondary">Yesterday</p>
                  <div className="grid grid-cols-3 gap-2">
                    {rows.map((r) => (
                      <div key={r.label} className="rounded-xl bg-surface-2 p-2.5 text-center">
                        <p className={cn('font-mono text-base font-semibold text-text', r.tone)}>{r.value}</p>
                        <p className="text-2xs text-text-secondary">{r.label}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              <p className="text-center text-sm italic text-text-secondary">“{motivationFor(today)}”</p>

              <button type="button" onClick={() => { close(); navigate('/today') }} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-[0.98]">
                Start my day <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
