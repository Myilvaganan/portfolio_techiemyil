import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, ChevronLeft, ChevronRight, MapPin, Moon, Sparkles, Star, Sun, Sunrise, Sunset } from 'lucide-react'
import { Field, Loading, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { FestiveIcon, ICON_TONE } from '@/components/calendar/FestiveIcon'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc } from '@/lib/growthApi'
import { todayStr } from '@/lib/journal'
import { monthGrid, shiftMonth } from '@/lib/growth/water'
import { NAKSHATRA, PLACES, RASI, TAMIL_WEEKDAY, dayDivisions, istTime, karanaAt, nakshatraAt, nallaNeram, tithiAt, yogaAt, type Slot } from '@/lib/panchang/core'
import { dayFacts, isAvoidDay, motivationFor, rasiPalan, specialsFor, type DayFacts, type Special } from '@/lib/panchang/days'
import { placeOf } from '@/lib/panchang/note'

const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** Facts and specials for every day in a month view (plus a day either side, for "first day of" rules). */
function useMonth(month: string, placeName: string) {
  return useMemo(() => {
    const place = placeOf(placeName)
    const days = monthGrid(month).filter((d): d is string => !!d)
    const all = [shift(days[0], -1), ...days, shift(days[days.length - 1], 1)].map((d) => dayFacts(d, place))
    const map = new Map<string, { facts: DayFacts; specials: Special[] }>()
    for (let i = 1; i < all.length - 1; i++) map.set(all[i].date, { facts: all[i], specials: specialsFor(all[i], all[i - 1], all[i + 1]) })
    return map
  }, [month, placeName])
}

function TimeRow({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
        {icon}
        {label}
      </span>
      <span className={cn('min-w-0 text-right font-mono text-sm [overflow-wrap:anywhere]', tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-error' : 'text-text')}>{value}</span>
    </div>
  )
}

/** The daylight hours as one bar: good windows green, Rahu / Yama / Kuligai red, a marker at the current time. */
function DayBar({ sunrise, sunset, good, bad }: { sunrise: Date; sunset: Date; good: Slot[]; bad: Slot[] }) {
  const span = sunset.getTime() - sunrise.getTime()
  const pos = (d: Date) => `${Math.max(0, Math.min(100, ((d.getTime() - sunrise.getTime()) / span) * 100))}%`
  const width = (s: Slot) => `${((s.end.getTime() - s.start.getTime()) / span) * 100}%`
  const now = new Date()
  const showNow = now > sunrise && now < sunset
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-surface-5">
        {good.map((s) => (
          <motion.span key={`g${s.start.getTime()}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-y-0 bg-positive/60" style={{ left: pos(s.start), width: width(s) }} title={`${s.name} ${istTime(s.start)}–${istTime(s.end)}`} />
        ))}
        {bad.map((s) => (
          <motion.span key={`b${s.name}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-y-0 bg-error/70" style={{ left: pos(s.start), width: width(s) }} title={`${s.name} ${istTime(s.start)}–${istTime(s.end)}`} />
        ))}
        {showNow && <span className="absolute inset-y-[-2px] w-0.5 rounded bg-text" style={{ left: pos(now) }} />}
      </div>
      <div className="mt-1 flex justify-between text-2xs text-text-secondary">
        <span>{istTime(sunrise)}</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-positive/70" /> good</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-error/70" /> avoid</span>
        </span>
        <span>{istTime(sunset)}</span>
      </div>
    </div>
  )
}

export function TamilCalendar() {
  const [params] = useSearchParams()
  const today = todayStr()
  const [picked, setPicked] = useState(params.get('date') || today)
  const [month, setMonth] = useState(picked.slice(0, 7))
  const settings = useGrowthDoc('calendar')
  const s = settings.value
  const place = placeOf(s.place)
  const monthMap = useMonth(month, s.place)
  const grid = monthGrid(month)

  const detail = useMemo(() => {
    const div = dayDivisions(picked, place)
    const at = div.sunrise
    const facts = monthMap.get(picked)?.facts ?? dayFacts(picked, place)
    const specials = monthMap.get(picked)?.specials ?? specialsFor(facts, dayFacts(shift(picked, -1), place), dayFacts(shift(picked, 1), place))
    return { div, facts, specials, tithi: tithiAt(at), star: nakshatraAt(at), yoga: yogaAt(at), karana: karanaAt(at), good: nallaNeram(div) }
  }, [picked, place, monthMap])

  if (settings.loading) return <Loading label="Reading the stars…" />

  const { div, facts, specials, tithi, star, yoga, karana, good } = detail
  const palan = s.rasi >= 0 ? rasiPalan(s.rasi, s.star, facts) : null
  const firstTamil = monthMap.get(grid.find(Boolean)!)?.facts.tamil
  const lastTamil = monthMap.get([...grid].reverse().find(Boolean)!)?.facts.tamil
  const pick = (d: string) => {
    haptic(6)
    setPicked(d)
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      <PageHero eyebrow="Tamil · English" title="Calendar" lede="Panchangam for every day: Tamil date, thithi, star, yogam, karanam, the good and bad hours, festivals and your daily rasi palan." />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Month */}
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full p-2 text-text-secondary hover:text-text">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => { setMonth(today.slice(0, 7)); pick(today) }} className="text-center">
              <span className="block font-display text-lg font-semibold text-text">{new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
              {firstTamil && lastTamil && (
                <span className="block text-xs text-accent">
                  {firstTamil.monthTa}{firstTamil.month !== lastTamil.month ? ` – ${lastTamil.monthTa}` : ''} · {firstTamil.year}
                </span>
              )}
            </button>
            <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full p-2 text-text-secondary hover:text-text">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center sm:gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
              <span key={d} className={cn('pb-1 text-2xs font-semibold', i === 0 ? 'text-error' : 'text-text-secondary')}>{d}</span>
            ))}
            {/* monthGrid starts the week on Monday; this calendar starts on Sunday like Tamil daily sheets. */}
            {(() => {
              const days = grid.filter((d): d is string => !!d)
              const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay()
              return [...Array(lead).fill(null), ...days]
            })().map((d, i) => {
              if (!d) return <span key={`b${i}`} />
              const info = monthMap.get(d)
              const main = info?.specials[0]
              const isPicked = d === picked
              const t = info?.facts.tithi
              return (
                <motion.button
                  key={d}
                  type="button"
                  onClick={() => pick(d)}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    'relative flex min-h-[3.4rem] min-w-0 flex-col items-center justify-start gap-0.5 overflow-hidden rounded-xl border px-0 pb-1 pt-1.5 transition-colors',
                    isPicked ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-surface-3',
                    d === today && !isPicked && 'border-accent/50',
                    main?.major && !isPicked && 'bg-amber-500/10',
                  )}
                >
                  <span className={cn('text-sm font-semibold leading-none', new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? 'text-error' : 'text-text')}>{Number(d.slice(8))}</span>
                  <span className="text-[9px] leading-none text-text-secondary">{info?.facts.tamil.day}</span>
                  {main ? (
                    <FestiveIcon kind={main.icon} className={cn('mt-0.5 h-4 w-4 sm:h-5 sm:w-5', ICON_TONE[main.icon])} />
                  ) : t === 14 ? (
                    <FestiveIcon kind="fullMoon" className="mt-0.5 h-4 w-4 text-sky-400" />
                  ) : null}
                  {info && info.specials.length > 1 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
                </motion.button>
              )
            })}
          </div>

          {/* This month's festivals, as a list */}
          <div className="mt-4 space-y-1.5 border-t border-border pt-3">
            {[...monthMap.entries()].filter(([, v]) => v.specials.length).map(([d, v]) => (
              <button key={d} type="button" onClick={() => pick(d)} className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface-3', d === picked && 'bg-surface-3')}>
                <span className="w-10 shrink-0 text-center">
                  <span className="block font-mono text-sm font-semibold text-text">{Number(d.slice(8))}</span>
                  <span className="block text-2xs text-text-secondary">{new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })}</span>
                </span>
                <FestiveIcon kind={v.specials[0].icon} className={cn('h-6 w-6 shrink-0', ICON_TONE[v.specials[0].icon])} />
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  {v.specials.map((x) => x.name).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {/* The picked day */}
        <AnimatePresence mode="wait">
          <motion.div key={picked} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="space-y-4">
            <Panel>
              <div className="flex items-start gap-4">
                <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#f6e2a8] via-[#d6b36a] to-[#8a6526] text-[#0b0a09] shadow-lg">
                  <span className="text-3xl font-bold leading-none">{Number(picked.slice(8))}</span>
                  <span className="mt-1 text-2xs font-semibold uppercase">{new Date(`${picked}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-text-secondary">{longDate(picked)}</p>
                  <p className="font-display text-2xl text-text">
                    {facts.tamil.monthTa} {facts.tamil.day}
                  </p>
                  <p className="text-sm text-accent">
                    {facts.tamil.monthName} {facts.tamil.day} · {TAMIL_WEEKDAY[div.weekday]} · {facts.tamil.year} varudam
                  </p>
                </div>
              </div>
              {specials.length > 0 && (
                <div className="mt-4 space-y-2">
                  {specials.map((x) => (
                    <motion.div key={x.key} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('flex items-center gap-3 rounded-2xl border p-3', x.major ? 'border-amber-500/40 bg-amber-500/10' : 'border-border bg-surface-2')}>
                      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card', ICON_TONE[x.icon])}>
                        <FestiveIcon kind={x.icon} className="h-9 w-9" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-text">{x.name}</span>
                        <span className="block text-sm text-text-secondary">{x.ta}{x.note ? ` · ${x.note}` : ''}</span>
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
              {isAvoidDay(facts) && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{facts.tithi % 15 === 7 ? 'Ashtami' : 'Navami'} — traditionally avoided for new beginnings.</p>}
            </Panel>

            <Panel title="Panchangam">
              <div className="divide-y divide-border">
                <TimeRow icon={<Moon className="h-4 w-4" />} label={`Thithi · ${tithi.paksha}`} value={`${tithi.name} till ${istTime(tithi.ends)}`} />
                <TimeRow icon={<Star className="h-4 w-4" />} label="Nakshatram" value={`${star.name} (${star.ta}) till ${istTime(star.ends)}`} />
                <TimeRow icon={<Sparkles className="h-4 w-4" />} label="Yogam" value={`${yoga.name} till ${istTime(yoga.ends)}`} />
                <TimeRow icon={<Sparkles className="h-4 w-4" />} label="Karanam" value={`${karana.name} till ${istTime(karana.ends)}`} />
                <TimeRow icon={<Moon className="h-4 w-4" />} label="Moon in" value={`${RASI[facts.moonRasi][0]} (${RASI[facts.moonRasi][1]})`} />
                <TimeRow icon={<Sunrise className="h-4 w-4" />} label="Sunrise" value={istTime(div.sunrise)} />
                <TimeRow icon={<Sunset className="h-4 w-4" />} label="Sunset" value={istTime(div.sunset)} />
              </div>
            </Panel>

            <Panel title="Good & bad times" hint={`For ${place.name}. Nalla neram avoids Rahu kalam and Yamagandam.`}>
              <DayBar sunrise={div.sunrise} sunset={div.sunset} good={good} bad={[div.rahu, div.yama, div.kuligai]} />
              <div className="mt-3 divide-y divide-border">
                {good.map((g) => (
                  <TimeRow key={g.start.getTime()} icon={<Sun className="h-4 w-4 text-positive" />} label="Nalla neram" value={`${istTime(g.start)} – ${istTime(g.end)}`} tone="good" />
                ))}
                {div.abhijit && <TimeRow icon={<Sun className="h-4 w-4 text-positive" />} label="Abhijit muhurtham" value={`${istTime(div.abhijit.start)} – ${istTime(div.abhijit.end)}`} tone="good" />}
                {[div.rahu, div.yama, div.kuligai].map((b) => (
                  <TimeRow key={b.name} icon={<Moon className="h-4 w-4 text-error" />} label={b.name} value={`${istTime(b.start)} – ${istTime(b.end)}`} tone="bad" />
                ))}
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-text-secondary">Gowri panchangam (daytime)</summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {div.gowri.map((g) => (
                    <span key={g.start.getTime()} className={cn('flex justify-between rounded-lg px-2 py-1 text-xs', g.good ? 'bg-positive/10 text-positive' : 'bg-error/10 text-error')}>
                      <span>{g.name}</span>
                      <span className="font-mono">{istTime(g.start)}</span>
                    </span>
                  ))}
                </div>
              </details>
            </Panel>

            <Panel title="Your rasi palan" hint={palan ? `${RASI[s.rasi][0]} rasi${s.star >= 0 ? ` · ${NAKSHATRA[s.star][0]}` : ''}` : 'Set your rasi below to see it.'}>
              {palan ? (
                <div className={cn('rounded-2xl p-3', palan.chandrashtamam ? 'bg-error/10' : 'bg-surface-2')}>
                  <p className="text-lg tracking-widest text-accent" aria-label={`${palan.score} of 5`}>{'★'.repeat(palan.score)}<span className="text-text-secondary/30">{'★'.repeat(5 - palan.score)}</span></p>
                  {palan.chandrashtamam && <p className="mt-1 text-sm font-semibold text-error">Chandrashtamam today</p>}
                  <p className="mt-1 text-sm text-text">{palan.line}</p>
                </div>
              ) : null}
              <p className="mt-3 rounded-2xl border border-accent/30 bg-accent/5 p-3 text-sm italic text-text">“{motivationFor(picked)}”</p>
            </Panel>
          </motion.div>
        </AnimatePresence>
      </div>

      <Panel title="Settings" hint="Your place sets sunrise and the times; your rasi and star set the daily palan.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Place">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <select className={`${inputCls} pl-9`} value={s.place} onChange={(e) => settings.save({ ...s, place: e.target.value })}>
                {PLACES.map((p) => <option key={p.name}>{p.name}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Your rasi">
            <select className={inputCls} value={s.rasi} onChange={(e) => settings.save({ ...s, rasi: Number(e.target.value) })}>
              <option value={-1}>Not set</option>
              {RASI.map((r, i) => <option key={r[0]} value={i}>{r[0]} · {r[1]}</option>)}
            </select>
          </Field>
          <Field label="Your star">
            <select className={inputCls} value={s.star} onChange={(e) => settings.save({ ...s, star: Number(e.target.value) })}>
              <option value={-1}>Not set</option>
              {NAKSHATRA.map((n, i) => <option key={n[0]} value={i}>{n[0]} · {n[1]}</option>)}
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-text">
            <input type="checkbox" checked={s.notify} onChange={(e) => settings.save({ ...s, notify: e.target.checked })} className="h-4 w-4 accent-amber-500" />
            <BellRing className="h-4 w-4 text-accent" /> 7 AM daily note
          </label>
        </div>
      </Panel>
    </div>
  )
}
