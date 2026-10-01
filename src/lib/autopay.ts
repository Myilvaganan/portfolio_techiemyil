import type { Loan } from './loans'
import type { Txn } from './statements'

// Did each EMI actually leave the bank? For every installment due in the last five weeks, look for a bank debit of
// about the same amount within three days of the due date. Until a statement covers the date, it's "waiting".

export type AutopayStatus = 'paid' | 'missing' | 'waiting'
export interface AutopayCheck {
  loan: string
  date: string
  amount: number
  status: AutopayStatus
  paidOn?: string
}

const DAY = 86_400_000
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

export function checkAutopay(loans: Loan[], bank: Txn[], today: string): AutopayCheck[] {
  const covered = bank.reduce((m, t) => (t.date > m ? t.date : m), '')
  const out: AutopayCheck[] = []
  for (const l of loans) {
    for (const r of l.schedule) {
      if (r.date > today || r.date < shift(today, -35) || !r.installment) continue
      const hit = bank.find((t) => t.debit > 0 && Math.abs(t.debit - r.installment) <= Math.max(5, r.installment * 0.02) && t.date >= shift(r.date, -3) && t.date <= shift(r.date, 3))
      out.push({
        loan: l.label || l.short,
        date: r.date,
        amount: r.installment,
        status: hit ? 'paid' : covered >= shift(r.date, 3) ? 'missing' : 'waiting',
        paidOn: hit?.date,
      })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}
