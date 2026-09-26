import type { Txn } from './statements'

export type HouseGroup = 'rentSalem' | 'rentBengaluru' | 'rentOther' | 'electricity' | 'cookingGas' | 'fuel' | 'bikeService' | 'food' | 'quickCommerce' | 'rides' | 'shopping'
export type Section = 'home' | 'bike' | 'lifestyle'

export interface GroupDef {
  id: HouseGroup
  label: string
  hint: string
  section: Section
  /** Fixed monthly payments get a paid / missed strip instead of a spend trend. */
  monthly?: boolean
  color: string
}

export const GROUPS: GroupDef[] = [
  { id: 'rentSalem', label: 'Salem house rent', hint: 'Paid to Appusamy', section: 'home', monthly: true, color: 'var(--viz-1)' },
  { id: 'rentBengaluru', label: 'Bengaluru house rent', hint: 'Paid to Visalakshi', section: 'home', monthly: true, color: 'var(--viz-4)' },
  { id: 'rentOther', label: 'Other rent', hint: 'PG, rooms and other landlords', section: 'home', color: 'var(--viz-other)' },
  { id: 'electricity', label: 'Electricity', hint: 'BESCOM, TANGEDCO / TNPDCL', section: 'home', color: 'var(--viz-2)' },
  { id: 'cookingGas', label: 'Cooking gas', hint: 'Indane, Bharatgas, HP Gas', section: 'home', color: 'var(--viz-8)' },
  { id: 'fuel', label: 'Bike petrol', hint: 'Indian Oil, HP, Bharat Petroleum, Shell', section: 'bike', color: 'var(--viz-6)' },
  { id: 'bikeService', label: 'Bike service', hint: 'Royal Enfield and service centres', section: 'bike', color: 'var(--viz-3)' },
  { id: 'food', label: 'Food delivery', hint: 'Zomato, Swiggy', section: 'lifestyle', color: 'var(--viz-8)' },
  { id: 'quickCommerce', label: 'Groceries delivery', hint: 'Instamart, Blinkit, Zepto, BigBasket', section: 'lifestyle', color: 'var(--viz-3)' },
  { id: 'rides', label: 'Rides', hint: 'Rapido, Ola, Uber, Namma Yatri', section: 'lifestyle', color: 'var(--viz-5)' },
  { id: 'shopping', label: 'Online shopping', hint: 'Amazon, Flipkart, Myntra, Ajio', section: 'lifestyle', color: 'var(--viz-7)' },
]
export const GROUP: Record<HouseGroup, GroupDef> = Object.fromEntries(GROUPS.map((g) => [g.id, g])) as Record<HouseGroup, GroupDef>

// Rent is matched on the bank's description only: it carries the landlord's UPI id, while the merchant name is read from
// it and is sometimes wrong (an Amazon Pay Later payment once came through as "Appu Samy House").
const RENT_RULES: { group: HouseGroup; test: RegExp; brand: string }[] = [
  { group: 'rentSalem', test: /appu ?samy|8921@idib|salem house ren/, brand: 'Appusamy' },
  { group: 'rentBengaluru', test: /vis?h?alak|visalakshi|jagannatht863|5717@ybl/, brand: 'Visalakshi' },
]

// Everything else is matched on merchant + description. The first rule that matches wins.
const RULES: { group: HouseGroup; test: RegExp }[] = [
  { group: 'electricity', test: /bescom|bangalore electricity|tangedco|tnpdcl|tneb|electricity|eb bill|power bill/ },
  { group: 'cookingGas', test: /indane|bharat ?gas|hp ?gas|\blpg\b/ },
  { group: 'bikeService', test: /bike servi|royal enfield|service cent(er|re)|two ?wheeler|tvs motor|bajaj auto|honda motor|yamaha|hero motocorp/ },
  { group: 'quickCommerce', test: /instamar|swiggy ins|blinkit|zepto|bigbasket|bb ?now|dunzo/ },
  { group: 'food', test: /zomato|swiggy|eatsure|eat ?club/ },
  { group: 'rides', test: /rapido|\bola\b|olacabs|ani technologies|uber|namma ?yatri/ },
  { group: 'shopping', test: /amazon|amzn|flipkart|myntra|ajio|meesho|nykaa/ },
  { group: 'fuel', test: /petrol|indian oil|\biocl\b|\bhpcl\b|\bbpcl\b|bharat petroleum|hindustan petroleum|\bshell\b|nayara|\bfuels?\b/ },
  { group: 'rentOther', test: /\brent\b|pg rent|room rent/ },
]

const BRANDS: Partial<Record<HouseGroup, [RegExp, string][]>> = {
  electricity: [[/bescom|bangalore electricity/, 'BESCOM'], [/tangedco|tnpdcl|tneb/, 'TANGEDCO']],
  cookingGas: [[/indane/, 'Indane'], [/bharat ?gas/, 'Bharatgas'], [/hp ?gas/, 'HP Gas']],
  bikeService: [[/royal enfield/, 'Royal Enfield'], [/tvs/, 'TVS'], [/bajaj/, 'Bajaj'], [/honda/, 'Honda'], [/yamaha/, 'Yamaha']],
  quickCommerce: [[/instamar|swiggy ins/, 'Instamart'], [/blinkit/, 'Blinkit'], [/zepto/, 'Zepto'], [/bigbasket|bb ?now/, 'BigBasket'], [/dunzo/, 'Dunzo']],
  food: [[/zomato/, 'Zomato'], [/swiggy/, 'Swiggy'], [/eatsure/, 'EatSure']],
  rides: [[/rapido/, 'Rapido'], [/\bola\b|olacabs|ani technologies/, 'Ola'], [/uber/, 'Uber'], [/namma ?yatri/, 'Namma Yatri']],
  shopping: [[/amazon|amzn/, 'Amazon'], [/flipkart/, 'Flipkart'], [/myntra/, 'Myntra'], [/ajio/, 'Ajio'], [/meesho/, 'Meesho'], [/nykaa/, 'Nykaa']],
  fuel: [[/indian oil|iocl/, 'Indian Oil'], [/hpcl|hindustan petroleum/, 'HP'], [/bpcl|bharat petroleum/, 'Bharat Petroleum'], [/shell/, 'Shell'], [/nayara/, 'Nayara']],
}
const FALLBACK_BRAND: Partial<Record<HouseGroup, string>> = { fuel: 'Petrol bunk', cookingGas: 'Gas', rentOther: 'Other landlord' }

// Never household spending: paying off a card, EMIs, fees and surcharges, cashback and money moved between my own accounts.
const EXCLUDE = /credit ca|card payment|fuel surcharge|surcharge|\bemi\b|loan repay|cashback|s myilvag|myilvaganan|pay ?later|amznlpa|amazonpayccbil/
const EXCLUDED_CATEGORIES = new Set(['EMI & Loans', 'Fees & Interest', 'Card Payment', 'Salary', 'Interest', 'Investments'])

function brandFor(group: HouseGroup, text: string, merchant: string): string {
  const hit = BRANDS[group]?.find(([re]) => re.test(text))
  if (hit) return hit[1]
  return FALLBACK_BRAND[group] ?? (merchant || GROUP[group].label)
}

export interface HouseTxn {
  id: string
  date: string
  group: HouseGroup
  brand: string
  /** Spend is positive; a refund is negative. */
  amount: number
  description: string
  source: 'bank' | 'card'
}

export function classify(t: Pick<Txn, 'description' | 'merchant' | 'category'>): { group: HouseGroup; brand: string } | null {
  const desc = t.description.toLowerCase()
  const text = `${t.merchant} ${t.description}`.toLowerCase()
  if (EXCLUDED_CATEGORIES.has(t.category) || EXCLUDE.test(text)) return null
  const rent = RENT_RULES.find((r) => r.test.test(desc))
  if (rent) return { group: rent.group, brand: rent.brand }
  const rule = RULES.find((r) => r.test.test(text))
  const group: HouseGroup | null = rule ? rule.group : t.category === 'Rent' ? 'rentOther' : t.category === 'Fuel' ? 'fuel' : null
  return group ? { group, brand: brandFor(group, text, t.merchant) } : null
}

export function householdTxns(bank: Txn[], card: Txn[]): HouseTxn[] {
  const out: HouseTxn[] = []
  const add = (list: Txn[], source: 'bank' | 'card') => {
    for (const t of list) {
      const amount = (t.debit || 0) - (t.credit || 0)
      if (!amount) continue
      const c = classify(t)
      // Money coming back only counts as a refund on shopping and delivery apps; elsewhere a credit is a transfer.
      if (c && amount < 0 && (GROUP[c.group].section !== 'lifestyle' || t.category !== 'Refund')) continue
      if (c) out.push({ id: t.id, date: t.date, group: c.group, brand: c.brand, amount, description: t.description, source })
    }
  }
  add(bank, 'bank')
  add(card, 'card')
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const monthKey = (date: string) => date.slice(0, 7)

/** The last n months ending at `month`, oldest first. */
export function lastMonths(month: string, n: number): string[] {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export interface GroupStats {
  id: HouseGroup
  total: number
  count: number
  thisMonth: number
  lastMonth: number
  avgMonth: number
  byMonth: number[]
  brands: { brand: string; total: number; count: number }[]
  last: HouseTxn | null
  /** Monthly payments: which of the months had a payment. */
  paid: boolean[]
}

/** Totals per group over `months` (oldest first); `current` is the month shown as "this month". */
export function groupStats(txns: HouseTxn[], months: string[], current: string): GroupStats[] {
  const inRange = new Set(months)
  const previous = lastMonths(current, 2)[0]
  return GROUPS.map((g) => {
    const all = txns.filter((t) => t.group === g.id)
    const list = all.filter((t) => inRange.has(monthKey(t.date)))
    const byMonth = months.map((m) => list.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.amount, 0))
    const brandMap = new Map<string, { brand: string; total: number; count: number }>()
    for (const t of list) {
      const b = brandMap.get(t.brand) ?? { brand: t.brand, total: 0, count: 0 }
      b.total += t.amount
      b.count += t.amount > 0 ? 1 : 0
      brandMap.set(t.brand, b)
    }
    const total = byMonth.reduce((s, v) => s + v, 0)
    const active = byMonth.filter((v) => v !== 0).length
    const sumFor = (m: string) => all.filter((t) => monthKey(t.date) === m).reduce((s, t) => s + t.amount, 0)
    return {
      id: g.id,
      total,
      count: list.filter((t) => t.amount > 0).length,
      thisMonth: sumFor(current),
      lastMonth: sumFor(previous),
      avgMonth: active ? total / active : 0,
      byMonth,
      brands: [...brandMap.values()].filter((b) => b.total > 0).sort((a, b) => b.total - a.total),
      last: [...all].reverse().find((t) => t.amount > 0) ?? null,
      paid: byMonth.map((v) => v > 0),
    }
  })
}

/** Rent is usually paid once a month: the expected next date is a month after the last payment. */
export function nextRentDue(last: HouseTxn | null): string | null {
  if (!last) return null
  const d = new Date(`${last.date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}
