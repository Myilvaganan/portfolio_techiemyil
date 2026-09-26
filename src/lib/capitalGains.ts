// Realised capital gains from Zerodha's Tax P&L (or any tradewise-exit sheet with entry/exit dates and profit).
// Only listed equity and equity-oriented mutual funds are handled; F&O sections are skipped (they are business income)
// and debt funds are not separated, so treat the split as an estimate to check against the broker's report.

import type { Cell } from './tradeImport'
import { cellText } from './tradeImport'
import { fyOf } from './tax'
import { xirr } from './loans'

// Review these every Budget: they are the current rules for listed equity / equity funds (from 23 Jul 2024).
export const STCG_RATE = 0.2
export const LTCG_RATE = 0.125
export const LTCG_EXEMPTION = 125_000
export const LONG_TERM_DAYS = 365

export type CgClass = 'intraday' | 'stcg' | 'ltcg'

export interface CgRow {
  symbol: string
  kind: 'equity' | 'mf'
  entry: string | null
  exit: string
  qty: number
  buy: number
  sell: number
  profit: number
  cls: CgClass
}

export interface CgParse {
  rows: CgRow[]
  problems: string[]
  skipped: number
}

const norm = (c: Cell) => cellText(c).toLowerCase().replace(/[^a-z0-9]/g, '')

const ALIASES: Record<'symbol' | 'entry' | 'exit' | 'qty' | 'buy' | 'sell' | 'profit' | 'period', string[]> = {
  symbol: ['symbol', 'scripname', 'scrip', 'security', 'stock', 'instrument', 'fundname', 'name'],
  entry: ['entrydate', 'buydate', 'purchasedate', 'dateofpurchase'],
  exit: ['exitdate', 'selldate', 'saledate', 'dateofsale'],
  qty: ['quantity', 'qty'],
  buy: ['buyvalue', 'purchasevalue', 'costofacquisition', 'buyamount', 'cost'],
  sell: ['sellvalue', 'salevalue', 'salesvalue', 'sellamount', 'saleconsideration'],
  profit: ['profit', 'pnl', 'realisedpnl', 'realizedpnl', 'gain', 'profitloss', 'netprofit', 'realisedprofit'],
  period: ['periodofholding', 'holdingperiod', 'holdingdays', 'daysheld'],
}

export function parseDate(c: Cell): string | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : c.toISOString().slice(0, 10)
  const s = cellText(c)
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

const num = (c: Cell): number => {
  if (typeof c === 'number') return c
  const s = cellText(c).replace(/[,₹\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  const n = Number(s)
  return s && Number.isFinite(n) ? n : NaN
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
const MF = /\bfund\b|\bmf\b|\bgrowth\b|\bdirect\b|\bidcw\b|\bplan\b/i

export function parseCapitalGains(rows: Cell[][]): CgParse {
  const problems: string[] = []
  let head = -1
  let cols: Partial<Record<keyof typeof ALIASES, number>> = {}
  for (let i = 0; i < Math.min(rows.length, 60) && head < 0; i++) {
    const h = rows[i].map(norm)
    const found: typeof cols = {}
    for (const k of Object.keys(ALIASES) as (keyof typeof ALIASES)[]) {
      const at = ALIASES[k].map((a) => h.indexOf(a)).find((x) => x >= 0)
      if (at !== undefined) found[k] = at
    }
    if (found.profit !== undefined && found.exit !== undefined && found.symbol !== undefined) {
      head = i
      cols = found
    }
  }
  if (head < 0) return { rows: [], problems: ['Could not find the Symbol, Exit Date and Profit columns. Use the Tradewise Exits sheet of the Tax P&L.'], skipped: 0 }

  let section: CgClass | null = null
  let skipSection = false
  let skipped = 0
  const out: CgRow[] = []
  for (const r of rows.slice(head + 1)) {
    const filled = r.filter((c) => cellText(c) !== '')
    if (filled.length === 1 && typeof filled[0] !== 'number') {
      const t = cellText(filled[0]).toLowerCase()
      if (/f ?& ?o|futures|options|currency|commodity/.test(t)) skipSection = true
      else {
        if (/intraday/.test(t)) section = 'intraday'
        else if (/short/.test(t)) section = 'stcg'
        else if (/long/.test(t)) section = 'ltcg'
        else if (/equity|mutual/.test(t)) section = null
        else continue
        skipSection = false
      }
      continue
    }
    const symbol = cellText(r[cols.symbol!])
    const exit = parseDate(r[cols.exit!])
    if (!symbol || !exit || /^total/i.test(symbol)) continue
    if (skipSection) {
      skipped++
      continue
    }
    const buy = cols.buy !== undefined ? num(r[cols.buy]) : NaN
    const sell = cols.sell !== undefined ? num(r[cols.sell]) : NaN
    let profit = num(r[cols.profit!])
    if (!Number.isFinite(profit) && Number.isFinite(buy) && Number.isFinite(sell)) profit = sell - buy
    if (!Number.isFinite(profit)) continue

    const entry = cols.entry !== undefined ? parseDate(r[cols.entry]) : null
    const period = cols.period !== undefined ? num(r[cols.period]) : NaN
    const held = entry ? days(entry, exit) : Number.isFinite(period) ? period : null
    const cls: CgClass = held !== null ? (held <= 0 ? 'intraday' : held > LONG_TERM_DAYS ? 'ltcg' : 'stcg') : section ?? 'stcg'
    out.push({
      symbol,
      kind: MF.test(symbol) ? 'mf' : 'equity',
      entry,
      exit,
      qty: cols.qty !== undefined && Number.isFinite(num(r[cols.qty])) ? num(r[cols.qty]) : 0,
      buy: Number.isFinite(buy) ? buy : 0,
      sell: Number.isFinite(sell) ? sell : 0,
      profit,
      cls,
    })
  }
  if (!out.length) problems.push('No equity or mutual-fund sales were found in this file.')
  return { rows: out, problems, skipped }
}

export interface FySummary {
  fy: string
  intraday: number
  stcg: number
  ltcg: number
  intradayTrades: number
  stcgTrades: number
  ltcgTrades: number
  buyValue: number
  sellValue: number
}

const round = (n: number) => Math.round(n * 100) / 100

export function summarizeByFy(rows: CgRow[]): FySummary[] {
  const by = new Map<string, FySummary>()
  for (const r of rows) {
    const fy = fyOf(r.exit)
    const s = by.get(fy) ?? { fy, intraday: 0, stcg: 0, ltcg: 0, intradayTrades: 0, stcgTrades: 0, ltcgTrades: 0, buyValue: 0, sellValue: 0 }
    s[r.cls] += r.profit
    s[`${r.cls}Trades` as 'stcgTrades']++
    s.buyValue += r.buy
    s.sellValue += r.sell
    by.set(fy, s)
  }
  return [...by.values()]
    .map((s) => ({ ...s, intraday: round(s.intraday), stcg: round(s.stcg), ltcg: round(s.ltcg), buyValue: round(s.buyValue), sellValue: round(s.sellValue) }))
    .sort((a, b) => b.fy.localeCompare(a.fy))
}

export interface Taxable {
  /** Short-term loss set off against long-term gain, as the law allows. */
  stcgAfterSetOff: number
  ltcgAfterSetOff: number
  exemptionUsed: number
  ltcgTaxable: number
  stcgTaxable: number
  stcgTax: number
  ltcgTax: number
  /** Intraday is speculative business income taxed at your slab, so no flat rate is applied. */
  intradayBusiness: number
  totalTax: number
}

export function taxableGains(s: Pick<FySummary, 'intraday' | 'stcg' | 'ltcg'>): Taxable {
  let stcg = s.stcg
  let ltcg = s.ltcg
  if (stcg < 0 && ltcg > 0) {
    const off = Math.min(-stcg, ltcg)
    stcg += off
    ltcg -= off
  }
  const stcgTaxable = Math.max(0, stcg)
  const exemptionUsed = Math.min(Math.max(0, ltcg), LTCG_EXEMPTION)
  const ltcgTaxable = Math.max(0, ltcg - LTCG_EXEMPTION)
  const stcgTax = round(stcgTaxable * STCG_RATE)
  const ltcgTax = round(ltcgTaxable * LTCG_RATE)
  return { stcgAfterSetOff: round(stcg), ltcgAfterSetOff: round(ltcg), exemptionUsed, ltcgTaxable: round(ltcgTaxable), stcgTaxable: round(stcgTaxable), stcgTax, ltcgTax, intradayBusiness: s.intraday, totalTax: round(stcgTax + ltcgTax) }
}

/** Annualised return on the imported sales: buy at entry date, sell at exit date. Null when entry dates are missing. */
export function realisedXirr(rows: CgRow[]): number | null {
  const dated = rows.filter((r) => r.entry && r.buy > 0 && r.sell > 0 && r.cls !== 'intraday')
  if (dated.length < 1) return null
  const flows = dated.flatMap((r) => [
    { date: r.entry!, amount: -r.buy },
    { date: r.exit, amount: r.sell },
  ])
  flows.sort((a, b) => a.date.localeCompare(b.date))
  const v = xirr(flows)
  return v !== null && Number.isFinite(v) ? v : null
}
