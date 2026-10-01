import { IST_OFFSET_MIN, RASI, moonSid, nakshatraAt, sunTimes, tamilDate, tithiAt, type Place } from './core'

// What makes a day special: monthly vratham days from the tithi and star, the big Tamil festivals from the solar month,
// and the national holidays. Each carries an icon kind, so the calendar can draw a Nandhi on Pradosham, a lamp on
// Karthigai, a Vel on Sashti and so on.

export type IconKind =
  | 'nandi' | 'fullMoon' | 'newMoon' | 'lamp' | 'vel' | 'ganesha' | 'lingam' | 'namam' | 'pongal' | 'sun' | 'river' | 'devi' | 'flag' | 'kolam' | 'cow'

export interface Special {
  key: string
  name: string
  ta: string
  icon: IconKind
  /** Major festivals are shown bigger and in the notification title. */
  major?: boolean
  note?: string
}

/** The cheap facts the month grid needs for one day (no end times). */
export interface DayFacts {
  date: string
  tamil: ReturnType<typeof tamilDate>
  tithi: number // 0..29 at sunrise
  tithiSunset: number
  tithiMidnight: number
  star: number // 0..26 at sunrise
  moonRasi: number
  weekday: number
}

const tIndex = (d: Date) => tithiAt(d).index

// Each day is worked out once per place and remembered: the calendar, Today, Home and the top strip all reuse it.
const factsCache = new Map<string, DayFacts>()
export function dayFacts(date: string, place: Place): DayFacts {
  const key = `${date}|${place.name}`
  const hit = factsCache.get(key)
  if (hit) return hit
  const f = computeFacts(date, place)
  if (factsCache.size > 800) factsCache.clear()
  factsCache.set(key, f)
  return f
}

function computeFacts(date: string, place: Place): DayFacts {
  const { sunrise, sunset } = sunTimes(date, place)
  const midnight = new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MIN * 60000 + 24 * 3600000)
  return {
    date,
    tamil: tamilDate(date, place),
    tithi: tIndex(sunrise),
    tithiSunset: tIndex(sunset),
    tithiMidnight: tIndex(midnight),
    star: nakshatraAt(sunrise).index,
    moonRasi: Math.floor(moonSid(sunrise) / 30),
    weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
  }
}

const FIXED: Record<string, Special> = {
  '01-01': { key: 'newyear', name: 'New Year’s Day', ta: 'ஆங்கிலப் புத்தாண்டு', icon: 'sun' },
  '01-26': { key: 'republic', name: 'Republic Day', ta: 'குடியரசு தினம்', icon: 'flag', major: true },
  '05-01': { key: 'may', name: 'May Day', ta: 'உழைப்பாளர் தினம்', icon: 'flag' },
  '08-15': { key: 'independence', name: 'Independence Day', ta: 'சுதந்திர தினம்', icon: 'flag', major: true },
  '10-02': { key: 'gandhi', name: 'Gandhi Jayanthi', ta: 'காந்தி ஜெயந்தி', icon: 'flag' },
  '12-25': { key: 'christmas', name: 'Christmas', ta: 'கிறிஸ்துமஸ்', icon: 'lamp', major: true },
}

/**
 * Specials for a day. `prev` and `next` are the neighbouring days' facts, used where a festival is "the first day the
 * star/tithi is at sunrise" or "the day before the month turns".
 */
export function specialsFor(f: DayFacts, prev: DayFacts | null, next: DayFacts | null): Special[] {
  const out: Special[] = []
  const m = f.tamil.month
  const day = f.tamil.day
  const t = f.tithi
  const firstStarDay = (star: number) => f.star === star && prev?.star !== star
  // Thaipusam, Masi Magam, Panguni Uthiram, Vaikasi Visakam and Karthigai Deepam fall on the star nearest the full moon.
  const fullMoonStar = (star: number) => firstStarDay(star) && t >= 10 && t <= 16 && day + (14 - t) >= 1
  const firstTithiDay = (ti: number) => t === ti && prev?.tithi !== ti
  // The lunar month (new moon to new moon) is named for the solar month its new moon fell in; several festivals are
  // fixed to a lunar month, so the same tithi in the wrong one is skipped.
  const lunarMonth = (ti = t) => (day - ((ti % 30) + 1) >= 1 ? m : (m + 11) % 12)

  // ---- Big festivals (solar month + tithi/star) ----
  if (m === 0 && day === 1) out.push({ key: 'puthandu', name: 'Tamil New Year', ta: 'தமிழ்ப் புத்தாண்டு', icon: 'sun', major: true, note: `${f.tamil.year} year begins` })
  if (m === 8 && next && next.tamil.month === 9 && next.tamil.day === 1) out.push({ key: 'bhogi', name: 'Bhogi', ta: 'போகி', icon: 'kolam', major: true })
  if (m === 9 && day === 1) out.push({ key: 'pongal', name: 'Thai Pongal', ta: 'தைப் பொங்கல்', icon: 'pongal', major: true })
  if (m === 9 && day === 2) out.push({ key: 'mattu', name: 'Mattu Pongal', ta: 'மாட்டுப் பொங்கல்', icon: 'cow', major: true })
  if (m === 9 && day === 3) out.push({ key: 'kaanum', name: 'Kaanum Pongal', ta: 'காணும் பொங்கல்', icon: 'pongal' })
  if (m === 9 && fullMoonStar(7)) out.push({ key: 'thaipusam', name: 'Thaipusam', ta: 'தைப்பூசம்', icon: 'vel', major: true })
  if (m === 10 && f.tithiMidnight === 28 && prev?.tithiMidnight !== 28) out.push({ key: 'mahashivaratri', name: 'Maha Shivaratri', ta: 'மகா சிவராத்திரி', icon: 'lingam', major: true })
  if (m === 10 && fullMoonStar(9)) out.push({ key: 'masimagam', name: 'Masi Magam', ta: 'மாசி மகம்', icon: 'river', major: true })
  if (m === 11 && fullMoonStar(11)) out.push({ key: 'panguniuthiram', name: 'Panguni Uthiram', ta: 'பங்குனி உத்திரம்', icon: 'vel', major: true })
  if (m === 0 && t === 14) out.push({ key: 'chithrapournami', name: 'Chithra Pournami', ta: 'சித்ரா பௌர்ணமி', icon: 'fullMoon', major: true })
  if (m === 1 && fullMoonStar(15)) out.push({ key: 'vaikasivisakam', name: 'Vaikasi Visakam', ta: 'வைகாசி விசாகம்', icon: 'vel', major: true })
  if (m === 3 && day === 18) out.push({ key: 'aadiperukku', name: 'Aadi Perukku', ta: 'ஆடிப் பெருக்கு', icon: 'river', major: true })
  if (m === 3 && day >= 5 && firstStarDay(10)) out.push({ key: 'aadipooram', name: 'Aadi Pooram', ta: 'ஆடிப் பூரம்', icon: 'devi', major: true })
  if (m === 3 && t === 29) out.push({ key: 'aadiamavasai', name: 'Aadi Amavasai', ta: 'ஆடி அமாவாசை', icon: 'newMoon', major: true })
  if (m === 9 && t === 29) out.push({ key: 'thaiamavasai', name: 'Thai Amavasai', ta: 'தை அமாவாசை', icon: 'newMoon', major: true })
  if (lunarMonth() === 4 && firstTithiDay(3)) out.push({ key: 'vinayagar', name: 'Vinayagar Chathurthi', ta: 'விநாயகர் சதுர்த்தி', icon: 'ganesha', major: true })
  if (lunarMonth(22) === 3 && (f.tithiMidnight === 22 || t === 22) && !(prev && (prev.tithiMidnight === 22 || prev.tithi === 22))) out.push({ key: 'krishnajayanthi', name: 'Krishna Jayanthi', ta: 'கிருஷ்ண ஜெயந்தி', icon: 'namam', major: true })
  if (m === 5 && t === 29) out.push({ key: 'mahalaya', name: 'Mahalaya Amavasai', ta: 'மகாளய அமாவாசை', icon: 'newMoon', major: true })
  const navaratriWindow = lunarMonth() === 5
  if (navaratriWindow && firstTithiDay(0) && prev?.tithi === 29) out.push({ key: 'navaratri', name: 'Navaratri begins', ta: 'நவராத்திரி ஆரம்பம்', icon: 'devi', major: true })
  if (navaratriWindow && firstTithiDay(8)) out.push({ key: 'saraswati', name: 'Saraswati & Ayudha Pooja', ta: 'சரஸ்வதி / ஆயுத பூஜை', icon: 'devi', major: true })
  if (navaratriWindow && firstTithiDay(9)) out.push({ key: 'vijayadasami', name: 'Vijayadasami', ta: 'விஜயதசமி', icon: 'devi', major: true })
  if (lunarMonth() === 5 && firstTithiDay(28)) out.push({ key: 'deepavali', name: 'Deepavali', ta: 'தீபாவளி', icon: 'lamp', major: true })
  if (lunarMonth() === 6 && firstTithiDay(5)) out.push({ key: 'soorasamharam', name: 'Skanda Sashti · Soorasamharam', ta: 'கந்த சஷ்டி சூரசம்ஹாரம்', icon: 'vel', major: true })
  if (m === 7 && fullMoonStar(2)) out.push({ key: 'karthigaideepam', name: 'Karthigai Deepam', ta: 'கார்த்திகை தீபம்', icon: 'lamp', major: true })
  if (m === 8 && firstTithiDay(10)) out.push({ key: 'vaikunta', name: 'Vaikunta Ekadasi', ta: 'வைகுண்ட ஏகாதசி', icon: 'namam', major: true })
  if (m === 8 && firstStarDay(5)) out.push({ key: 'arudra', name: 'Arudra Darisanam', ta: 'ஆருத்ரா தரிசனம்', icon: 'lingam', major: true })
  if (m === 8 && firstStarDay(18)) out.push({ key: 'hanuman', name: 'Hanuman Jayanthi', ta: 'அனுமன் ஜெயந்தி', icon: 'namam', major: true })

  const taken = new Set(out.map((s) => s.icon))
  // ---- Monthly days ----
  if (t === 14 && !taken.has('fullMoon')) out.push({ key: 'pournami', name: 'Pournami', ta: 'பௌர்ணமி', icon: 'fullMoon', note: 'Full moon · Girivalam' })
  if (t === 29 && !taken.has('newMoon')) out.push({ key: 'amavasai', name: 'Amavasai', ta: 'அமாவாசை', icon: 'newMoon', note: 'New moon · tharpanam for ancestors' })
  if ((f.tithiSunset === 12 || f.tithiSunset === 27) && prev?.tithiSunset !== f.tithiSunset)
    out.push({ key: 'pradosham', name: f.weekday === 6 ? 'Sani Pradosham' : f.weekday === 1 ? 'Soma Pradosham' : 'Pradosham', ta: 'பிரதோஷம்', icon: 'nandi', note: 'Shiva & Nandhi worship at dusk, 4:30–6:00 PM' })
  if ((t === 10 || t === 25) && firstTithiDay(t) && !taken.has('namam')) out.push({ key: 'ekadasi', name: 'Ekadasi', ta: 'ஏகாதசி', icon: 'namam', note: 'Vishnu viratham · fasting' })
  if (firstTithiDay(5) && !out.some((s) => s.key === 'soorasamharam')) out.push({ key: 'sashti', name: 'Sashti Viratham', ta: 'சஷ்டி விரதம்', icon: 'vel', note: 'Murugan viratham' })
  if (f.tithiSunset === 18 && prev?.tithiSunset !== 18) out.push({ key: 'sankatahara', name: 'Sankatahara Chathurthi', ta: 'சங்கடஹர சதுர்த்தி', icon: 'ganesha', note: 'Vinayagar viratham, break the fast at moonrise' })
  if (firstTithiDay(3) && !taken.has('ganesha')) out.push({ key: 'chathurthi', name: 'Chathurthi', ta: 'சதுர்த்தி', icon: 'ganesha' })
  if (f.tithiMidnight === 28 && prev?.tithiMidnight !== 28 && !taken.has('lingam')) out.push({ key: 'sivarathiri', name: 'Masa Sivarathiri', ta: 'மாத சிவராத்திரி', icon: 'lingam' })
  if (firstStarDay(2) && !taken.has('lamp')) out.push({ key: 'karthigai', name: 'Karthigai', ta: 'கார்த்திகை விரதம்', icon: 'vel', note: 'Murugan · light a lamp at dusk' })
  if (firstStarDay(21)) out.push({ key: 'thiruvonam', name: 'Thiruvonam', ta: 'திருவோணம்', icon: 'namam', note: 'Perumal viratham' })

  const fixed = FIXED[f.date.slice(5)]
  if (fixed) out.push(fixed)
  return out
}

/** Ashtami and Navami are traditionally avoided for new beginnings. */
export const isAvoidDay = (f: DayFacts) => [7, 8, 22, 23].includes(f.tithi)

// ---------- Daily rasi palan (from Chandra balam and Tara balam) ----------

const HOUSE_LINE: string[] = [
  'The Moon is in your own sign: feelings run strong. Keep plans simple and look after your health.',
  'Money matters need care; avoid lending and impulse buys today.',
  'Courage and effort pay off: a good day to start something you’ve been putting off.',
  'Home and family need attention; keep travel and big decisions light.',
  'Mind may wander — double-check details before you commit.',
  'Obstacles give way: a strong day to finish pending work and clear debts.',
  'Partnerships and people go well; good for meetings and agreements.',
  'Chandrashtamam: go slow, avoid arguments, new ventures and risky trades.',
  'Luck is muted; stick to routine and avoid long journeys.',
  'Work and reputation rise: show your best effort today.',
  'Gains and good news are likely — a favourable day for money and friends.',
  'Expenses can creep up; rest well and avoid overspending.',
]
const GOOD_HOUSES = new Set([0, 2, 5, 6, 9, 10])
const TARA = ['Janma', 'Sampath', 'Vipath', 'Kshema', 'Prathyak', 'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra'] as const
const TARA_GOOD = new Set([1, 3, 5, 7, 8])

export interface Palan {
  rasi: number
  house: number // 0..11, Moon's sign counted from the birth sign
  chandrashtamam: boolean
  tara: (typeof TARA)[number] | null
  /** 1–5 */
  score: number
  line: string
}

export function rasiPalan(birthRasi: number, birthStar: number, f: DayFacts): Palan {
  const house = (f.moonRasi - birthRasi + 12) % 12
  const taraIdx = birthStar >= 0 ? (f.star - birthStar + 27) % 9 : -1
  let score = GOOD_HOUSES.has(house) ? 4 : 2
  if (taraIdx >= 0) score += TARA_GOOD.has(taraIdx) ? 1 : -1
  if (house === 7) score = 1
  score = Math.max(1, Math.min(5, score))
  const tara = taraIdx >= 0 ? TARA[taraIdx] : null
  const taraLine = tara ? ` ${tara} tara — ${TARA_GOOD.has(taraIdx) ? 'favourable' : 'be careful'}.` : ''
  return { rasi: birthRasi, house, chandrashtamam: house === 7, tara, score, line: HOUSE_LINE[house] + taraLine }
}

export const rasiName = (i: number) => (i >= 0 ? RASI[i][0] : '')

// ---------- A fresh line each day ----------

const MOTIVATION = [
  'Small steps every day beat big plans someday.',
  'Discipline is choosing what you want most over what you want now.',
  'Protect your capital, protect your peace.',
  'You don’t need more time — you need fewer distractions.',
  'Win the morning, and the day follows.',
  'Consistency compounds faster than talent.',
  'A calm mind makes better decisions than a clever one.',
  'Do the hard thing first; the rest gets easier.',
  'Every rupee saved is a vote for your future self.',
  'Patience is also a position.',
  'Progress, not perfection.',
  'Your habits decide your future more than your goals do.',
  'Be the person your family can rely on — starting with yourself.',
  'Losses teach; ego repeats them.',
  'Hydrate, move, sleep — the simplest edge you have.',
  'Clarity comes from action, not from thinking.',
  'Stay humble in profit, steady in loss.',
  'Focus on the process; results are a side effect.',
  'Gratitude turns what you have into enough.',
  'One honest review a week is worth a hundred resolutions.',
  'Debt-free is a kind of freedom no salary can buy.',
  'The best investment is in your own health and skills.',
  'Don’t trade your sleep for a screen.',
  'Respect the plan on the days you don’t feel like it.',
  'Kindness costs nothing and returns everything.',
  'A good day starts the night before.',
  'Learn one thing today that your future self will thank you for.',
  'Courage is not the absence of fear, but acting with it.',
  'Your pace is your own. Keep going.',
  'Simple living, high thinking.',
]

export function motivationFor(date: string) {
  const n = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000)
  return MOTIVATION[n % MOTIVATION.length]
}
