import type { ReportDoc, ReportSection } from './report'
import { formatInr, formatSignedInr } from './kite'
import { fxOf, netInr, taxCaption, taxOn, usesNetTax, type JournalSettings, type Trade } from './journal'
import type { Analytics, Insight, Slice } from './journalAnalytics'

const inr = (n: number) => formatInr(n)
const signedInr = (n: number) => formatSignedInr(n)
const pf = (n: number | null) => (n === null ? '—' : n.toFixed(2))

function sliceTable(title: string, slices: Slice[]): ReportSection {
  return {
    title,
    table: {
      columns: [title.replace('By ', ''), 'Trades', 'Win %', 'Avg / trade', 'Net P&L', 'After tax'],
      rows: slices.map((s) => [s.label, s.trades, `${s.winRate.toFixed(0)}%`, signedInr(s.avgNet), signedInr(s.net), signedInr(s.afterTax)]),
      rightAlign: [1, 2, 3, 4, 5],
    },
  }
}

/** The standalone report behind the dashboard's Reports menu: before-tax, tax and after-tax first, then the detail. */
export function journalReport(a: Analytics, settings: JournalSettings, rangeLabel: string, insights: Insight[]): ReportDoc {
  const t = a.totals
  const sections: ReportSection[] = [
    {
      title: 'Profit & loss',
      kpis: [
        { label: 'Net P&L before tax', value: signedInr(t.net), tone: t.net >= 0 ? 'good' : 'bad', note: `Gross ${signedInr(t.gross)} − fees ${inr(t.fees)}` },
        {
          label: settings.taxRules.length > 0 ? 'Tax (by instrument)' : settings.taxRate > 0 ? `Tax @ ${settings.taxRate}%` : 'Tax',
          value: t.tax > 0 ? `-${inr(t.tax)}` : inr(0),
          tone: 'warn',
          note: taxCaption(settings),
        },
        { label: 'Net P&L after tax', value: signedInr(t.afterTax), tone: t.afterTax >= 0 ? 'good' : 'bad' },
        { label: 'Trades', value: String(t.trades), note: `${t.wins}W · ${t.losses}L` },
        { label: 'Win rate', value: `${a.winRate.toFixed(1)}%` },
        { label: 'Profit factor', value: pf(a.profitFactor) },
        { label: 'Expectancy / trade', value: signedInr(a.expectancy) },
        {
          label: 'Max drawdown',
          value: inr(a.maxDrawdown.amount),
          tone: a.maxDrawdown.amount > 0 ? 'bad' : undefined,
          note: a.maxDrawdown.pct !== null ? `${a.maxDrawdown.pct.toFixed(1)}% of peak equity` : undefined,
        },
      ],
    },
    {
      title: 'Trade quality',
      kpis: [
        { label: 'Average win', value: inr(a.avgWin), tone: 'good' },
        { label: 'Average loss', value: inr(a.avgLoss), tone: 'bad' },
        { label: 'Payoff ratio', value: a.payoff === null ? '—' : a.payoff.toFixed(2) },
        { label: 'Average R', value: a.avgR === null ? '—' : `${a.avgR.toFixed(2)}R` },
        { label: 'Best trade', value: signedInr(a.largestWin), tone: 'good' },
        { label: 'Worst trade', value: signedInr(a.largestLoss), tone: 'bad' },
        { label: 'Longest win streak', value: String(a.streaks.maxWin) },
        { label: 'Longest loss streak', value: String(a.streaks.maxLoss) },
        { label: 'Green / red days', value: `${a.greenDays} / ${a.redDays}`, note: `${a.avgTradesPerDay.toFixed(1)} trades a day` },
      ],
    },
  ]

  if (insights.length) sections.push({ title: 'Coach insights', bullets: insights.map((i) => ({ text: i.text, tone: i.tone })) })

  sections.push(sliceTable('By instrument', a.byInstrument), sliceTable('By strategy', a.byStrategy))
  if (a.byWeekday.length) sections.push(sliceTable('By weekday', a.byWeekday))
  if (a.byEmotion.some((s) => s.label !== 'Unspecified')) sections.push(sliceTable('By emotion', a.byEmotion))

  if (a.mistakes.length) {
    sections.push({
      title: 'Cost of mistakes',
      note: 'Net P&L of every trade tagged with the mistake — the more negative, the more it hurts.',
      table: { columns: ['Mistake', 'Trades', 'Net P&L'], rows: a.mistakes.map((m) => [m.label, m.count, signedInr(m.net)]), rightAlign: [1, 2] },
    })
  }

  const d = a.discipline
  if (d.followed.trades + d.broke.trades > 0) {
    sections.push({
      title: 'Discipline',
      table: {
        columns: ['', 'Trades', 'Win %', 'Avg / trade', 'Net P&L'],
        rows: [d.followed, d.broke].map((s) => [s.label, s.trades, `${s.winRate.toFixed(0)}%`, signedInr(s.avgNet), signedInr(s.net)]),
        rightAlign: [1, 2, 3, 4],
      },
    })
  }

  sections.push({
    title: 'Monthly results',
    table: {
      columns: ['Month', 'Trades', 'Before tax', 'Tax', 'After tax'],
      rows: a.monthly.map((m) => [m.month, m.trades, signedInr(m.net), m.tax > 0 ? `-${inr(m.tax)}` : inr(0), signedInr(m.afterTax)]),
      rightAlign: [1, 2, 3, 4],
    },
  })

  sections.push({
    title: 'Daily results',
    table: {
      columns: ['Date', 'Trades', 'Before tax', 'Tax', 'After tax'],
      rows: [...a.days].reverse().map((r) => [r.date, r.trades, signedInr(r.net), r.tax > 0 ? `-${inr(r.tax)}` : inr(0), signedInr(r.afterTax)]),
      rightAlign: [1, 2, 3, 4],
    },
  })

  if (usesNetTax(settings)) {
    sections.push({ title: 'Note', text: 'For instruments taxed on net profit, tax is charged on the net profit of each period, so monthly and daily tax figures are shown for each period on its own and will not add up to the total.' })
  }

  return {
    title: 'Trading journal report',
    subtitle: `${rangeLabel} · ${t.trades} trades · amounts in ₹ (USD trades converted at the rate saved with each trade)`,
    sections,
  }
}

export function journalTradesCsv(trades: Trade[], settings: JournalSettings) {
  return {
    filename: 'trading-journal',
    columns: [
      'Date', 'Time', 'Instrument', 'Symbol', 'Direction', 'Currency', 'FX rate', 'Quantity', 'Entry', 'Exit', 'Stop loss',
      'Gross P&L', 'Fees', 'Net P&L (INR)', 'Tax (INR)', 'After tax (INR)', 'Strategy', 'Emotion', 'Followed plan', 'Rating', 'Mistakes', 'Notes',
    ],
    rows: trades.map((t) => {
      const net = netInr(t)
      const tax = taxOn([t], settings)
      return [
        t.date, t.time, t.instrument, t.symbol, t.direction, t.currency, fxOf(t), t.qty, t.entry ?? '', t.exit ?? '', t.stopLoss ?? '',
        t.grossPnl, t.fees, Math.round(net * 100) / 100, Math.round(tax * 100) / 100, Math.round((net - tax) * 100) / 100,
        t.strategy, t.emotion, t.followedPlan === null ? '' : t.followedPlan ? 'Yes' : 'No', t.rating || '', t.mistakes.join('; '), t.notes,
      ]
    }),
  }
}
