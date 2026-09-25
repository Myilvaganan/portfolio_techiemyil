// Report builders for the older admin modules (the finance dashboards have their own in statementReports.ts).
import type { ReportDoc } from './report'
import { TAX_RATE, afterTaxProfit } from './margin'
import { formatInr, formatSignedInr, formatSignedPct, holdingRows, marginSummary, openPositions, portfolioTotals, type KiteSnapshot } from './kite'
import type { Analytics, Insight, RoundTrip } from './optionsAnalytics'
import type { BucketRow, Holding } from './portfolio'
import { BUCKETS } from './portfolio'

const inr = (n: number, d = 0) => formatInr(n, d)
const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

export function zerodhaReport(snapshot: KiteSnapshot, name: string, sample: boolean): ReportDoc {
  const rows = holdingRows(snapshot.holdings)
  const t = portfolioTotals(rows)
  const margin = marginSummary(snapshot.margins)
  const positions = openPositions(snapshot.positions)
  const orders = snapshot.orders ?? []
  return {
    title: `${name}'s Zerodha portfolio`,
    subtitle: `${sample ? 'Sample data · ' : ''}As of ${new Date(snapshot.fetchedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    sections: [
      {
        title: 'Summary',
        kpis: [
          { label: 'Portfolio value', value: inr(t.value), note: `Invested ${inr(t.invested)}` },
          { label: "Today's P&L", value: formatSignedInr(t.dayPnl), note: formatSignedPct(t.dayPct), tone: t.dayPnl >= 0 ? 'good' : 'bad' },
          { label: 'Total returns', value: formatSignedInr(t.pnl), note: formatSignedPct(t.pnlPct), tone: t.pnl >= 0 ? 'good' : 'bad' },
          { label: 'Available margin', value: margin ? inr(margin.available) : '—', note: margin ? `${inr(margin.used)} used` : undefined },
        ],
      },
      { title: 'Allocation', bars: [...rows].sort((a, b) => b.value - a.value).slice(0, 10).map((r) => ({ label: r.symbol, value: r.value, display: `${inr(r.value)} · ${t.value ? ((r.value / t.value) * 100).toFixed(1) : 0}%` })) },
      { title: 'Holdings', table: { columns: ['Symbol', 'Qty', 'Avg', 'LTP', 'Value', 'P&L', 'P&L %', 'Day'], rows: [...rows].sort((a, b) => b.value - a.value).map((r) => [r.symbol, r.qty, inr(r.avg, 2), inr(r.ltp, 2), inr(r.value), formatSignedInr(r.pnl), formatSignedPct(r.pnlPct), formatSignedInr(r.dayPnl)]), rightAlign: [1, 2, 3, 4, 5, 6, 7] } },
      ...(positions.length ? [{ title: 'Open positions', table: { columns: ['Contract', 'Product', 'Qty', 'Avg', 'LTP', 'P&L'], rows: positions.map((p) => [p.tradingsymbol, p.product, p.quantity, inr(p.average_price, 2), inr(p.last_price, 2), formatSignedInr(p.pnl, 2)]), rightAlign: [2, 3, 4, 5] } }] : []),
      ...(orders.length ? [{ title: "Today's orders", table: { columns: ['Time', 'Side', 'Contract', 'Qty', 'Type', 'Price', 'Status'], rows: orders.map((o) => [o.order_timestamp?.split(' ')[1]?.slice(0, 5) ?? '', o.transaction_type, o.tradingsymbol, o.quantity, o.order_type, o.price ? inr(o.price, 2) : 'Market', o.status]), rightAlign: [3, 5] } }] : []),
    ],
  }
}

export function zerodhaHoldingsCsv(snapshot: KiteSnapshot) {
  return {
    filename: 'zerodha-holdings',
    columns: ['Symbol', 'Exchange', 'Quantity', 'Average', 'LTP', 'Invested', 'Value', 'P&L', 'P&L %', 'Day P&L'],
    rows: holdingRows(snapshot.holdings).map((r) => [r.symbol, r.exchange, r.qty, r.avg, r.ltp, Math.round(r.invested * 100) / 100, Math.round(r.value * 100) / 100, Math.round(r.pnl * 100) / 100, Math.round(r.pnlPct * 100) / 100, Math.round(r.dayPnl * 100) / 100]),
  }
}

export function optionsReport(a: Analytics, trips: RoundTrip[], insights: Insight[], label: string, rangeLabel: string): ReportDoc {
  const slice = (title: string, s: Analytics['breakdowns'][keyof Analytics['breakdowns']]) => ({ title, note: 'Gross P&L before charges', bars: s.map((x) => ({ label: x.key, value: x.pnl, display: `${formatSignedInr(x.pnl)} · ${x.trades} trades · ${Math.round((x.wins / x.trades) * 100)}% wins`, tone: (x.pnl >= 0 ? 'good' : 'bad') as 'good' | 'bad' })) })
  const trip = (t: RoundTrip) => [shortDate(t.closeDate), t.broker ?? '', `${t.underlying} ${t.strike} ${t.type}`, t.direction === 'LONG' ? 'Bought' : 'Sold', t.qty, inr(t.entryPrice, 2), t.expired ? 'expired' : inr(t.exitPrice, 2), formatSignedInr(t.pnl)]
  const cols = ['Closed', 'Broker', 'Contract', 'Side', 'Qty', 'Entry', 'Exit', 'P&L']
  return {
    title: 'Options trading report',
    subtitle: `${label} · ${rangeLabel}`,
    sections: [
      {
        title: 'Summary',
        kpis: [
          { label: 'Net P&L', value: formatSignedInr(a.net), tone: a.net >= 0 ? 'good' : 'bad', note: a.chargesSource === 'actual' ? 'after actual charges' : 'after est. charges' },
          { label: 'Gross P&L', value: formatSignedInr(a.gross), note: `${a.trades} closed trades` },
          { label: a.chargesSource === 'actual' ? 'Charges' : 'Charges (est.)', value: inr(a.charges), tone: 'warn' },
          { label: 'Win rate', value: `${a.winRate.toFixed(1)}%`, note: `${a.wins} wins · ${a.losses} losses` },
          { label: 'Profit factor', value: a.profitFactor === null ? '—' : a.profitFactor.toFixed(2) },
          { label: 'Max drawdown', value: inr(a.maxDrawdown.amount), tone: a.maxDrawdown.amount > 0 ? 'bad' : undefined },
        ],
      },
      ...(insights.length ? [{ title: 'What the numbers say', bullets: insights.map((i) => ({ text: i.text, tone: i.tone === 'good' ? ('good' as const) : i.tone === 'bad' ? ('bad' as const) : ('info' as const) })) }] : []),
      { title: a.chargesSource === 'actual' ? 'Charges (from your statements)' : 'Charges (estimated)', bars: Object.entries(a.chargeParts).map(([k, v]) => ({ label: k, value: v, display: inr(v, 2) })) },
      slice('By index / stock', a.breakdowns.underlying),
      slice('Calls vs puts', a.breakdowns.type),
      slice('Buying vs selling', a.breakdowns.direction),
      slice('By weekday', a.breakdowns.weekday),
      slice('By days to expiry', a.breakdowns.dte),
      slice('By holding time', a.breakdowns.hold),
      { title: 'Top 5 winners', table: { columns: cols, rows: a.topWins.map(trip), rightAlign: [4, 5, 6, 7] } },
      { title: 'Top 5 losers', table: { columns: cols, rows: a.topLosses.map(trip), rightAlign: [4, 5, 6, 7] } },
      { title: 'All trades', table: { columns: cols, rows: [...trips].sort((x, y) => y.closeTs - x.closeTs).map(trip), rightAlign: [4, 5, 6, 7] } },
    ],
  }
}

export function optionsTradesCsv(trips: RoundTrip[]) {
  return {
    filename: 'options-trades',
    columns: ['Broker', 'Closed', 'Opened', 'Underlying', 'Strike', 'Type', 'Expiry', 'Direction', 'Qty', 'Entry', 'Exit', 'P&L', 'Held (min)', 'Expired'],
    rows: [...trips].sort((x, y) => y.closeTs - x.closeTs).map((t) => [t.broker ?? '', t.closeDate, t.openDate, t.underlying, t.strike, t.type, t.expiry, t.direction, t.qty, Math.round(t.entryPrice * 100) / 100, Math.round(t.exitPrice * 100) / 100, Math.round(t.pnl * 100) / 100, t.holdMin, t.expired ? 'yes' : '']),
  }
}

export function rebalanceReport(rows: BucketRow[], holdings: Holding[], total: number): ReportDoc {
  const toSell = rows.filter((r) => r.delta < 0).reduce((s, r) => s + -r.delta, 0)
  const toBuy = rows.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0)
  return {
    title: 'Portfolio rebalance blueprint',
    subtitle: `${inr(total)} portfolio · illustrative target mix`,
    sections: [
      { title: 'Summary', kpis: [{ label: 'Portfolio value', value: inr(total) }, { label: 'To sell', value: inr(toSell), tone: 'bad' }, { label: 'To buy', value: inr(toBuy), tone: 'good' }] },
      { title: 'Current allocation', bars: rows.map((r) => ({ label: BUCKETS[r.id].label, value: r.current, display: `${inr(r.current)} · ${r.currentPct.toFixed(1)}%` })) },
      { title: 'Rebalance plan', table: { columns: ['Bucket', 'Now', 'Now %', 'Target %', 'Target', 'Buy / sell'], rows: rows.map((r) => [BUCKETS[r.id].label, inr(r.current), `${r.currentPct.toFixed(1)}%`, `${r.targetPct}%`, inr(r.target), formatSignedInr(r.delta)]), rightAlign: [1, 2, 3, 4, 5] } },
      { title: 'Holdings', table: { columns: ['Holding', 'Role', 'Value', 'Weight'], rows: [...holdings].sort((a, b) => b.value - a.value).map((h) => [h.symbol, h.role, inr(h.value), `${((h.value / total) * 100).toFixed(1)}%`]), rightAlign: [2, 3] } },
      { title: 'Note', text: 'An educational framework, not personalised investment advice. Verify prices, taxes, exit loads, liquidity and tracking difference before acting.' },
    ],
  }
}

export interface MarginReportInput {
  instrumentName: string
  unit: string
  direction: 'BUY' | 'SELL'
  lots: number
  leverage: number
  entry: number
  exit: number | null
  stopLoss: number | null
  usdInr: number
  margin: { margin: number; positionValue: number; pointValue: number; units: number }
  pnl: { tpProfit: number; slLoss: number; roi: number; riskReward: number | null; tpPoints: number; slPoints: number }
  risk: { dollarRisk: number; percent: number; reward: number; maxLots1Percent: number; maxLots2Percent: number }
  balance: number
  slPointsInput: number
}

export function marginReport(i: MarginReportInput): ReportDoc {
  const both = (n: number) => `${usd(n)} (${formatInr(n * i.usdInr)})`
  const tax = i.pnl.tpProfit > 0 ? i.pnl.tpProfit * TAX_RATE : 0
  return {
    title: `${i.instrumentName} trade plan`,
    subtitle: `${i.direction} ${i.lots.toFixed(2)} lot · 1:${Number.isInteger(i.leverage) ? i.leverage : i.leverage.toFixed(1)} · 1 USD = ₹${i.usdInr.toFixed(2)}`,
    sections: [
      { title: 'Margin', kpis: [{ label: 'Margin required', value: both(i.margin.margin) }, { label: 'Position value', value: both(i.margin.positionValue) }, { label: 'Point value', value: both(i.margin.pointValue) }, { label: 'Units', value: `${i.margin.units} ${i.unit}` }] },
      {
        title: 'Profit / loss',
        kpis: [
          { label: 'Entry', value: i.entry.toLocaleString('en-US') },
          { label: 'Target', value: i.exit ? i.exit.toLocaleString('en-US') : '—' },
          { label: 'Stop loss', value: i.stopLoss ? i.stopLoss.toLocaleString('en-US') : '—' },
          { label: 'TP profit', value: both(i.pnl.tpProfit), tone: i.pnl.tpProfit >= 0 ? 'good' : 'bad', note: tax ? `${TAX_RATE * 100}% tax: ${both(tax)}` : `${Math.abs(i.pnl.tpPoints).toFixed(0)} pts` },
          ...(tax ? [{ label: 'TP profit after tax', value: both(afterTaxProfit(i.pnl.tpProfit)), tone: 'good' as const, note: `after ${TAX_RATE * 100}% tax` }] : []),
          { label: 'SL loss', value: both(-i.pnl.slLoss), tone: 'bad', note: `${Math.abs(i.pnl.slPoints).toFixed(0)} pts` },
          { label: 'ROI on margin', value: `${i.pnl.roi.toFixed(1)}%` },
          { label: 'Risk : reward', value: i.pnl.riskReward ? `1 : ${i.pnl.riskReward.toFixed(2)}` : '—' },
        ],
      },
      { title: 'Risk', kpis: [{ label: 'Account balance', value: both(i.balance) }, { label: `Risk at ${i.slPointsInput} pts`, value: both(i.risk.dollarRisk), tone: i.risk.percent > 2 ? 'bad' : 'good', note: `${i.risk.percent.toFixed(2)}% of balance` }, { label: 'Max lots at 1% risk', value: i.risk.maxLots1Percent.toFixed(2) }, { label: 'Max lots at 2% risk', value: i.risk.maxLots2Percent.toFixed(2) }] },
      { title: 'Note', text: 'Prices come from public sources and may be delayed. Always verify with your broker.' },
    ],
  }
}
