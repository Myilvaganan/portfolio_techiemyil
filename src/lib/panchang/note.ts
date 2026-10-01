import { PLACES, dayDivisions, istTime, nakshatraAt, nallaNeram, tithiAt, type Place } from './core'
import { dayFacts, motivationFor, rasiPalan, specialsFor } from './days'

export interface CalendarSettings {
  place: string
  /** Birth rasi 0..11, or -1 when not set. */
  rasi: number
  /** Birth star 0..26, or -1. */
  star: number
  notify: boolean
}

export const placeOf = (name: string): Place => PLACES.find((p) => p.name === name) ?? PLACES[0]
const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/** The morning notification: the day, anything special, the times to use and avoid, your palan and a line to go with. */
export function dailyNote(date: string, s: CalendarSettings) {
  const place = placeOf(s.place)
  const f = dayFacts(date, place)
  const specials = specialsFor(f, dayFacts(shift(date, -1), place), dayFacts(shift(date, 1), place))
  const div = dayDivisions(date, place)
  const t = tithiAt(div.sunrise)
  const n = nakshatraAt(div.sunrise)
  const good = nallaNeram(div).map((g) => `${istTime(g.start)}–${istTime(g.end)}`).join(', ')
  const palan = s.rasi >= 0 ? rasiPalan(s.rasi, s.star, f) : null
  const head = specials.length ? specials.map((x) => x.name).join(' · ') : `${f.tamil.monthName} ${f.tamil.day}`
  const lines = [
    `${f.tamil.monthName} ${f.tamil.day} · ${t.name} till ${istTime(t.ends)} · ${n.name} star`,
    `Rahu ${istTime(div.rahu.start)}–${istTime(div.rahu.end)} · Yama ${istTime(div.yama.start)}–${istTime(div.yama.end)}`,
    good && `Good time: ${good}`,
    palan && `${palan.chandrashtamam ? '⚠️ ' : ''}${'★'.repeat(palan.score)} ${palan.line}`,
    `“${motivationFor(date)}”`,
  ].filter(Boolean)
  return { tag: `calendar-${date}`, title: `🪔 ${head}`, body: lines.join('\n'), url: `/tamil-calendar?date=${date}` }
}

/** The Tamil month and the Moon's star at sunrise, for star-based (natchathiram) birthdays. */
export function starToday(date: string, placeName = 'Chennai') {
  const f = dayFacts(date, placeOf(placeName))
  return { tamilMonth: f.tamil.month, star: f.star }
}
