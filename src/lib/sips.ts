// Detects mutual-fund SIPs from bank debits: a fund house / platform name in the description that repeats in
// consecutive months. Reports invested total, months active, the next expected debit and months that went missing.

import type { Txn } from './statements'

const DAY_MS = 86_400_000

const BRANDS: [RegExp, string][] = [
  [/zerodha coin|\bcoin\b.*zerodha|zerodha.*\bcoin\b/, 'Zerodha Coin'],
  [/nse clearing|iccl|indian clearing|mfss/, 'NSE Clearing (MFSS)'],
  [/bse ?star|starmf/, 'BSE StAR MF'],
  [/icici pru\w*.*(mutual|amc|fund|sip)|icici prudential mutual/, 'ICICI Prudential MF'],
  [/hdfc (mutual|mf|amc|asset)|hdfc.*mutual fund/, 'HDFC Mutual Fund'],
  [/sbi (mutual|mf|funds)|sbi.*mutual fund/, 'SBI Mutual Fund'],
  [/axis (mutual|mf|amc)|axis.*mutual fund/, 'Axis Mutual Fund'],
  [/nippon/, 'Nippon India MF'],
  [/kotak (mutual|mf|amc)/, 'Kotak Mutual Fund'],
  [/uti (mutual|mf|amc)/, 'UTI Mutual Fund'],
  [/parag parikh|ppfas/, 'PPFAS Mutual Fund'],
  [/mirae asset/, 'Mirae Asset MF'],
  [/motilal oswal (mutual|amc|asset)/, 'Motilal Oswal MF'],
  [/groww|kuvera|et money|paytm money|indmoney/, 'MF platform'],
  [/mutual fund|\bsip\b|systematic investment/, 'Mutual fund SIP'],
]

export interface SipSeries {
  name: string
  months: string[]
  monthsActive: number
  total: number
  lastAmount: number
  avgAmount: number
  lastDate: string
  nextExpected: string
  missedMonths: string[]
  /** Still running: its last debit is no more than two months old. */
  active: boolean
}

const monthOf = (d: string) => d.slice(0, 7)
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1
const monthFromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const pad = (n: number) => String(n).padStart(2, '0')
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function onDay(month: string, day: number) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${pad(Math.min(day, last))}`
}

export function sipBrand(t: Pick<Txn, 'description' | 'merchant'>): string | null {
  const text = `${t.merchant} ${t.description}`.toLowerCase()
  if (/coinswitch|coindcx|coinbase|bitcoin/.test(text)) return null
  for (const [re, name] of BRANDS) if (re.test(text)) return name
  return null
}

export function detectSips(txns: Txn[], today: string, minMonths = 3): SipSeries[] {
  const groups = new Map<string, Map<string, { amount: number; day: number; date: string }>>()
  for (const t of txns) {
    if (!(t.debit > 0)) continue
    const name = sipBrand(t)
    if (!name) continue
    const months = groups.get(name) ?? new Map()
    const m = monthOf(t.date)
    const prev = months.get(m)
    months.set(m, { amount: (prev?.amount ?? 0) + t.debit, day: prev?.day ?? Number(t.date.slice(8, 10)), date: prev && prev.date > t.date ? prev.date : t.date })
    groups.set(name, months)
  }

  const nowMonth = monthOf(today)
  const out: SipSeries[] = []
  for (const [name, byMonth] of groups) {
    const months = [...byMonth.keys()].sort()
    if (months.length < minMonths) continue
    const idx = months.map(monthIndex)
    const gaps = idx.slice(1).map((v, i) => v - idx[i])
    // Monthly means most gaps are a single month; a quarterly or yearly payment is not a SIP.
    if (gaps.filter((g) => g === 1).length < gaps.length / 2) continue

    const entries = months.map((m) => byMonth.get(m)!)
    const amounts = entries.map((e) => e.amount)
    const day = Math.round(median(entries.map((e) => e.day)))
    const lastMonth = months.at(-1)!
    const lastDate = entries.at(-1)!.date
    const total = amounts.reduce((s, x) => s + x, 0)

    let nextExpected = onDay(monthFromIndex(monthIndex(lastMonth) + 1), day)
    const missed: string[] = []
    for (let i = idx[0]; i <= monthIndex(lastMonth); i++) if (!byMonth.has(monthFromIndex(i))) missed.push(monthFromIndex(i))
    // Months after the last debit that have already passed their due day count as missed too.
    for (let i = monthIndex(lastMonth) + 1; i <= monthIndex(nowMonth); i++) {
      const due = onDay(monthFromIndex(i), day)
      if (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`) > 5 * DAY_MS) missed.push(monthFromIndex(i))
    }
    const active = monthIndex(nowMonth) - monthIndex(lastMonth) <= 2
    if (active) {
      let i = monthIndex(lastMonth) + 1
      while (onDay(monthFromIndex(i), day) < today) i++
      nextExpected = onDay(monthFromIndex(i), day)
    }

    out.push({
      name,
      months,
      monthsActive: months.length,
      total: Math.round(total * 100) / 100,
      lastAmount: amounts.at(-1)!,
      avgAmount: Math.round((total / amounts.length) * 100) / 100,
      lastDate,
      nextExpected,
      missedMonths: missed,
      active,
    })
  }
  return out.sort((a, b) => b.total - a.total)
}
