// Turns a broker's tradebook export (CSV or Excel rows) into option fills.
// Every broker names columns and contracts differently, so columns are matched
// by alias and contract names are normalised to the NSE symbol style the
// analytics engine understands (e.g. NIFTY2592524500CE).

import { parseOptionSymbol, type Fill } from './optionsAnalytics'

export type Cell = string | number | boolean | Date | null | undefined

export type FieldKey = 'symbol' | 'underlying' | 'expiry' | 'strike' | 'right' | 'side' | 'qty' | 'price' | 'date' | 'time' | 'tradeId' | 'orderId'

export const FIELDS: { key: FieldKey; label: string; hint?: string }[] = [
  { key: 'symbol', label: 'Contract / symbol', hint: 'e.g. NIFTY25SEP24500CE or NIFTY 25 SEP 2025 24500 CE' },
  { key: 'underlying', label: 'Underlying', hint: 'only if the contract is split across columns' },
  { key: 'expiry', label: 'Expiry date' },
  { key: 'strike', label: 'Strike price' },
  { key: 'right', label: 'Call / put', hint: 'CE, PE, Call or Put' },
  { key: 'side', label: 'Buy / sell' },
  { key: 'qty', label: 'Quantity', hint: 'in units, not lots' },
  { key: 'price', label: 'Trade price' },
  { key: 'date', label: 'Trade date' },
  { key: 'time', label: 'Trade time' },
  { key: 'tradeId', label: 'Trade ID' },
  { key: 'orderId', label: 'Order ID' },
]

export type Mapping = Partial<Record<FieldKey, number>>

const norm = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const ALIASES: Record<FieldKey, string[]> = {
  symbol: ['symbol', 'tradingsymbol', 'scrip', 'scripname', 'scripsymbol', 'instrument', 'instrumentname', 'contract', 'contractname', 'securityname', 'security', 'stocksymbol', 'symbolname', 'description', 'name'],
  underlying: ['underlying', 'underlyingsymbol', 'underlyingname', 'stockcode', 'stock'],
  expiry: ['expiry', 'expirydate', 'expiryday', 'expdate', 'contractexpiry'],
  strike: ['strike', 'strikeprice', 'strikeprc'],
  right: ['optiontype', 'opttype', 'right', 'cepe', 'callput', 'optionright', 'instrumenttype', 'type'],
  side: ['tradetype', 'buysell', 'side', 'transactiontype', 'action', 'buysellindicator', 'buyorsell', 'bs', 'transaction', 'type'],
  qty: ['quantity', 'qty', 'tradedqty', 'tradedquantity', 'tradequantity', 'filledqty', 'filledquantity', 'executedqty', 'execqty'],
  price: ['tradeprice', 'price', 'avgprice', 'averageprice', 'rate', 'tradedprice', 'executionprice', 'avgtradeprice', 'tradedrate', 'executedprice'],
  date: ['tradedate', 'date', 'orderdate', 'executiondate', 'tradingdate', 'transactiondate'],
  time: ['orderexecutiontime', 'executiontime', 'tradetime', 'time', 'exchangetime', 'tradetimestamp', 'timestamp', 'datetime', 'executiondatetime', 'tradedatetime', 'ordertime'],
  tradeId: ['tradeid', 'tradeno', 'tradenumber', 'exchangetradeid', 'fillid', 'exchangetradeno'],
  orderId: ['orderid', 'orderno', 'ordernumber', 'exchangeorderid', 'orderref', 'orderrefno', 'exchangeorderno'],
}

// ---------- Cells ----------

const p2 = (n: number) => String(n).padStart(2, '0')

export function cellText(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) {
    if (Number.isNaN(c.getTime())) return ''
    const time = `${p2(c.getUTCHours())}:${p2(c.getUTCMinutes())}:${p2(c.getUTCSeconds())}`
    return c.getUTCFullYear() < 1950 ? time : `${c.getUTCFullYear()}-${p2(c.getUTCMonth() + 1)}-${p2(c.getUTCDate())}T${time}`
  }
  return String(c).trim()
}

const toNumber = (c: Cell): number => {
  if (typeof c === 'number') return c
  const n = Number(cellText(c).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

// ---------- CSV ----------

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

export function csvToRows(text: string): Cell[][] {
  return text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map(splitCsvLine)
}

// ---------- Column detection ----------

function findColumn(headers: string[], field: FieldKey): number[] {
  const hits: number[] = []
  for (const alias of ALIASES[field]) {
    headers.forEach((h, i) => {
      if (h === alias && !hits.includes(i)) hits.push(i)
    })
  }
  return hits
}

const SIDE_RE = /^(buy|sell|b|s|purchase|sale|bought|sold)$/i
const RIGHT_RE = /^(ce|pe|call|put|c|p)$/i

function samplesMatch(rows: Cell[][], col: number, re: RegExp) {
  const values = rows.slice(0, 40).map((r) => cellText(r[col])).filter(Boolean)
  return values.length > 0 && values.filter((v) => re.test(v)).length / values.length >= 0.6
}

export function autoMapping(headerRow: Cell[], dataRows: Cell[][]): Mapping {
  const headers = headerRow.map(norm)
  const mapping: Mapping = {}
  for (const { key } of FIELDS) {
    const candidates = findColumn(headers, key)
    const pick =
      key === 'side'
        ? candidates.find((c) => samplesMatch(dataRows, c, SIDE_RE))
        : key === 'right'
          ? candidates.find((c) => samplesMatch(dataRows, c, RIGHT_RE))
          : candidates[0]
    if (pick !== undefined) mapping[key] = pick
  }
  return mapping
}

export function mappingProblems(m: Mapping): string[] {
  const problems: string[] = []
  const composite = m.underlying !== undefined && m.strike !== undefined && m.right !== undefined && m.expiry !== undefined
  if (m.symbol === undefined && !composite) problems.push('Contract (or underlying + expiry + strike + call/put)')
  if (m.side === undefined) problems.push('Buy / sell')
  if (m.qty === undefined) problems.push('Quantity')
  if (m.price === undefined) problems.push('Trade price')
  if (m.date === undefined && m.time === undefined) problems.push('Trade date')
  return problems
}

// First row that looks like a header (exports often start with title lines).
export function findHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const m = autoMapping(rows[i], rows.slice(i + 1))
    if (mappingProblems(m).length === 0) return i
  }
  return -1
}

// ---------- Dates ----------

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const monthOf = (token: string): number => {
  const t = token.toUpperCase()
  const idx = MONTHS.indexOf(t.slice(0, 3))
  return idx >= 0 && (t.length === 3 || /^(JANUARY|FEBRUARY|MARCH|APRIL|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/.test(t) || t === 'SEPT') ? idx + 1 : 0
}
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

interface Ymd {
  y: number
  m: number
  d: number
}

// Indian exports are day-first; ISO and "25-Sep-2025" are unambiguous.
function parseYmd(text: string): Ymd | null {
  let m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text)
  if (m) return { y: +m[1], m: +m[2], d: +m[3] }
  m = /(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/.exec(text)
  if (m) return { y: fullYear(+m[3]), m: +m[2], d: +m[1] }
  m = /(\d{1,2})[-/. ]?([A-Za-z]{3,9})[-/. ,]*(\d{2,4})/.exec(text)
  if (m && monthOf(m[2])) return { y: fullYear(+m[3]), m: monthOf(m[2]), d: +m[1] }
  return null
}

function parseClock(text: string): string | null {
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?/i.exec(text)
  if (!m) return null
  let h = +m[1]
  if (m[4]) h = (h % 12) + (m[4].toUpperCase() === 'PM' ? 12 : 0)
  return `${p2(h)}:${m[2]}:${m[3] ?? '00'}`
}

interface When {
  ts: number
  date: string
  time: string
  hasTime: boolean
}

function parseWhen(dateCell: string, timeCell: string): When | null {
  const ymd = parseYmd(dateCell) ?? parseYmd(timeCell)
  if (!ymd || ymd.m < 1 || ymd.m > 12 || ymd.d < 1 || ymd.d > 31) return null
  const clock = parseClock(timeCell) ?? parseClock(dateCell)
  const time = clock ?? '00:00:00'
  const [hh, mm, ss] = time.split(':').map(Number)
  return {
    ts: Date.UTC(ymd.y, ymd.m - 1, ymd.d, hh, mm, ss),
    date: `${ymd.y}-${p2(ymd.m)}-${p2(ymd.d)}`,
    time,
    hasTime: clock !== null,
  }
}

// ---------- Contracts ----------

const RIGHTS: Record<string, 'CE' | 'PE'> = { CE: 'CE', CALL: 'CE', PE: 'PE', PUT: 'PE' }
const SHORT_RIGHTS: Record<string, 'CE' | 'PE'> = { ...RIGHTS, C: 'CE', P: 'PE' }
const FILLER = new Set(['OPT', 'OPTIDX', 'OPTSTK', 'OPTFUT', 'OPTCUR', 'FNO', 'FO', 'NFO', 'BFO', 'NSE', 'BSE', 'INDEX', 'OPTION', 'OPTIONS', 'IDX', 'STK', 'EQ', 'FUT'])

function applyIndexAliases(text: string) {
  return text
    .replace(/\bNIFTY\s*BANK\b|\bBANK\s*NIFTY\b/g, 'BANKNIFTY')
    .replace(/\bNIFTY\s*FIN(?:ANCIAL)?\s*(?:SERVICES?)?\b|\bFIN\s*NIFTY\b/g, 'FINNIFTY')
    .replace(/\bNIFTY\s*MID(?:CAP)?\s*(?:SELECT)?\b|\bMIDCAP\s*NIFTY\b/g, 'MIDCPNIFTY')
    .replace(/\bNIFTY\s*50\b/g, 'NIFTY')
}

interface Parts {
  underlying?: string
  type?: 'CE' | 'PE'
  strike?: number
  day?: number
  month?: number
  year?: number
}

function parseContractText(raw: string): Parts | null {
  let text = applyIndexAliases(raw.toUpperCase())
  const parts: Parts = {}

  // A numeric date such as 25-09-2025 or 2025-09-25 is pulled out first so its pieces aren't read as a strike.
  const numeric = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(text)
  if (numeric) {
    const iso = numeric[1] !== undefined
    Object.assign(parts, iso ? { year: +numeric[1], month: +numeric[2], day: +numeric[3] } : { day: +numeric[4], month: +numeric[5], year: +numeric[6] })
    text = text.replace(numeric[0], ' ')
  }

  const tokens = text.match(/[A-Z&]+|\d+(?:\.\d+)?/g) ?? []
  const ri = tokens.findIndex((t) => RIGHTS[t])
  if (ri < 0) return null
  parts.type = RIGHTS[tokens[ri]]
  const isNum = (t?: string) => t !== undefined && /^\d/.test(t)
  const dateLike = (t?: string) => t !== undefined && isNum(t) && ((t.length === 4 && +t >= 2000 && +t <= 2099) || (/^\d{1,2}$/.test(t) && +t >= 1))

  const mi = parts.month ? -1 : tokens.findIndex((t, i) => i !== ri && monthOf(t) > 0)
  if (mi >= 0) parts.month = monthOf(tokens[mi])
  const dateIdx = new Set<number>()
  if (mi >= 0) for (const k of [mi - 1, mi + 1]) if (dateLike(tokens[k])) dateIdx.add(k)

  const si = [ri - 1, ri + 1].find((k) => isNum(tokens[k]) && !dateIdx.has(k)) ?? -1
  if (si >= 0) parts.strike = parseFloat(tokens[si])

  if (mi >= 0) {
    const small: { v: number; before: boolean }[] = []
    tokens.forEach((t, i) => {
      if (!isNum(t) || i === si) return
      const v = parseFloat(t)
      if (t.length === 4 && v >= 2000 && v <= 2099) parts.year = v
      else if (Number.isInteger(v) && v >= 1 && v <= 99) small.push({ v, before: i < mi })
    })
    if (parts.year !== undefined) {
      const day = small.find((x) => x.before && x.v <= 31)
      if (day) parts.day = day.v
    } else {
      const after = small.find((x) => !x.before)
      const before = small.filter((x) => x.before)
      if (after) {
        parts.year = 2000 + after.v
        if (before[0] && before[0].v <= 31) parts.day = before[0].v
      } else if (before.length >= 2 && before[0].v <= 31) {
        parts.day = before[0].v
        parts.year = 2000 + before[1].v
      } else if (before.length === 1) {
        parts.year = 2000 + before[0].v
      }
    }
  }

  const firstBreak = tokens.findIndex((t, i) => isNum(t) || i === mi)
  const nameTokens = tokens.slice(0, firstBreak < 0 ? ri : firstBreak).filter((t) => !FILLER.has(t) && !RIGHTS[t] && !monthOf(t))
  if (nameTokens.length) parts.underlying = nameTokens.join('')
  return parts
}

export interface ContractInput {
  symbol?: string
  underlying?: string
  expiry?: string
  strike?: number
  right?: string
}

// Returns an NSE-style symbol (weekly form when the exact expiry day is known), or null if this isn't an option.
export function normalizeContract(input: ContractInput, refDate: string): string | null {
  // Only a single unbroken token can be trusted as-is; "NIFTY 25 SEP 2025 24500 CE" would otherwise collapse into a wrong strike.
  const direct = input.symbol ? input.symbol.trim().toUpperCase() : ''
  if (direct && !/\s/.test(direct) && parseOptionSymbol(direct)) return direct

  const parts: Parts = (input.symbol ? parseContractText(input.symbol) : null) ?? {}
  if (input.underlying) parts.underlying = applyIndexAliases(input.underlying.toUpperCase()).replace(/[^A-Z&]/g, '') || parts.underlying
  if (input.right && SHORT_RIGHTS[input.right.trim().toUpperCase()]) parts.type = SHORT_RIGHTS[input.right.trim().toUpperCase()]
  if (input.strike !== undefined && Number.isFinite(input.strike)) parts.strike = input.strike
  if (input.expiry) {
    const ymd = parseYmd(input.expiry)
    if (ymd) Object.assign(parts, { day: ymd.d, month: ymd.m, year: ymd.y })
    else {
      const t = /([A-Za-z]{3,9})[-/. ]*(\d{2,4})/.exec(input.expiry)
      if (t && monthOf(t[1])) Object.assign(parts, { month: monthOf(t[1]), year: fullYear(+t[2]), day: undefined })
    }
  }
  if (!parts.underlying || !parts.type || !parts.strike || !parts.month) return null

  const [refY, refM] = refDate.split('-').map(Number)
  const year = parts.year ?? (parts.month < refM ? refY + 1 : refY)
  const yy = p2(year % 100)
  const strike = String(parts.strike)
  const symbol = parts.day
    ? `${parts.underlying}${yy}${'123456789OND'[parts.month - 1]}${p2(parts.day)}${strike}${parts.type}`
    : `${parts.underlying}${yy}${MONTHS[parts.month - 1]}${strike}${parts.type}`
  return parseOptionSymbol(symbol) ? symbol : null
}

// ---------- Rows → fills ----------

export interface ImportResult {
  fills: Fill[]
  optionRows: number
  ignoredRows: number
}

function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function rowsToFills(rows: Cell[][], headerIdx: number, mapping: Mapping): ImportResult {
  const get = (row: Cell[], key: FieldKey) => (mapping[key] === undefined ? '' : cellText(row[mapping[key]!]))
  const parsed: { fill: Omit<Fill, 'ts'> & { ts: number }; hasTime: boolean }[] = []
  let ignoredRows = 0

  for (const row of rows.slice(headerIdx + 1)) {
    if (row.every((c) => cellText(c) === '')) continue
    const when = parseWhen(get(row, 'date'), get(row, 'time'))
    const sideText = get(row, 'side').toLowerCase()
    const qty = mapping.qty === undefined ? NaN : Math.abs(toNumber(row[mapping.qty]))
    const price = mapping.price === undefined ? NaN : toNumber(row[mapping.price])
    if (!when || !(qty > 0) || !(price >= 0) || !/^(b|s|buy|sell|purchase|sale|bought|sold)/.test(sideText)) {
      ignoredRows++
      continue
    }
    const symbol = normalizeContract(
      {
        symbol: get(row, 'symbol') || undefined,
        underlying: get(row, 'underlying') || undefined,
        expiry: get(row, 'expiry') || undefined,
        strike: mapping.strike === undefined ? undefined : toNumber(row[mapping.strike]),
        right: get(row, 'right') || undefined,
      },
      when.date,
    )
    if (!symbol) {
      ignoredRows++
      continue
    }
    parsed.push({
      hasTime: when.hasTime,
      fill: {
        id: get(row, 'tradeId'),
        orderId: get(row, 'orderId'),
        symbol,
        side: /^(b|buy|purchase|bought)/.test(sideText) ? 'BUY' : 'SELL',
        qty,
        price,
        ts: when.ts,
        date: when.date,
        time: when.time,
      },
    })
  }

  // Without a time column, keep the file's order (oldest first) so entries still come before exits.
  if (parsed.length > 1 && parsed.every((p) => !p.hasTime)) {
    if (parsed[0].fill.ts > parsed[parsed.length - 1].fill.ts) parsed.reverse()
    const perDay = new Map<string, number>()
    for (const p of parsed) {
      const n = perDay.get(p.fill.date) ?? 0
      perDay.set(p.fill.date, n + 1)
      p.fill.ts += n
    }
  }

  const seen = new Map<string, number>()
  const fills: Fill[] = parsed.map(({ fill }) => {
    const base = `${fill.symbol}|${fill.side}|${fill.qty}|${fill.price}|${fill.ts}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const id = fill.id || `h${hash(base)}-${n}`
    return { ...fill, id, orderId: fill.orderId || `o${id}` }
  })
  return { fills, optionRows: fills.length, ignoredRows }
}

export interface FileParse {
  rows: Cell[][]
  headerIdx: number
  mapping: Mapping
  problems: string[]
  result?: ImportResult
}

export function analyseRows(rows: Cell[][]): FileParse {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx >= 0) {
    const mapping = autoMapping(rows[headerIdx], rows.slice(headerIdx + 1))
    return { rows, headerIdx, mapping, problems: [], result: rowsToFills(rows, headerIdx, mapping) }
  }
  const guess = rows.findIndex((r) => r.filter((c) => cellText(c)).length >= 3)
  const idx = Math.max(guess, 0)
  const mapping = rows[idx] ? autoMapping(rows[idx], rows.slice(idx + 1)) : {}
  return { rows, headerIdx: idx, mapping, problems: mappingProblems(mapping) }
}

export async function readTradeFile(file: File): Promise<Cell[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readExcelFile } = await import('read-excel-file/browser')
    const sheets = (await readExcelFile(file)) as unknown as { data: Cell[][] }[]
    const withHeader = sheets.find((s) => findHeaderRow(s.data) >= 0)
    return (withHeader ?? sheets[0]).data
  }
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files aren’t supported — open it in Excel and save as .xlsx or .csv.')
  return csvToRows(await file.text())
}
