import * as A from 'astronomy-engine'

// Tamil panchangam from first principles: the Sun's and Moon's sidereal (Lahiri) longitudes give the tithi, nakshatra,
// yogam and karanam; the Sun's sidereal sign gives the Tamil month; sunrise and sunset give the day's time divisions.
// Everything is computed for a place (latitude/longitude) in Indian Standard Time.

export const IST_OFFSET_MIN = 330

export interface Place {
  name: string
  lat: number
  lon: number
}

export const PLACES: Place[] = [
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Salem', lat: 11.6643, lon: 78.146 },
  { name: 'Coimbatore', lat: 11.0168, lon: 76.9558 },
  { name: 'Madurai', lat: 9.9252, lon: 78.1198 },
  { name: 'Tiruchirappalli', lat: 10.7905, lon: 78.7047 },
  { name: 'Tirunelveli', lat: 8.7139, lon: 77.7567 },
  { name: 'Puducherry', lat: 11.9416, lon: 79.8083 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Delhi', lat: 28.6139, lon: 77.209 },
]

const mod = (x: number, m: number) => ((x % m) + m) % m

/** Lahiri ayanamsa in degrees (linear fit, good to a few arc-seconds for this century). */
export function ayanamsa(date: Date) {
  const years = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000)
  return 23.85305 + 0.013969 * years
}

export const sunSid = (d: Date) => mod(A.SunPosition(d).elon - ayanamsa(d), 360)
export const moonSid = (d: Date) => mod(A.EclipticGeoMoon(d).lon - ayanamsa(d), 360)

// ---------- Names ----------

export const TITHI = [
  ['Prathamai', 'பிரதமை'], ['Dwitiyai', 'துவிதியை'], ['Tritiyai', 'திருதியை'], ['Chathurthi', 'சதுர்த்தி'], ['Panchami', 'பஞ்சமி'],
  ['Sashti', 'சஷ்டி'], ['Sapthami', 'சப்தமி'], ['Ashtami', 'அஷ்டமி'], ['Navami', 'நவமி'], ['Dasami', 'தசமி'],
  ['Ekadasi', 'ஏகாதசி'], ['Dwadasi', 'துவாதசி'], ['Thrayodasi', 'திரயோதசி'], ['Chathurdasi', 'சதுர்த்தசி'],
] as const
export const NAKSHATRA = [
  ['Ashwini', 'அசுவினி'], ['Bharani', 'பரணி'], ['Karthigai', 'கார்த்திகை'], ['Rohini', 'ரோகிணி'], ['Mirugasirisham', 'மிருகசீரிடம்'],
  ['Thiruvathirai', 'திருவாதிரை'], ['Punarpoosam', 'புனர்பூசம்'], ['Poosam', 'பூசம்'], ['Ayilyam', 'ஆயில்யம்'], ['Magam', 'மகம்'],
  ['Pooram', 'பூரம்'], ['Uthiram', 'உத்திரம்'], ['Hastham', 'அஸ்தம்'], ['Chithirai', 'சித்திரை'], ['Swathi', 'சுவாதி'],
  ['Visakam', 'விசாகம்'], ['Anusham', 'அனுஷம்'], ['Kettai', 'கேட்டை'], ['Moolam', 'மூலம்'], ['Pooradam', 'பூராடம்'],
  ['Uthiradam', 'உத்திராடம்'], ['Thiruvonam', 'திருவோணம்'], ['Avittam', 'அவிட்டம்'], ['Sathayam', 'சதயம்'], ['Poorattathi', 'பூரட்டாதி'],
  ['Uthirattathi', 'உத்திரட்டாதி'], ['Revathi', 'ரேவதி'],
] as const
export const YOGA = [
  'Vishkambam', 'Preethi', 'Ayushman', 'Saubhagyam', 'Sobhanam', 'Athigandam', 'Sukarmam', 'Dhriti', 'Soolam', 'Gandam', 'Vriddhi',
  'Dhruvam', 'Vyaghatam', 'Harshanam', 'Vajram', 'Siddhi', 'Vyatipatam', 'Variyan', 'Parigam', 'Sivam', 'Siddham', 'Sadhyam', 'Subham',
  'Subram', 'Brahmam', 'Indram', 'Vaidhruti',
]
const KARANA_MOVING = ['Bavam', 'Balavam', 'Kaulavam', 'Thaithulam', 'Garasai', 'Vanasai', 'Bhadrai']
/** Rasi (sidereal sign) names; the Tamil month is named for the sign the Sun is in. */
export const RASI = [
  ['Mesham', 'மேஷம்'], ['Rishabam', 'ரிஷபம்'], ['Mithunam', 'மிதுனம்'], ['Kadagam', 'கடகம்'], ['Simmam', 'சிம்மம்'], ['Kanni', 'கன்னி'],
  ['Thulam', 'துலாம்'], ['Viruchigam', 'விருச்சிகம்'], ['Dhanusu', 'தனுசு'], ['Magaram', 'மகரம்'], ['Kumbam', 'கும்பம்'], ['Meenam', 'மீனம்'],
] as const
export const TAMIL_MONTH = [
  ['Chithirai', 'சித்திரை'], ['Vaikasi', 'வைகாசி'], ['Aani', 'ஆனி'], ['Aadi', 'ஆடி'], ['Avani', 'ஆவணி'], ['Purattasi', 'புரட்டாசி'],
  ['Aippasi', 'ஐப்பசி'], ['Karthigai', 'கார்த்திகை'], ['Margazhi', 'மார்கழி'], ['Thai', 'தை'], ['Masi', 'மாசி'], ['Panguni', 'பங்குனி'],
] as const
export const TAMIL_WEEKDAY = ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி']
/** The 60-year cycle, starting from Prabhava. */
export const TAMIL_YEAR = [
  'Prabhava', 'Vibhava', 'Sukla', 'Pramodhootha', 'Prajothpatti', 'Aangirasa', 'Srimukha', 'Bhava', 'Yuva', 'Dhaatu', 'Eesvara', 'Vehudhanya',
  'Pramathi', 'Vikrama', 'Vishu', 'Chitrabhanu', 'Subhanu', 'Dharana', 'Parthiba', 'Viya', 'Sarvajith', 'Sarvadhari', 'Virodhi', 'Vikruthi',
  'Kara', 'Nandhana', 'Vijaya', 'Jaya', 'Manmatha', 'Dhunmuki', 'Hevilambi', 'Vilambi', 'Vikari', 'Sarvari', 'Plava', 'Subakrith',
  'Sobakrith', 'Krodhi', 'Visuvavasu', 'Parabhava', 'Plavanga', 'Keelaka', 'Saumya', 'Sadharana', 'Virodhikruthu', 'Paridhabi',
  'Pramadhisa', 'Aanandha', 'Rakshasa', 'Nala', 'Pingala', 'Kalayukthi', 'Siddharthi', 'Raudhri', 'Dhunmathi', 'Dhundubhi',
  'Rudhrodhgaari', 'Raktakshi', 'Krodhana', 'Akshaya',
]

// ---------- Time helpers ----------

/** Midnight IST of a YYYY-MM-DD date, as a UTC instant. */
export const istMidnight = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MIN * 60000)
/** "6:09 AM" in IST. */
export function istTime(d: Date) {
  const t = new Date(d.getTime() + IST_OFFSET_MIN * 60000)
  const h = t.getUTCHours()
  return `${((h + 11) % 12) + 1}:${String(t.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
export const istDateOf = (d: Date) => new Date(d.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10)

export function sunTimes(date: string, place: Place) {
  const obs = new A.Observer(place.lat, place.lon, 0)
  const start = istMidnight(date)
  const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, start, 1)?.date ?? new Date(start.getTime() + 6 * 3600000)
  const set = A.SearchRiseSet(A.Body.Sun, obs, -1, rise, 1)?.date ?? new Date(start.getTime() + 18 * 3600000)
  const nextRise = A.SearchRiseSet(A.Body.Sun, obs, +1, set, 1)?.date ?? new Date(rise.getTime() + 86400000)
  return { sunrise: rise, sunset: set, nextSunrise: nextRise }
}

/** When does f (an angle that only grows) next reach a multiple of `step`? Searched by bisection, to the minute. */
function nextBoundary(f: (d: Date) => number, from: Date, step: number, maxHours = 36): Date {
  const target = (Math.floor(f(from) / step) + 1) * step
  const base = f(from)
  // Unwrap through 360° (the angle restarts at 0 after a full turn).
  const reached = (d: Date) => {
    const v = f(d)
    return (v < base - 180 ? v + 360 : v) >= target
  }
  let lo = from.getTime()
  let hi = lo + maxHours * 3600000
  if (!reached(new Date(hi))) return new Date(hi)
  while (hi - lo > 30000) {
    const mid = (lo + hi) / 2
    if (reached(new Date(mid))) hi = mid
    else lo = mid
  }
  return new Date(hi)
}

const elongation = (d: Date) => mod(moonSid(d) - sunSid(d), 360)
const yogaSum = (d: Date) => mod(moonSid(d) + sunSid(d), 360)

// ---------- One element with its end time ----------

export interface Span {
  index: number
  name: string
  ta: string
  /** When it ends (it may run past the next sunrise). */
  ends: Date
}

export function tithiAt(d: Date): Span & { paksha: 'Valarpirai' | 'Theipirai'; num: number } {
  const e = elongation(d)
  const index = Math.floor(e / 12) // 0..29
  const num = index + 1
  const within = index % 15
  const [name, ta] = index === 14 ? ['Pournami', 'பௌர்ணமி'] : index === 29 ? ['Amavasai', 'அமாவாசை'] : TITHI[within]
  return { index, num, name, ta, paksha: index < 15 ? 'Valarpirai' : 'Theipirai', ends: nextBoundary(elongation, d, 12) }
}

export function nakshatraAt(d: Date): Span {
  const index = Math.floor(moonSid(d) / (360 / 27))
  const [name, ta] = NAKSHATRA[index]
  return { index, name, ta, ends: nextBoundary(moonSid, d, 360 / 27) }
}

export function yogaAt(d: Date): Span {
  const index = Math.floor(yogaSum(d) / (360 / 27))
  return { index, name: YOGA[index], ta: YOGA[index], ends: nextBoundary(yogaSum, d, 360 / 27) }
}

export function karanaAt(d: Date): Span {
  const half = Math.floor(elongation(d) / 6) // 0..59
  const name = half === 0 ? 'Kimstughnam' : half === 57 ? 'Sakuni' : half === 58 ? 'Chatushpadam' : half === 59 ? 'Nagavam' : KARANA_MOVING[(half - 1) % 7]
  return { index: half, name, ta: name, ends: nextBoundary(elongation, d, 6) }
}

// ---------- Tamil (solar) date ----------

/** The instant the Sun last entered its current sidereal sign before `d`. */
function lastSankranti(d: Date) {
  const sign = Math.floor(sunSid(d) / 30)
  let lo = d.getTime() - 33 * 86400000
  let hi = d.getTime()
  while (hi - lo > 60000) {
    const mid = (lo + hi) / 2
    if (Math.floor(sunSid(new Date(mid)) / 30) === sign) hi = mid
    else lo = mid
  }
  return { sign, at: new Date(hi) }
}

/**
 * Tamil month and date for a civil date. Tamil rule: if the Sun changes sign before sunset, that day is day 1 of the new
 * month; after sunset, the next day is.
 */
export function tamilDate(date: string, place: Place) {
  const { sunset } = sunTimes(date, place)
  const { sign, at } = lastSankranti(sunset)
  const entryDay = istDateOf(at)
  const entrySunset = sunTimes(entryDay, place).sunset
  const day1 = at <= entrySunset ? entryDay : istDateOf(new Date(Date.parse(`${entryDay}T00:00:00Z`) + 86400000))
  const day = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${day1}T00:00:00Z`)) / 86400000) + 1
  // Tamil year turns at Chithirai 1. Krodhi began in April 2024 (cycle index 37).
  const y = Number(date.slice(0, 4))
  // Thai, Masi and Panguni (and early-January Margazhi) belong to the Tamil year that began the previous April.
  const startYear = sign >= 9 || (sign === 8 && date.slice(5, 7) === '01') ? y - 1 : y
  const yearIndex = mod(37 + (startYear - 2024), 60)
  return { month: sign, monthName: TAMIL_MONTH[sign][0], monthTa: TAMIL_MONTH[sign][1], day, year: TAMIL_YEAR[yearIndex], monthStart: day1 }
}

// ---------- Day divisions ----------

/** Eighth-of-daylight slot (1-based) for each weekday, Sunday first. */
const RAHU = [8, 2, 7, 5, 6, 4, 3]
const YAMA = [5, 4, 3, 2, 1, 7, 6]
const KULIGAI = [7, 6, 5, 4, 3, 2, 1]

export type GowriName = 'Amirdham' | 'Uthi' | 'Laabam' | 'Dhanam' | 'Sugam' | 'Rogam' | 'Soram' | 'Visham'
export const GOWRI_GOOD = new Set<GowriName>(['Amirdham', 'Uthi', 'Laabam', 'Dhanam', 'Sugam'])
/** Gowri panchangam daytime order, Sunday first (the common Tamil table). */
const GOWRI_DAY: GowriName[][] = [
  ['Uthi', 'Amirdham', 'Rogam', 'Laabam', 'Dhanam', 'Sugam', 'Soram', 'Visham'],
  ['Amirdham', 'Visham', 'Rogam', 'Laabam', 'Dhanam', 'Sugam', 'Soram', 'Uthi'],
  ['Rogam', 'Laabam', 'Dhanam', 'Sugam', 'Soram', 'Visham', 'Uthi', 'Amirdham'],
  ['Laabam', 'Dhanam', 'Sugam', 'Soram', 'Visham', 'Uthi', 'Amirdham', 'Rogam'],
  ['Dhanam', 'Sugam', 'Soram', 'Visham', 'Uthi', 'Amirdham', 'Rogam', 'Laabam'],
  ['Sugam', 'Soram', 'Visham', 'Uthi', 'Amirdham', 'Rogam', 'Laabam', 'Dhanam'],
  ['Soram', 'Visham', 'Uthi', 'Amirdham', 'Rogam', 'Laabam', 'Dhanam', 'Sugam'],
]

export interface Slot {
  name: string
  start: Date
  end: Date
  good: boolean
}

export function dayDivisions(date: string, place: Place) {
  const { sunrise, sunset } = sunTimes(date, place)
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay()
  const part = (sunset.getTime() - sunrise.getTime()) / 8
  const slot = (n: number, name: string, good: boolean): Slot => ({ name, good, start: new Date(sunrise.getTime() + (n - 1) * part), end: new Date(sunrise.getTime() + n * part) })
  const noon = (sunrise.getTime() + sunset.getTime()) / 2
  // Abhijit: the 8th of the day's 15 muhurthams, centred on local noon (not observed on Wednesdays).
  const muhurtham = (8 * part) / 15
  const abhijit: Slot | null = wd === 3 ? null : { name: 'Abhijit', good: true, start: new Date(noon - muhurtham / 2), end: new Date(noon + muhurtham / 2) }
  return {
    sunrise,
    sunset,
    weekday: wd,
    rahu: slot(RAHU[wd], 'Rahu Kalam', false),
    yama: slot(YAMA[wd], 'Yamagandam', false),
    kuligai: slot(KULIGAI[wd], 'Kuligai', false),
    abhijit,
    gowri: GOWRI_DAY[wd].map((g, i) => slot(i + 1, g, GOWRI_GOOD.has(g))),
  }
}

/** Good-time windows: Gowri good slots that don't overlap Rahu kalam or Yamagandam, merged when adjacent. */
export function nallaNeram(div: ReturnType<typeof dayDivisions>): Slot[] {
  const bad = [div.rahu, div.yama]
  const out: Slot[] = []
  for (const g of div.gowri.filter((s) => s.good)) {
    if (bad.some((b) => g.start < b.end && b.start < g.end)) continue
    const last = out[out.length - 1]
    if (last && last.end.getTime() === g.start.getTime()) last.end = g.end
    else out.push({ ...g, name: 'Nalla Neram' })
  }
  return out
}
