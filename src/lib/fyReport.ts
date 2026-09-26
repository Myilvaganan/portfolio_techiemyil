import type { ChargeItem, RoundTrip } from './optionsAnalytics'
import type { ReportDoc } from './report'

/** Indian financial year that contains a date: '2026-09-26' → 'FY 2026-27' (April to March). */
export function fyOf(date: string): string {
  const y = Number(date.slice(0, 4))
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export const fyRange = (fy: string) => {
  const start = Number(fy.slice(3, 7))
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` }
}

export interface FyMonth {
  month: string
  trades: number
  gross: number
  charges: number
  net: number
}

export interface FySummary {
  fy: string
  trades: number
  wins: number
  losses: number
  grossProfit: number
  grossLoss: number
  gross: number
  charges: number
  chargeParts: { brokerage: number; stt: number; exchange: number; sebi: number; gst: number; stamp: number }
  net: number
  /** ICAI Guidance Note method for options: the sum of each trade's absolute profit or loss. */
  turnover: number
  months: FyMonth[]
  chargesEstimated: boolean
}

const round = (n: number) => Math.round(n * 100) / 100

/** F&O (non-speculative business income) figures for one financial year, the way a CA needs them for ITR-3. */
export function fySummary(trips: RoundTrip[], charges: ChargeItem[], fy: string): FySummary {
  const { from, to } = fyRange(fy)
  const inFy = (d: string) => d >= from && d <= to
  const t = trips.filter((x) => inFy(x.closeDate))
  const c = charges.filter((x) => inFy(x.date))

  const parts = { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0 }
  for (const x of c) for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] += x[k]

  const byMonth = new Map<string, FyMonth>()
  const monthOf = (m: string) => byMonth.get(m) ?? byMonth.set(m, { month: m, trades: 0, gross: 0, charges: 0, net: 0 }).get(m)!
  for (const x of t) {
    const m = monthOf(x.closeDate.slice(0, 7))
    m.trades++
    m.gross += x.pnl
  }
  for (const x of c) monthOf(x.date.slice(0, 7)).charges += x.total
  const months = [...byMonth.values()]
    .map((m) => ({ ...m, gross: round(m.gross), charges: round(m.charges), net: round(m.gross - m.charges) }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const grossProfit = t.filter((x) => x.pnl > 0).reduce((s, x) => s + x.pnl, 0)
  const grossLoss = t.filter((x) => x.pnl < 0).reduce((s, x) => s + x.pnl, 0)
  const totalCharges = c.reduce((s, x) => s + x.total, 0)
  return {
    fy,
    trades: t.length,
    wins: t.filter((x) => x.pnl > 0).length,
    losses: t.filter((x) => x.pnl < 0).length,
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    gross: round(grossProfit + grossLoss),
    charges: round(totalCharges),
    chargeParts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v)])) as FySummary['chargeParts'],
    net: round(grossProfit + grossLoss - totalCharges),
    turnover: round(t.reduce((s, x) => s + Math.abs(x.pnl), 0)),
    months,
    chargesEstimated: c.some((x) => !x.actual),
  }
}

/** Every financial year that has a closed trade, newest first. */
export const fyList = (trips: RoundTrip[]) => [...new Set(trips.map((t) => fyOf(t.closeDate)))].sort().reverse()

const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function fyReportDoc(s: FySummary): ReportDoc {
  return {
    title: `F&O profit & loss — ${s.fy}`,
    subtitle: `Options trading as non-speculative business income (ITR-3). ${s.chargesEstimated ? 'Some charges are estimates; replace them with your contract-note totals.' : 'Charges are from your broker statements.'}`,
    sections: [
      {
        title: 'Summary for your CA',
        kpis: [
          { label: 'Turnover (ICAI method)', value: inr(s.turnover), note: 'sum of absolute profit or loss per trade' },
          { label: 'Gross P&L', value: inr(s.gross), tone: s.gross >= 0 ? 'good' : 'bad' },
          { label: 'Charges (expenses)', value: inr(s.charges) },
          { label: 'Net P&L', value: inr(s.net), tone: s.net >= 0 ? 'good' : 'bad' },
          { label: 'Trades', value: `${s.trades} (${s.wins} won, ${s.losses} lost)` },
        ],
      },
      {
        title: 'Charges breakdown',
        table: {
          columns: ['Charge', 'Amount'],
          rows: [
            ['Brokerage', inr(s.chargeParts.brokerage)],
            ['STT (not deductible as an expense)', inr(s.chargeParts.stt)],
            ['Exchange transaction', inr(s.chargeParts.exchange)],
            ['SEBI fees', inr(s.chargeParts.sebi)],
            ['GST', inr(s.chargeParts.gst)],
            ['Stamp duty', inr(s.chargeParts.stamp)],
          ],
          rightAlign: [1],
        },
      },
      {
        title: 'Month by month',
        table: { columns: ['Month', 'Trades', 'Gross', 'Charges', 'Net'], rows: s.months.map((m) => [m.month, m.trades, inr(m.gross), inr(m.charges), inr(m.net)]), rightAlign: [1, 2, 3, 4] },
      },
      {
        title: 'Notes',
        bullets: [
          { text: 'A net F&O loss can be carried forward for 8 years against business income if the return is filed on time.', tone: 'info' },
          { text: 'A tax audit may apply depending on turnover and profit; confirm the current limits with your CA.', tone: 'warn' },
          { text: 'Figures are computed from the trades you imported; verify them against your broker’s tax P&L statement.', tone: 'info' },
        ],
      },
    ],
  }
}

export function fyTradesCsv(trips: RoundTrip[], fy: string) {
  const { from, to } = fyRange(fy)
  const rows = trips
    .filter((t) => t.closeDate >= from && t.closeDate <= to)
    .sort((a, b) => a.closeTs - b.closeTs)
    .map((t) => [t.openDate, t.closeDate, t.symbol, t.direction, t.qty, t.entryPrice, t.exitPrice, round(t.pnl), round(Math.abs(t.pnl))])
  return { filename: `options-trades-${fy.replace(' ', '-')}`, columns: ['Open date', 'Close date', 'Symbol', 'Direction', 'Qty', 'Entry', 'Exit', 'P&L', 'Turnover'], rows }
}
