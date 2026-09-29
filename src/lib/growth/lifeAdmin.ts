import type { LifeItem } from '../growthApi'

// Deadlines outside money tracking. Stored items plus India's fixed tax dates, which are computed (never stored) so
// they are always current. Marking a repeating item done moves it to its next due date instead of closing it.

export type Bucket = 'overdue' | 'soon' | 'later' | 'done'

export interface DueItem extends LifeItem {
  daysLeft: number
  bucket: Bucket
  /** Computed tax dates can't be edited or deleted. */
  builtIn: boolean
}

const DAY = 86_400_000
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

export function addMonths(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}

/** The next occurrence of each Indian income-tax deadline on or after `today`. */
export function taxDeadlines(today: string): LifeItem[] {
  const y = Number(today.slice(0, 4))
  const next = (mmdd: string) => (`${y}-${mmdd}` >= today ? `${y}-${mmdd}` : `${y + 1}-${mmdd}`)
  const make = (id: string, title: string, mmdd: string): LifeItem => ({ id, title, category: 'tax', dueDate: next(mmdd), repeatMonths: 12, notes: '', done: false })
  return [
    make('tax-itr', 'Income tax return (ITR) due', '07-31'),
    make('tax-adv1', 'Advance tax — 15% of the year', '06-15'),
    make('tax-adv2', 'Advance tax — 45% of the year', '09-15'),
    make('tax-adv3', 'Advance tax — 75% of the year', '12-15'),
    make('tax-adv4', 'Advance tax — 100% of the year', '03-15'),
  ]
}

export function dueList(items: LifeItem[], today: string, includeTax = true): DueItem[] {
  const all = [...items.map((i) => ({ ...i, builtIn: false })), ...(includeTax ? taxDeadlines(today).map((i) => ({ ...i, builtIn: true })) : [])]
  return all
    .map((i) => {
      const daysLeft = daysBetween(today, i.dueDate)
      const bucket: Bucket = i.done ? 'done' : daysLeft < 0 ? 'overdue' : daysLeft <= 30 ? 'soon' : 'later'
      return { ...i, daysLeft, bucket }
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/** Done: a repeating item rolls to its next due date (past today); a one-off is closed. */
export function complete(item: LifeItem, today: string): LifeItem {
  if (item.repeatMonths > 0) {
    let due = addMonths(item.dueDate, item.repeatMonths)
    while (due <= today) due = addMonths(due, item.repeatMonths)
    return { ...item, dueDate: due, done: false }
  }
  return { ...item, done: true }
}
