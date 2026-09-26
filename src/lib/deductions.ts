// Tax-saving deductions spotted in bank debits for one financial year. This is detection from statement text,
// not proof: employer-deducted PF/NPS never shows in your bank, and a debit can be the wrong policy. Verify against receipts.

import type { Txn } from './statements'
import { fyOf } from './tax'

// Review these every Budget. Deductions apply under the old tax regime only.
export const LIMIT_80C = 150_000
export const LIMIT_80D_SELF = 25_000
export const LIMIT_80D_PARENTS = 25_000
export const LIMIT_80D_PARENTS_SENIOR = 50_000
export const LIMIT_NPS_80CCD_1B = 50_000

export type DeductionId = 'lic' | 'ppf' | 'elss' | 'tuition' | 'homeLoan' | 'health' | 'nps'

export interface DeductionLine {
  id: DeductionId
  label: string
  section: '80C' | '80D' | '80CCD(1B)'
  amount: number
  count: number
}

const RULES: { id: DeductionId; label: string; section: DeductionLine['section']; test: RegExp }[] = [
  { id: 'health', label: 'Health insurance premium', section: '80D', test: /health|mediclaim|medical insurance|star health|care health|niva bupa|max bupa|manipal ?cigna|aditya birla health/ },
  { id: 'lic', label: 'Life insurance premium (LIC and others)', section: '80C', test: /\blic\b|life insurance|hdfc life|sbi life|max life|icici pru\w* life|tata aia|bajaj allianz life|kotak life|policy premium/ },
  { id: 'ppf', label: 'PPF', section: '80C', test: /\bppf\b|public provident/ },
  { id: 'elss', label: 'ELSS / tax-saver funds', section: '80C', test: /\belss\b|tax saver|tax saving fund|tax ?relief/ },
  { id: 'nps', label: 'NPS (extra 80CCD(1B))', section: '80CCD(1B)', test: /\bnps\b|national pension|protean|nps trust/ },
  { id: 'tuition', label: 'Tuition fees (children)', section: '80C', test: /tuition|school fee|college fee|school fees|\bfees?\b.*(school|college|university)|(school|college|university).*\bfees?\b/ },
]

export interface DeductionOptions {
  /** Principal repaid on a home loan in the year (from the loan schedule), if known. */
  homeLoanPrincipal?: number
}

export interface DeductionSection {
  section: '80C' | '80D' | '80CCD(1B)'
  label: string
  found: number
  limit: number
  counted: number
  headroom: number
  lines: DeductionLine[]
}

export function detectDeductions(txns: Txn[], fy: string, opts: DeductionOptions = {}): DeductionSection[] {
  const lines = new Map<DeductionId, DeductionLine>()
  for (const t of txns) {
    if (!(t.debit > 0) || fyOf(t.date) !== fy) continue
    const text = `${t.merchant} ${t.description}`.toLowerCase()
    const rule = RULES.find((r) => r.test.test(text))
    if (!rule) continue
    const line = lines.get(rule.id) ?? { id: rule.id, label: rule.label, section: rule.section, amount: 0, count: 0 }
    line.amount += t.debit
    line.count++
    lines.set(rule.id, line)
  }
  if (opts.homeLoanPrincipal && opts.homeLoanPrincipal > 0) lines.set('homeLoan', { id: 'homeLoan', label: 'Home-loan principal repaid', section: '80C', amount: opts.homeLoanPrincipal, count: 0 })

  const of = (section: DeductionLine['section']) => [...lines.values()].filter((l) => l.section === section).map((l) => ({ ...l, amount: Math.round(l.amount * 100) / 100 }))
  const build = (section: DeductionLine['section'], label: string, limit: number): DeductionSection => {
    const ls = of(section)
    const found = ls.reduce((s, l) => s + l.amount, 0)
    return { section, label, found, limit, counted: Math.min(found, limit), headroom: Math.max(0, limit - found), lines: ls }
  }
  return [
    build('80C', 'Section 80C', LIMIT_80C),
    build('80D', 'Section 80D (self and family)', LIMIT_80D_SELF),
    build('80CCD(1B)', 'NPS 80CCD(1B)', LIMIT_NPS_80CCD_1B),
  ]
}
