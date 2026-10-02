// History is read-only (the server enforces the same rule): daily logs can change only today and yesterday.
const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The earliest date that can still be changed, given today (YYYY-MM-DD). */
export const editableFrom = (today: string) => shift(today, -1)
/** Can this day's log still be added to, changed or deleted? */
export const canEditDay = (date: string, today: string) => date >= editableFrom(today) && date <= today
