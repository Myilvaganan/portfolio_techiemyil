export interface Broker {
  id: string
  label: string
  exportHint: string
}

const GENERIC_HINT =
  'Download your F&O trade book (every executed trade with date, contract, buy/sell, quantity and price) from the reports section as CSV or Excel (.xlsx).'

export const BROKERS: Broker[] = [
  {
    id: 'zerodha',
    label: 'Zerodha',
    exportHint: 'Console → Reports → Tradebook → segment F&O → pick a date range → download CSV (Console limits the range, so download several).',
  },
  { id: 'dhan', label: 'Dhan', exportHint: GENERIC_HINT },
  { id: 'icici', label: 'ICICI Direct', exportHint: GENERIC_HINT },
  { id: 'groww', label: 'Groww', exportHint: GENERIC_HINT },
  { id: 'pocketful', label: 'Pocketful (GoPocket)', exportHint: GENERIC_HINT },
  { id: 'indmoney', label: 'INDmoney', exportHint: GENERIC_HINT },
]

export const SAMPLE_BROKER = 'sample'

export function slugifyBroker(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export function brokerLabel(id: string): string {
  const known = BROKERS.find((b) => b.id === id)
  if (known) return known.label
  if (id === SAMPLE_BROKER) return 'Sample'
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function brokerHint(id: string): string {
  return BROKERS.find((b) => b.id === id)?.exportHint ?? GENERIC_HINT
}
