// Reads a MetaTrader 5 "Trade History Report" (the HTML file from History → right-click → Report) and turns it into
// journal trades plus the account's details. Everything here is pure and runs in the browser — the file is never
// uploaded as-is for parsing; only the extracted data (and a copy of the file for reference) is sent to the server.
//
// The English report layout is a header (Name / Account / Company / Date), then tables: Positions (one row per closed
// position), Orders, Deals (every fill, plus deposits/withdrawals), and a Results summary with the account state.

import { blankTrade, type Trade } from './journal'
import { INSTRUMENTS } from './margin'

export class Mt5ParseError extends Error {}

export interface Mt5Position {
  position: string
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  /** "YYYY-MM-DD HH:mm:ss" in the broker's server time. */
  openTime: string
  openPrice: number
  sl: number | null
  tp: number | null
  closeTime: string
  closePrice: number
  commission: number
  swap: number
  profit: number
}

/** A non-trade money movement from the Deals table: a deposit, withdrawal, credit, charge or correction. */
export interface Mt5BalanceOp {
  time: string
  type: string
  /** Positive = money in, negative = money out. */
  amount: number
  comment: string
  /** Account balance right after this entry. */
  balance: number | null
}

export interface Mt5State {
  balance: number | null
  credit: number | null
  floating: number | null
  equity: number | null
  margin: number | null
  freeMargin: number | null
  marginLevel: number | null
}

export interface Mt5Report {
  name: string
  account: string
  currency: string
  server: string
  accountType: string
  marginMode: string
  company: string
  /** When MetaTrader generated the report, "YYYY-MM-DD HH:mm" (server time). */
  reportTime: string
  positions: Mt5Position[]
  balanceOps: Mt5BalanceOp[]
  state: Mt5State
  /** The broker-reported Results block, label → value as printed (e.g. "Profit Factor" → "0.57"). */
  summary: Record<string, string>
}

// ---------- Decoding ----------

/**
 * MetaTrader writes these reports as UTF-16 (with a byte-order mark) on most builds, but UTF-8 also occurs. Reading a
 * UTF-16 file as UTF-8 yields nothing but spaced-out garbage, so the encoding is detected rather than assumed.
 */
export function decodeReport(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer)
  let encoding = 'utf-8'
  if (b[0] === 0xff && b[1] === 0xfe) encoding = 'utf-16le'
  else if (b[0] === 0xfe && b[1] === 0xff) encoding = 'utf-16be'
  else if (!(b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf)) {
    // No byte-order mark: mostly-NUL odd bytes means UTF-16LE text.
    const n = Math.min(b.length, 400)
    let zeros = 0
    for (let i = 1; i < n; i += 2) if (b[i] === 0) zeros++
    if (zeros > n / 8) encoding = 'utf-16le'
  }
  return new TextDecoder(encoding).decode(buffer)
}

function readBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  // Older browsers (and some test environments) lack Blob.arrayBuffer.
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

export async function readReportFile(file: Blob): Promise<string> {
  return decodeReport(await readBuffer(file))
}

// ---------- Parsing helpers ----------

const TIME_RE = /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}(:\d{2})?$/
const SECTIONS = ['Positions', 'Orders', 'Deals', 'Results']

// The report is full of &nbsp; (non-breaking spaces); fold them and any run of whitespace into one plain space.
const clean = (s: string | null | undefined) => (s ?? '').replace(/[\s\u00a0]+/g, ' ').trim()

/** "2026.09.22 12:12:05" → "2026-09-22 12:12:05" */
const isoTime = (t: string) => t.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3')

function num(text: string | undefined): number | null {
  if (text === undefined) return null
  let t = text.replace(/[\s\u00a0]/g, '').replace(/%$/, '')
  if (t === '' || t === '-') return null
  // MetaTrader separates thousands with a space ("1 234.56"); other locales use commas.
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '')
  else if (t.includes(',')) t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const isTime = (s: string | undefined) => TIME_RE.test(s ?? '')

/** "Label:" cells followed by their value: ['Balance:', '141.57', '', 'Free Margin:', '141.57'] → two pairs. */
function labelPairs(row: string[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < row.length - 1; i++) {
    const label = row[i]
    const value = row[i + 1]
    if (label.length > 1 && label.endsWith(':') && value !== '' && !value.endsWith(':')) pairs.push([label.slice(0, -1).trim(), value])
  }
  return pairs
}

function parseAccountLine(text: string) {
  // "62280161 (USD, OctaFX-Real, real, Hedge)"
  const m = /^(\d+)\s*(?:\(([^)]*)\))?/.exec(text)
  if (!m) return { account: '', currency: '', server: '', accountType: '', marginMode: '' }
  const [currency = '', server = '', accountType = '', marginMode = ''] = (m[2] ?? '').split(',').map((p) => p.trim())
  return { account: m[1], currency, server, accountType, marginMode }
}

// ---------- Parser ----------

export function parseMt5Report(html: string): Mt5Report {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const rows = [...doc.querySelectorAll('tr')].map((tr) =>
    [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH').map((c) => clean(c.textContent)),
  )
  if (rows.length === 0) throw new Mt5ParseError('This file is empty or not an HTML report.')

  const header: Record<string, string> = {}
  for (const row of rows) {
    if (['Name:', 'Account:', 'Company:', 'Date:'].includes(row[0]) && row[1]) header[row[0]] = row[1]
  }

  const acct = parseAccountLine(header['Account:'] ?? '')
  // Fall back to the page title ("62280161: Name - Trade History Report") if the account row is missing.
  const titleMatch = /^(\d+):/.exec(clean(doc.title))
  const account = acct.account || titleMatch?.[1] || ''

  let section = ''
  let sawPositions = false
  const positions = new Map<string, Mt5Position>()
  const balanceOps: Mt5BalanceOp[] = []
  const state: Record<string, string> = {}
  const summary: Record<string, string> = {}

  for (const row of rows) {
    if (row.length === 1 && SECTIONS.includes(row[0])) {
      section = row[0]
      if (section === 'Positions') sawPositions = true
      continue
    }

    if (section === 'Positions' && isTime(row[0]) && /^\d+$/.test(row[1] ?? '')) {
      // Each data row carries a blank spacer cell after the Type column that the header row doesn't show, so a row is
      // 14 cells wide: time, position, symbol, type, (spacer), volume, price, S/L, T/P, time, price, commission, swap,
      // profit. If a build ever leaves the spacer out, put it back so the columns below still line up.
      const c = row.length === 13 ? [...row.slice(0, 4), '', ...row.slice(4)] : row
      const type = (c[3] ?? '').toLowerCase()
      const [openPrice, closePrice, volume, profit] = [num(c[6]), num(c[10]), num(c[5]), num(c[13])]
      if ((type !== 'buy' && type !== 'sell') || !isTime(c[9]) || openPrice === null || closePrice === null || volume === null || profit === null) continue
      positions.set(c[1], {
        position: c[1],
        symbol: c[2],
        type,
        volume,
        openTime: isoTime(c[0]),
        openPrice,
        sl: num(c[7]),
        tp: num(c[8]),
        closeTime: isoTime(c[9]),
        closePrice,
        commission: num(c[11]) ?? 0,
        swap: num(c[12]) ?? 0,
        profit,
      })
      continue
    }

    if (section === 'Deals') {
      if (isTime(row[0]) && /^\d+$/.test(row[1] ?? '') && row.length >= 14) {
        const type = (row[3] ?? '').toLowerCase()
        // Trades are already in Positions; what's left here is money moving in and out of the account.
        if (type !== '' && type !== 'buy' && type !== 'sell') {
          balanceOps.push({ time: isoTime(row[0]), type, amount: num(row[12]) ?? 0, comment: row[14] ?? '', balance: num(row[13]) })
        }
        continue
      }
      for (const [label, value] of labelPairs(row)) state[label] = value
    }

    if (section === 'Results') for (const [label, value] of labelPairs(row)) summary[label] = value
  }

  if (!account) {
    throw new Mt5ParseError('Could not find an account number. Is this a MetaTrader 5 “Trade History Report” (English)?')
  }
  if (!sawPositions) {
    throw new Mt5ParseError('No “Positions” table found. In MetaTrader 5, open the History tab, right-click and choose Report → HTML.')
  }

  return {
    name: header['Name:'] ?? '',
    account,
    currency: acct.currency,
    server: acct.server,
    accountType: acct.accountType,
    marginMode: acct.marginMode,
    company: header['Company:'] ?? '',
    reportTime: header['Date:'] ? isoTime(header['Date:']) : '',
    positions: [...positions.values()].sort((a, b) => a.closeTime.localeCompare(b.closeTime) || a.position.localeCompare(b.position)),
    balanceOps,
    state: {
      balance: num(state['Balance']),
      credit: num(state['Credit Facility']),
      floating: num(state['Floating P/L']),
      equity: num(state['Equity']),
      margin: num(state['Margin']),
      freeMargin: num(state['Free Margin']),
      marginLevel: num(state['Margin Level']),
    },
    summary,
  }
}

// ---------- Report → journal ----------

const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF', 'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'ZAR', 'MXN', 'TRY', 'PLN', 'CNH', 'INR'])

/**
 * The journal's instrument name for an MT5 symbol. Brokers add suffixes ("XAUUSD.m", "BTCUSDm", "US30.cash"), so the
 * match is on the leading letters/digits. Bitcoin maps to "Bitcoin" so the per-instrument tax rule for it applies.
 */
export function instrumentFor(symbol: string): string {
  const base = symbol.toUpperCase().split(/[^A-Z0-9]/)[0]
  if (/^(BTC|XBT)USD/.test(base)) return 'Bitcoin'
  if (/^XAUUSD/.test(base)) return 'XAUUSD'
  if (/^(US30|DJ30|DJI|WS30)/.test(base)) return 'US30'
  if (/^[A-Z]{6}/.test(base) && CURRENCIES.has(base.slice(0, 3)) && CURRENCIES.has(base.slice(3, 6))) return 'Forex'
  return base || symbol
}

/** Units per 1.00 lot, so entry/exit prices reproduce the profit MetaTrader printed (and R-multiples make sense). */
export function contractSizeFor(instrument: string): number {
  if (instrument === 'Bitcoin') return INSTRUMENTS.BITCOIN.contractSize
  if (instrument === 'XAUUSD') return INSTRUMENTS.XAUUSD.contractSize
  if (instrument === 'US30') return INSTRUMENTS.US30.contractSize
  if (instrument === 'Forex') return 100_000
  return 1
}

const round2 = (n: number) => Math.round(n * 100) / 100

const stamp = (t: string) => {
  const [d, h] = [t.slice(0, 10), t.slice(11, 19) || '00:00:00']
  return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), +h.slice(0, 2), +h.slice(3, 5), +h.slice(6, 8))
}

export function holdLabel(openTime: string, closeTime: string): string {
  const mins = Math.max(0, Math.round((stamp(closeTime) - stamp(openTime)) / 60_000))
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`
}

/** The stable id of a position, so uploading the same or an overlapping report again never duplicates trades. */
export const positionTradeId = (account: string, position: string) => `mt5-${account}-${position}`

export function positionsToTrades(report: Mt5Report): Trade[] {
  const label = report.server || 'MT5'
  return report.positions.map((p) => {
    const instrument = instrumentFor(p.symbol)
    const openDate = p.openTime.slice(0, 10)
    const closeDate = p.closeTime.slice(0, 10)
    const overnight = openDate !== closeDate
    // Swap is a running cost or credit that belongs in the result; commission is a cost (a positive one is a rebate).
    const gross = round2(p.profit + p.swap + (p.commission > 0 ? p.commission : 0))
    const fees = p.commission < 0 ? round2(-p.commission) : 0

    const notes = [
      `${label} position ${p.position}.`,
      `Opened ${p.openTime.slice(0, 16)}, closed ${p.closeTime.slice(0, 16)} (server time, held ${holdLabel(p.openTime, p.closeTime)}).`,
      p.swap !== 0 ? `Swap ${p.swap > 0 ? '+' : ''}${p.swap.toFixed(2)}.` : '',
    ]
      .filter(Boolean)
      .join(' ')

    return {
      ...blankTrade(closeDate, report.account),
      id: positionTradeId(report.account, p.position),
      // A trade belongs to the day it was closed and its result realised.
      date: closeDate,
      time: overnight ? '' : p.openTime.slice(11, 16),
      instrument,
      symbol: p.symbol,
      direction: p.type === 'buy' ? 'BUY' : 'SELL',
      currency: 'USD',
      // The account is already in dollars, so amounts stay in dollars: no conversion.
      fxRate: 1,
      qty: p.volume,
      contractSize: contractSizeFor(instrument),
      entry: p.openPrice,
      exit: p.closePrice,
      stopLoss: p.sl && p.sl > 0 ? p.sl : null,
      target: p.tp && p.tp > 0 ? p.tp : null,
      // MetaTrader's own profit figure is the truth; recomputing from prices could drift by cents.
      manualPnl: true,
      grossPnl: gross,
      fees,
      notes,
      source: `mt5:${report.account}`,
    }
  })
}

/** What gets saved about the account itself (the trades go to the journal separately). */
export function accountFromReport(report: Mt5Report) {
  const dates = report.positions.map((p) => p.closeTime.slice(0, 10)).sort()
  return {
    account: report.account,
    name: report.name,
    currency: report.currency,
    server: report.server,
    accountType: report.accountType,
    marginMode: report.marginMode,
    company: report.company,
    ...report.state,
    balanceOps: report.balanceOps,
    summary: report.summary,
    report: { time: report.reportTime, from: dates[0] ?? '', to: dates[dates.length - 1] ?? '', trades: report.positions.length },
  }
}

export type Mt5AccountMeta = ReturnType<typeof accountFromReport> & { updatedAt?: string }
