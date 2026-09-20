// Options-trade analytics built from a Zerodha Console tradebook export.
// Kite Connect only returns today's orders, so history has to come from Console
// (Reports → Tradebook → F&O → Download CSV).

export interface Fill {
  id: string
  orderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  price: number
  ts: number
  date: string
  time: string
  synthetic?: boolean
}

export interface OptionSymbol {
  underlying: string
  type: 'CE' | 'PE'
  strike: number
  expiry: string
  exactExpiry: boolean
}

export interface RoundTrip {
  id: string
  symbol: string
  underlying: string
  type: 'CE' | 'PE'
  strike: number
  expiry: string
  exactExpiry: boolean
  direction: 'LONG' | 'SHORT'
  qty: number
  entryPrice: number
  exitPrice: number
  openTs: number
  closeTs: number
  openDate: string
  closeDate: string
  openTime: string
  pnl: number
  holdMin: number
  expired: boolean
}

export interface OpenPosition {
  symbol: string
  side: 'BUY' | 'SELL'
  qty: number
  avgPrice: number
}

export interface ChargeRates {
  brokeragePerOrder: number
  brokeragePct: number
  sttSellPct: number
  exchangePct: number
  sebiPerCrore: number
  gstPct: number
  stampBuyPct: number
}

// Estimates only — rates change; adjust them in the UI to match your contract notes.
export const DEFAULT_CHARGE_RATES: ChargeRates = {
  brokeragePerOrder: 20,
  brokeragePct: 0.03,
  sttSellPct: 0.1,
  exchangePct: 0.03503,
  sebiPerCrore: 10,
  gstPct: 18,
  stampBuyPct: 0.003,
}

export interface ChargeItem {
  date: string
  underlying: string
  brokerage: number
  stt: number
  exchange: number
  sebi: number
  gst: number
  stamp: number
  total: number
}

// ---------- Symbols ----------

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}
const WEEKLY_MONTH: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, O: 10, N: 11, D: 12 }

const OPTION_RE = /^([A-Z&-]+?)(\d{2})(?:([A-Z]{3})|([1-9OND])(\d{2}))(\d+(?:\.\d+)?)(CE|PE)$/

const pad = (n: number) => String(n).padStart(2, '0')

// Weekly symbols carry the exact expiry day. Monthly ones don't, so the last day of the month is used.
export function parseOptionSymbol(symbol: string): OptionSymbol | null {
  const m = OPTION_RE.exec(symbol.trim().toUpperCase())
  if (!m) return null
  const [, underlying, yy, mon, wMon, wDay, strike, type] = m
  const year = 2000 + Number(yy)
  if (mon) {
    const month = MONTHS[mon]
    if (!month) return null
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return { underlying, type: type as 'CE' | 'PE', strike: Number(strike), expiry: `${year}-${pad(month)}-${pad(last)}`, exactExpiry: false }
  }
  const month = WEEKLY_MONTH[wMon]
  return { underlying, type: type as 'CE' | 'PE', strike: Number(strike), expiry: `${year}-${pad(month)}-${wDay}`, exactExpiry: true }
}

// ---------- CSV import ----------

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'tradingsymbol', 'scrip', 'instrument'],
  date: ['trade_date', 'date', 'tradedate'],
  side: ['trade_type', 'type', 'buy/sell', 'side', 'transaction_type'],
  qty: ['quantity', 'qty'],
  price: ['price', 'trade_price', 'average_price'],
  tradeId: ['trade_id', 'tradeid'],
  orderId: ['order_id', 'orderid'],
  time: ['order_execution_time', 'execution_time', 'trade_time', 'time'],
}

function parseTimestamp(dateCell: string, timeCell: string): { ts: number; date: string; time: string } | null {
  const source = /\d{4}-\d{2}-\d{2}/.test(timeCell) ? timeCell : `${dateCell} ${timeCell}`
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(source.trim() || dateCell)
  if (!m) return null
  const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m
  return {
    ts: Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
    date: `${y}-${mo}-${d}`,
    time: `${hh}:${mm}:${ss}`,
  }
}

export interface ParseResult {
  fills: Fill[]
  optionRows: number
  ignoredRows: number
  error?: string
}

export function parseTradebookCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { fills: [], optionRows: 0, ignoredRows: 0, error: 'The file is empty.' }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const col: Record<string, number> = {}
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h))
  if (col.symbol < 0 || col.side < 0 || col.qty < 0 || col.price < 0 || (col.date < 0 && col.time < 0)) {
    return { fills: [], optionRows: 0, ignoredRows: 0, error: 'This doesn’t look like a Zerodha Console tradebook (symbol, trade type, quantity, price and date columns are needed).' }
  }

  const fills: Fill[] = []
  let ignoredRows = 0
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line)
    const symbol = (cells[col.symbol] ?? '').toUpperCase()
    if (!parseOptionSymbol(symbol)) {
      ignoredRows++
      return
    }
    const sideText = (cells[col.side] ?? '').toLowerCase()
    const qty = Number(cells[col.qty])
    const price = Number(cells[col.price])
    const when = parseTimestamp(cells[col.date] ?? '', cells[col.time] ?? '')
    if (!(qty > 0) || !(price >= 0) || !when || !/^(buy|sell)/.test(sideText)) {
      ignoredRows++
      return
    }
    const tradeId = cells[col.tradeId] || `row${i}`
    fills.push({
      id: tradeId,
      orderId: cells[col.orderId] || `t${tradeId}`,
      symbol,
      side: sideText.startsWith('buy') ? 'BUY' : 'SELL',
      qty,
      price,
      ...when,
    })
  })
  return { fills, optionRows: fills.length, ignoredRows }
}

export function mergeFills(existing: Fill[], incoming: Fill[]): Fill[] {
  const seen = new Set(existing.map((f) => `${f.id}|${f.symbol}|${f.ts}`))
  const merged = [...existing]
  for (const f of incoming) {
    const key = `${f.id}|${f.symbol}|${f.ts}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(f)
    }
  }
  return merged.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
}

// ---------- Matching fills into round trips ----------

interface Lot {
  side: 'BUY' | 'SELL'
  qty: number
  price: number
}

interface Cycle {
  direction: 'LONG' | 'SHORT'
  openTs: number
  openDate: string
  openTime: string
  pnl: number
  openedQty: number
  entryValue: number
  exitQty: number
  exitValue: number
  expired: boolean
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

// A round trip runs from flat to flat on one contract, so scaling in/out counts as one trade.
export function buildRoundTrips(fills: Fill[], asOf: string): { trips: RoundTrip[]; open: OpenPosition[] } {
  const bySymbol = new Map<string, Fill[]>()
  for (const f of fills) bySymbol.set(f.symbol, [...(bySymbol.get(f.symbol) ?? []), f])

  const trips: RoundTrip[] = []
  const open: OpenPosition[] = []

  for (const [symbol, list] of bySymbol) {
    const meta = parseOptionSymbol(symbol)
    if (!meta) continue
    const sorted = [...list].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id))
    const lots: Lot[] = []
    let cycle: Cycle | null = null
    let seq = 0

    const finish = (ts: number, date: string) => {
      if (!cycle) return
      const c = cycle
      trips.push({
        id: `${symbol}#${++seq}`,
        symbol,
        underlying: meta.underlying,
        type: meta.type,
        strike: meta.strike,
        expiry: meta.expiry,
        exactExpiry: meta.exactExpiry,
        direction: c.direction,
        qty: c.openedQty,
        entryPrice: c.openedQty ? c.entryValue / c.openedQty : 0,
        exitPrice: c.exitQty ? c.exitValue / c.exitQty : 0,
        openTs: c.openTs,
        closeTs: ts,
        openDate: c.openDate,
        closeDate: date,
        openTime: c.openTime,
        pnl: c.pnl,
        holdMin: Math.max(0, Math.round((ts - c.openTs) / 60_000)),
        expired: c.expired,
      })
      cycle = null
    }

    const apply = (f: Fill, expired = false) => {
      let remaining = f.qty
      while (remaining > 0) {
        if (!lots.length || lots[0].side === f.side) {
          lots.push({ side: f.side, qty: remaining, price: f.price })
          cycle ??= {
            direction: f.side === 'BUY' ? 'LONG' : 'SHORT',
            openTs: f.ts,
            openDate: f.date,
            openTime: f.time,
            pnl: 0,
            openedQty: 0,
            entryValue: 0,
            exitQty: 0,
            exitValue: 0,
            expired,
          }
          cycle.openedQty += remaining
          cycle.entryValue += remaining * f.price
          remaining = 0
        } else {
          const lot = lots[0]
          const matched = Math.min(lot.qty, remaining)
          const c = cycle!
          c.pnl += (lot.side === 'BUY' ? f.price - lot.price : lot.price - f.price) * matched
          c.exitQty += matched
          c.exitValue += matched * f.price
          if (expired) c.expired = true
          lot.qty -= matched
          remaining -= matched
          if (lot.qty === 0) lots.shift()
          if (!lots.length) finish(f.ts, f.date)
        }
      }
    }

    sorted.forEach((f) => apply(f))

    if (lots.length) {
      const side = lots[0].side
      const qty = lots.reduce((s, l) => s + l.qty, 0)
      if (meta.expiry < asOf) {
        const ts = Date.parse(`${meta.expiry}T15:30:00Z`)
        apply({ id: `${symbol}-expiry`, orderId: '', symbol, side: side === 'BUY' ? 'SELL' : 'BUY', qty, price: 0, ts, date: meta.expiry, time: '15:30:00', synthetic: true }, true)
      } else {
        const value = lots.reduce((s, l) => s + l.qty * l.price, 0)
        open.push({ symbol, side, qty, avgPrice: qty ? value / qty : 0 })
      }
    }
  }
  trips.sort((a, b) => a.closeTs - b.closeTs)
  return { trips, open }
}

// ---------- Charges ----------

export function estimateCharges(fills: Fill[], rates: ChargeRates = DEFAULT_CHARGE_RATES): ChargeItem[] {
  const orders = new Map<string, Fill[]>()
  for (const f of fills.filter((x) => !x.synthetic)) {
    const key = f.orderId || `f${f.id}`
    orders.set(key, [...(orders.get(key) ?? []), f])
  }
  const items: ChargeItem[] = []
  for (const group of orders.values()) {
    const first = group[0]
    const meta = parseOptionSymbol(first.symbol)
    const turnover = group.reduce((s, f) => s + f.qty * f.price, 0)
    const sellTurnover = group.filter((f) => f.side === 'SELL').reduce((s, f) => s + f.qty * f.price, 0)
    const buyTurnover = turnover - sellTurnover
    const brokerage = Math.min(rates.brokeragePerOrder, (turnover * rates.brokeragePct) / 100)
    const stt = (sellTurnover * rates.sttSellPct) / 100
    const exchange = (turnover * rates.exchangePct) / 100
    const sebi = (turnover / 1e7) * rates.sebiPerCrore
    const gst = ((brokerage + exchange + sebi) * rates.gstPct) / 100
    const stamp = (buyTurnover * rates.stampBuyPct) / 100
    items.push({
      date: first.date,
      underlying: meta?.underlying ?? '',
      brokerage,
      stt,
      exchange,
      sebi,
      gst,
      stamp,
      total: brokerage + stt + exchange + sebi + gst + stamp,
    })
  }
  return items
}

// ---------- Analytics ----------

export interface Slice {
  key: string
  trades: number
  wins: number
  pnl: number
}

export interface DayPnl {
  date: string
  gross: number
  charges: number
  net: number
  trades: number
}

export interface Analytics {
  trades: number
  wins: number
  losses: number
  winRate: number
  gross: number
  charges: number
  net: number
  chargeParts: { brokerage: number; stt: number; exchange: number; sebi: number; gst: number; stamp: number }
  avgWin: number
  avgLoss: number
  payoff: number | null
  profitFactor: number | null
  expectancy: number
  largestWin: RoundTrip | null
  largestLoss: RoundTrip | null
  maxWinStreak: number
  maxLossStreak: number
  days: DayPnl[]
  equity: { date: string; cum: number }[]
  maxDrawdown: { amount: number; from: string; to: string }
  bestDay: DayPnl | null
  worstDay: DayPnl | null
  topWins: RoundTrip[]
  topLosses: RoundTrip[]
  breakdowns: Record<'underlying' | 'type' | 'direction' | 'weekday' | 'entryHour' | 'dte' | 'hold', Slice[]>
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DTE_ORDER = ['0 DTE (expiry day)', '1 DTE', '2–3 DTE', '4–7 DTE', '8+ DTE', 'Unknown']
const HOLD_ORDER = ['Under 5 min', '5–30 min', '30 min–2 hr', 'Rest of day', 'Overnight+']

function dteBucket(t: RoundTrip) {
  if (!t.exactExpiry) return 'Unknown'
  const d = dayDiff(t.openDate, t.expiry)
  return d <= 0 ? DTE_ORDER[0] : d === 1 ? DTE_ORDER[1] : d <= 3 ? DTE_ORDER[2] : d <= 7 ? DTE_ORDER[3] : DTE_ORDER[4]
}

function holdBucket(t: RoundTrip) {
  if (t.closeDate !== t.openDate) return HOLD_ORDER[4]
  return t.holdMin < 5 ? HOLD_ORDER[0] : t.holdMin < 30 ? HOLD_ORDER[1] : t.holdMin < 120 ? HOLD_ORDER[2] : HOLD_ORDER[3]
}

function group(trips: RoundTrip[], keyOf: (t: RoundTrip) => string, order?: string[]): Slice[] {
  const map = new Map<string, Slice>()
  for (const t of trips) {
    const key = keyOf(t)
    const s = map.get(key) ?? { key, trades: 0, wins: 0, pnl: 0 }
    s.trades++
    s.pnl += t.pnl
    if (t.pnl > 0) s.wins++
    map.set(key, s)
  }
  const slices = [...map.values()]
  if (order) return slices.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return slices.sort((a, b) => b.pnl - a.pnl)
}

export function analyze(trips: RoundTrip[], charges: ChargeItem[]): Analytics {
  const sorted = [...trips].sort((a, b) => a.closeTs - b.closeTs)
  const wins = sorted.filter((t) => t.pnl > 0)
  const losses = sorted.filter((t) => t.pnl < 0)
  const gross = sorted.reduce((s, t) => s + t.pnl, 0)
  const parts = { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0 }
  for (const c of charges) for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] += c[k]
  const chargeTotal = charges.reduce((s, c) => s + c.total, 0)

  const dayMap = new Map<string, DayPnl>()
  const day = (date: string) => {
    let d = dayMap.get(date)
    if (!d) dayMap.set(date, (d = { date, gross: 0, charges: 0, net: 0, trades: 0 }))
    return d
  }
  for (const t of sorted) {
    const d = day(t.closeDate)
    d.gross += t.pnl
    d.trades++
  }
  for (const c of charges) day(c.date).charges += c.total
  const days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  days.forEach((d) => (d.net = d.gross - d.charges))

  let cum = 0
  let peak = 0
  let peakDate = days[0]?.date ?? ''
  const maxDrawdown = { amount: 0, from: '', to: '' }
  const equity = days.map((d) => {
    cum += d.net
    if (cum > peak) {
      peak = cum
      peakDate = d.date
    }
    if (peak - cum > maxDrawdown.amount) Object.assign(maxDrawdown, { amount: peak - cum, from: peakDate, to: d.date })
    return { date: d.date, cum }
  })

  let winStreak = 0
  let lossStreak = 0
  let maxWin = 0
  let maxLoss = 0
  for (const t of sorted) {
    winStreak = t.pnl > 0 ? winStreak + 1 : 0
    lossStreak = t.pnl < 0 ? lossStreak + 1 : 0
    maxWin = Math.max(maxWin, winStreak)
    maxLoss = Math.max(maxLoss, lossStreak)
  }

  const grossWins = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLosses = -losses.reduce((s, t) => s + t.pnl, 0)
  const avgWin = wins.length ? grossWins / wins.length : 0
  const avgLoss = losses.length ? grossLosses / losses.length : 0
  const byPnl = [...sorted].sort((a, b) => b.pnl - a.pnl)
  const byNet = [...days].sort((a, b) => b.net - a.net)

  return {
    trades: sorted.length,
    wins: wins.length,
    losses: losses.length,
    winRate: sorted.length ? (wins.length / sorted.length) * 100 : 0,
    gross,
    charges: chargeTotal,
    net: gross - chargeTotal,
    chargeParts: parts,
    avgWin,
    avgLoss,
    payoff: avgLoss ? avgWin / avgLoss : null,
    profitFactor: grossLosses ? grossWins / grossLosses : null,
    expectancy: sorted.length ? gross / sorted.length : 0,
    largestWin: byPnl[0] && byPnl[0].pnl > 0 ? byPnl[0] : null,
    largestLoss: byPnl.at(-1) && byPnl.at(-1)!.pnl < 0 ? byPnl.at(-1)! : null,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    days,
    equity,
    maxDrawdown,
    bestDay: byNet[0] ?? null,
    worstDay: byNet.at(-1) ?? null,
    topWins: byPnl.filter((t) => t.pnl > 0).slice(0, 5),
    topLosses: byPnl.filter((t) => t.pnl < 0).slice(-5).reverse(),
    breakdowns: {
      underlying: group(sorted, (t) => t.underlying),
      type: group(sorted, (t) => (t.type === 'CE' ? 'Calls (CE)' : 'Puts (PE)')),
      direction: group(sorted, (t) => (t.direction === 'LONG' ? 'Buying options' : 'Selling options')),
      weekday: group(sorted, (t) => WEEKDAYS[new Date(`${t.openDate}T00:00:00Z`).getUTCDay()], WEEKDAYS.slice(1).concat('Sun')).filter((s) => s.key !== 'Sat'),
      entryHour: group(sorted, (t) => `${t.openTime.slice(0, 2)}:00`, Array.from({ length: 24 }, (_, h) => `${pad(h)}:00`)),
      dte: group(sorted, dteBucket, DTE_ORDER),
      hold: group(sorted, holdBucket, HOLD_ORDER),
    },
  }
}

export interface Insight {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}

const MIN_SLICE_TRADES = 5

const money = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`

export function buildInsights(a: Analytics): Insight[] {
  if (!a.trades) return []
  const out: Insight[] = []
  const labelled: [string, Slice][] = []
  const names: Record<string, string> = {
    underlying: 'Trading',
    type: 'Trading',
    direction: '',
    weekday: 'Trading on',
    entryHour: 'Entering at',
    dte: 'Trading at',
    hold: 'Holding for',
  }
  for (const [name, slices] of Object.entries(a.breakdowns)) {
    if (slices.length < 2) continue
    for (const s of slices) if (s.trades >= MIN_SLICE_TRADES && s.key !== 'Unknown') labelled.push([name, s])
  }
  const phrase = (name: string, s: Slice) => `${names[name] ? `${names[name]} ` : ''}${s.key}`.trim()
  const worst = [...labelled].sort((x, y) => x[1].pnl - y[1].pnl)[0]
  const best = [...labelled].sort((x, y) => y[1].pnl - x[1].pnl)[0]
  if (worst && worst[1].pnl < 0) {
    out.push({ tone: 'bad', text: `Biggest leak: ${phrase(...worst)} — ${money(worst[1].pnl)} lost over ${worst[1].trades} trades (${Math.round((worst[1].wins / worst[1].trades) * 100)}% win rate).` })
  }
  if (best && best[1].pnl > 0) {
    out.push({ tone: 'good', text: `Your edge: ${phrase(...best)} — ${money(best[1].pnl)} made over ${best[1].trades} trades (${Math.round((best[1].wins / best[1].trades) * 100)}% win rate).` })
  }
  if (a.charges > 0) {
    const share = a.gross > 0 ? `${Math.round((a.charges / a.gross) * 100)}% of your gross profit` : 'on top of a gross loss'
    out.push({ tone: a.gross > 0 && a.charges / a.gross < 0.25 ? 'neutral' : 'bad', text: `Estimated charges were ${money(a.charges)} — ${share}.` })
  }
  if (a.payoff !== null) {
    out.push({
      tone: a.payoff >= 1 ? 'good' : 'neutral',
      text: `Winners average ${money(a.avgWin)} vs losers ${money(a.avgLoss)} (payoff ${a.payoff.toFixed(2)}). With a ${a.winRate.toFixed(0)}% win rate you need a payoff above ${((100 - a.winRate) / Math.max(a.winRate, 1)).toFixed(2)} to break even before charges.`,
    })
  }
  if (a.maxLossStreak >= 4) out.push({ tone: 'bad', text: `Longest losing streak: ${a.maxLossStreak} trades in a row.` })
  return out
}
