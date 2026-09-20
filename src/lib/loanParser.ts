// Reads ICICI loan PDFs (amortization schedule and loan account statement) from their extracted text rows.
// Deterministic on purpose: the layouts are fixed, so no AI is needed and personal details (PAN, phone, address,
// email) are never picked up — only loan numbers, dates and amounts.

import type { LoanEvent, LoanEventType, LoanSummary, ParsedLoanDoc, ParsedStatement, ScheduleRow, StatementDetails } from './loanTypes'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const p2 = (n: number) => String(n).padStart(2, '0')

const money = (s: string) => {
  const negative = /^\(.*\)$/.test(s)
  const n = Number(s.replace(/[(),]/g, ''))
  return negative ? -n : n
}

// "05,Nov,2025" or "19-Sep-25" → 2025-11-05
export function loanDate(day: string, mon: string, year: string): string | null {
  const m = MONTHS.indexOf(mon.slice(0, 3).toUpperCase())
  if (m < 0) return null
  const y = year.length === 2 ? 2000 + Number(year) : Number(year)
  return `${y}-${p2(m + 1)}-${p2(Number(day))}`
}

const clean = (line: string) => line.replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim()

const AMOUNT = String.raw`\(?[\d,]+\.\d{2}\)?`

const SCHEDULE_ROW = new RegExp(
  String.raw`^(\d{1,3}) (\d{1,2}),([A-Za-z]{3}),(\d{4}) (${AMOUNT}) (${AMOUNT}) (${AMOUNT}) ([\d.]+) (${AMOUNT}) (${AMOUNT}) (${AMOUNT})$`,
)

function findAccountNo(lines: string[]): string | null {
  for (const l of lines) {
    const m = /Statement for ([A-Z]{2,8}\d{6,})/.exec(l) ?? /\(INR\)\s*-\s*([A-Z]{2,8}\d{6,})/.exec(l)
    if (m) return m[1]
  }
  for (const l of lines) {
    const m = /\b([A-Z]{3,8}\d{8,})\b/.exec(l)
    if (m) return m[1]
  }
  return null
}

function parseSchedule(lines: string[], accountNo: string): ParsedLoanDoc | null {
  const rows: ScheduleRow[] = []
  for (const line of lines) {
    const m = SCHEDULE_ROW.exec(line)
    if (!m) continue
    const date = loanDate(m[2], m[3], m[4])
    if (!date) continue
    rows.push({
      no: Number(m[1]),
      date,
      opening: money(m[5]),
      principal: money(m[6]),
      installment: money(m[7]),
      ratePct: Number(m[8]),
      interest: money(m[9]),
      charges: money(m[10]),
      closing: money(m[11]),
    })
  }
  if (rows.length < 3) return null
  rows.sort((a, b) => a.no - b.no)
  return { docType: 'schedule', accountNo, rows }
}

const DETAILS_ROW = new RegExp(
  String.raw`(\d{2}-[A-Za-z]{3}-\d{2}) (${AMOUNT}) (${AMOUNT}) ([\d.]+)% ([\d.]+)% (\d+) ?/ ?(${AMOUNT}) (\d+) ?/ ?(${AMOUNT}) (\d+) (${AMOUNT})`,
)

const TYPE_PREFIXES: { prefix: string; type: LoanEventType }[] = [
  { prefix: 'Interest on overdue', type: 'overdue_interest' },
  { prefix: 'Bounce Charge', type: 'bounce_charge' },
  { prefix: 'Other Charge', type: 'other_charge' },
  { prefix: 'Disbursement', type: 'disbursement' },
  { prefix: 'Bounce', type: 'bounce' },
  { prefix: 'Payment', type: 'payout' },
  { prefix: 'Receipt', type: 'receipt' },
  { prefix: 'EMI', type: 'emi_due' },
]

const EVENT_LINE = /^(\d{2}-[A-Za-z]{3}-\d{2}) (\d{2}-[A-Za-z]{3}-\d{2}) (.+)$/

function eventOf(line: string): LoanEvent | null {
  const m = EVENT_LINE.exec(line)
  if (!m) return null
  const [dd, mon, yy] = m[1].split('-')
  const date = loanDate(dd, mon, yy)
  const rest = m[3]
  const found = TYPE_PREFIXES.find((t) => rest.startsWith(t.prefix))
  if (!date || !found) return null
  const amounts = [...rest.matchAll(new RegExp(AMOUNT, 'g'))].map((x) => money(x[0]))
  if (amounts.length === 0) return null
  let type = found.type
  const particulars = rest.slice(found.prefix.length).trim()
  if (type === 'other_charge') type = /^Pf\b|processing/i.test(particulars) ? 'processing_fee' : /penal/i.test(particulars) ? 'penal' : 'other_charge'
  const inst = /Inst\.?\s*(\d+)/i.exec(particulars)
  const event: LoanEvent = { date, type, amount: Math.abs(amounts[0]) }
  if (inst && (type === 'emi_due' || type === 'overdue_interest')) event.instNo = Number(inst[1])
  if (type === 'bounce_charge' || type === 'penal' || type === 'processing_fee') event.note = particulars.replace(new RegExp(AMOUNT, 'g'), '').trim().slice(0, 60)
  return event
}

function parseStatement(lines: string[], accountNo: string): ParsedLoanDoc | null {
  const text = lines.join('\n')
  const rowMatch = lines.map((l) => DETAILS_ROW.exec(l)).find(Boolean)
  if (!rowMatch) return null
  const m = rowMatch
  const [dd, mon, yy] = m[1].split('-')
  const sanctionDate = loanDate(dd, mon, yy)
  if (!sanctionDate) return null

  const pick = (re: RegExp) => re.exec(text)?.[1]?.trim() ?? null
  const asOfRaw = /Loan Account Details As on (\d{2})-([A-Za-z]{3})-(\d{2})/.exec(text)
  const details: StatementDetails = {
    asOf: asOfRaw ? loanDate(asOfRaw[1], asOfRaw[2], asOfRaw[3]) : null,
    sanctionDate,
    amount: money(m[2]),
    advEmi: money(m[3]),
    ratePct: Number(m[4]),
    penalPct: Number(m[5]),
    paidCount: Number(m[6]),
    paidAmount: money(m[7]),
    pendingCount: Number(m[8]),
    pendingAmount: money(m[9]),
    futureCount: Number(m[10]),
    futureAmount: money(m[11]),
    tenure: Number(pick(/Tenure:\s*(\d+)/)) || null,
    emi: Number(pick(/Current EMI:\s*([\d.]+)/)) || null,
    product: pick(/Product:\s*(.+?)(?:\s+Customer Category:|\n|$)/),
    rateType: pick(/Int\. Rate Type:\s*(\w+)/),
    status: pick(/Status:\s*(\w+)/),
    repayment: pick(/Repayment Mode:\s*([A-Z ]+?)(?=\s+A\/C|\n|$)/),
  }

  let summary: LoanSummary | null = null
  const debits = lines.map((l) => new RegExp(String.raw`^Debits((?: ${AMOUNT}){6})$`).exec(l)).find(Boolean)
  const totals = lines.find((l) => new RegExp(String.raw`^${AMOUNT}(?: ${AMOUNT}){7}$`).test(l))
  if (debits && totals) {
    const d = debits[1].trim().split(' ').map(money)
    const t = totals.split(' ').map(money)
    summary = {
      debitPrincipal: d[0],
      debitInterest: d[1],
      debitOverdueInterest: d[2],
      debitBounce: d[3],
      debitOther: d[4],
      debitTotal: d[5],
      currentOs: t[0],
      accruedInterest: t[3],
      accruedOverdue: t[4],
      accruedPenal: t[5],
      futurePrincipal: t[6],
      totalReceivable: t[7],
    }
  }

  // A transaction row can wrap: join it with the next line when its amounts are on the following line.
  const events: LoanEvent[] = []
  let inTransactions = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^Loan Transaction Details/.test(line)) inTransactions = true
    else if (/^Adjustment Entries/.test(line)) inTransactions = false
    if (!inTransactions) continue
    let joined = line
    if (EVENT_LINE.test(line)) {
      for (let k = 1; k <= 2 && !new RegExp(AMOUNT).test(joined) && lines[i + k] && !EVENT_LINE.test(lines[i + k]); k++) joined = `${joined} ${lines[i + k]}`
    }
    const e = eventOf(joined)
    if (e) events.push(e)
  }

  const out: ParsedStatement = { docType: 'statement', accountNo, details, summary, events }
  return out
}

export type LoanParseResult = { ok: true; doc: ParsedLoanDoc } | { ok: false; error: string }

export function parseLoanDocument(rawLines: string[]): LoanParseResult {
  const lines = rawLines.map(clean).filter(Boolean)
  const accountNo = findAccountNo(lines)
  if (!accountNo) return { ok: false, error: 'Couldn’t find a loan account number in this PDF.' }
  const looksLikeSchedule = lines.some((l) => /AMORTI[ZS]ATION SCHEDULE/i.test(l)) || lines.filter((l) => SCHEDULE_ROW.test(l)).length >= 3
  const doc = looksLikeSchedule ? parseSchedule(lines, accountNo) : parseStatement(lines, accountNo)
  if (doc) return { ok: true, doc }
  return { ok: false, error: 'This doesn’t look like an ICICI loan amortization schedule or loan account statement.' }
}
