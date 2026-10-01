// The childhood immunisation schedule recommended by the Indian Academy of Pediatrics (IAP), as due dates from the
// date of birth. It's a planning aid: the paediatrician's advice and the vaccine card take precedence.

export interface VaccineDose {
  code: string
  name: string
  /** Age when due, in days from birth. */
  days: number
  /** Label for the age, e.g. "6 weeks". */
  age: string
  note?: string
}

const W = 7
const M = 30.44
const Y = 365.25
const at = (days: number) => Math.round(days)

export const IAP_SCHEDULE: VaccineDose[] = [
  { code: 'bcg', name: 'BCG', days: 0, age: 'Birth' },
  { code: 'opv0', name: 'OPV 0', days: 0, age: 'Birth' },
  { code: 'hepb1', name: 'Hepatitis B 1', days: 0, age: 'Birth' },
  ...[['1', 6], ['2', 10], ['3', 14]].flatMap(([n, w]) => {
    const days = at(Number(w) * W)
    const age = `${w} weeks`
    return [
      { code: `dtp${n}`, name: `DTwP / DTaP ${n}`, days, age },
      { code: `ipv${n}`, name: `IPV ${n}`, days, age },
      { code: `hib${n}`, name: `Hib ${n}`, days, age },
      { code: `hepb${Number(n) + 1}`, name: `Hepatitis B ${Number(n) + 1}`, days, age },
      { code: `rota${n}`, name: `Rotavirus ${n}`, days, age },
      { code: `pcv${n}`, name: `PCV ${n}`, days, age },
    ]
  }),
  { code: 'flu1', name: 'Influenza 1', days: at(6 * M), age: '6 months' },
  { code: 'flu2', name: 'Influenza 2', days: at(7 * M), age: '7 months', note: 'Four weeks after the first dose' },
  { code: 'tcv', name: 'Typhoid conjugate', days: at(6 * M + 14), age: '6–9 months' },
  { code: 'mmr1', name: 'MMR 1', days: at(9 * M), age: '9 months' },
  { code: 'hepa1', name: 'Hepatitis A 1', days: at(12 * M), age: '12 months' },
  { code: 'mmr2', name: 'MMR 2', days: at(15 * M), age: '15 months' },
  { code: 'var1', name: 'Varicella 1', days: at(15 * M), age: '15 months' },
  { code: 'pcvb', name: 'PCV booster', days: at(15 * M), age: '15 months' },
  { code: 'dtpb1', name: 'DTwP / DTaP booster 1', days: at(16 * M), age: '16–18 months' },
  { code: 'ipvb', name: 'IPV booster', days: at(16 * M), age: '16–18 months' },
  { code: 'hibb', name: 'Hib booster', days: at(16 * M), age: '16–18 months' },
  { code: 'hepa2', name: 'Hepatitis A 2', days: at(18 * M), age: '18–19 months', note: 'For the inactivated vaccine' },
  { code: 'var2', name: 'Varicella 2', days: at(18 * M), age: '18–19 months' },
  ...[2, 3, 4, 5].map((y) => ({ code: `fluy${y}`, name: `Influenza (yearly)`, days: at(y * Y), age: `${y} years`, note: 'Every year until 5, before the monsoon' })),
  { code: 'dtpb2', name: 'DTwP / DTaP booster 2', days: at(4 * Y), age: '4–6 years' },
  { code: 'ipvb2', name: 'IPV / OPV booster', days: at(4 * Y), age: '4–6 years' },
  { code: 'mmr3', name: 'MMR 3', days: at(4 * Y), age: '4–6 years' },
  { code: 'tdap', name: 'Tdap', days: at(10 * Y), age: '10–12 years' },
  { code: 'hpv1', name: 'HPV 1', days: at(9 * Y), age: '9–14 years' },
  { code: 'hpv2', name: 'HPV 2', days: at(9 * Y + 6 * M), age: '6 months after HPV 1' },
]

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export type DoseStatus = 'given' | 'overdue' | 'due' | 'upcoming'
export interface PlannedDose extends VaccineDose {
  due: string
  status: DoseStatus
  givenOn?: string
}

/** The schedule for a child, with each dose's due date and status (due = within the next 14 days). */
export function childSchedule(dob: string, given: Record<string, string>, today: string): PlannedDose[] {
  return IAP_SCHEDULE.map((d) => {
    const due = addDays(dob, d.days)
    const givenOn = given[d.code]
    const status: DoseStatus = givenOn ? 'given' : due < today ? 'overdue' : due <= addDays(today, 14) ? 'due' : 'upcoming'
    return { ...d, due, status, givenOn }
  })
}

/** Doses to remind about this morning: due in 7 days, 1 day, today, or overdue (weekly nudge, on Mondays). */
export function vaccineAlerts(children: { id: string; name: string; dob: string }[], vaccines: Record<string, Record<string, string>>, today: string) {
  const out: { tag: string; title: string; body: string; url: string }[] = []
  const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1
  for (const c of children) {
    const plan = childSchedule(c.dob, vaccines[c.id] ?? {}, today).filter((d) => d.status !== 'given')
    const soon = plan.filter((d) => [addDays(today, 7), addDays(today, 1), today].includes(d.due))
    const overdue = plan.filter((d) => d.status === 'overdue' && d.due >= addDays(c.dob, 0))
    if (soon.length) {
      const when = soon[0].due === today ? 'today' : soon[0].due === addDays(today, 1) ? 'tomorrow' : 'in 7 days'
      out.push({ tag: `vax-${c.id}-${soon[0].due}`, title: `💉 ${c.name}’s vaccines ${when}`, body: soon.filter((d) => d.due === soon[0].due).map((d) => d.name).join(', '), url: '/reminders' })
    }
    if (monday && overdue.length) out.push({ tag: `vax-overdue-${c.id}-${today}`, title: `💉 ${overdue.length} vaccine${overdue.length === 1 ? '' : 's'} pending for ${c.name}`, body: `${overdue.slice(0, 4).map((d) => d.name).join(', ')}${overdue.length > 4 ? '…' : ''} — tick them once given.`, url: '/reminders' })
  }
  return out
}

// ---------- Generic reminders ----------

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export interface Reminder {
  id: string
  title: string
  note: string
  /** Next due date. */
  date: string
  hour: number
  repeat: Repeat
  done: boolean
}

/** The next date after `date` for a repeating reminder. */
export function nextDate(date: string, repeat: Repeat): string {
  const d = new Date(`${date}T00:00:00Z`)
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (repeat === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/** Mark a reminder done: a repeating one moves to its next date, a one-off is closed. */
export function complete(r: Reminder, today: string): Reminder {
  if (r.repeat === 'none') return { ...r, done: true }
  let next = nextDate(r.date, r.repeat)
  while (next <= today) next = nextDate(next, r.repeat)
  return { ...r, date: next }
}

/** Reminders to send this hour: due today (or earlier, still open) at this hour. */
export function reminderAlerts(items: Reminder[], today: string, hour: number) {
  return items
    .filter((r) => !r.done && r.hour === hour && r.date <= today)
    .map((r) => ({ tag: `rem-${r.id}-${r.date}`, title: `⏰ ${r.title}`, body: r.note || (r.date < today ? `Was due ${r.date}` : 'Due now'), url: '/reminders' }))
}
