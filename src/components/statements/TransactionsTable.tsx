import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, FileSpreadsheet, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatInr } from '@/lib/kite'
import { BANK_CATEGORIES, CARD_CATEGORIES, dayLabel, filterTxns, type StatementKind, type Txn } from '@/lib/statements'
import { downloadCsv, fileStamp } from '@/lib/report'
import { Pagination } from '@/components/viz/Pagination'

type SortKey = 'date' | 'amount'

const amountOf = (t: Txn) => (t.debit ? -t.debit : t.credit)

export function TransactionsTable({
  kind,
  txns,
  cardLabels,
  onRecategorize,
}: {
  kind: StatementKind
  txns: Txn[]
  cardLabels?: Record<string, string>
  // Applies the new category to every transaction sharing this merchant (normalised), not just the one clicked.
  onRecategorize?: (merchant: string, category: string) => void
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [direction, setDirection] = useState<'all' | 'debit' | 'credit'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const categories = useMemo(() => [...new Set(txns.map((t) => t.category))].sort(), [txns])
  const rows = useMemo(() => {
    const list = filterTxns(txns, { search, category, direction })
    const factor = sort.dir
    return [...list].sort((a, b) => (sort.key === 'date' ? a.date.localeCompare(b.date) * factor || a.id.localeCompare(b.id) : (Math.abs(amountOf(a)) - Math.abs(amountOf(b))) * factor))
  }, [txns, search, category, direction, sort])

  useEffect(() => setPage(1), [search, category, direction, txns.length])
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * pageSize, current * pageSize)

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }))
  const Arrow = sort.dir === -1 ? ArrowDown : ArrowUp
  const Th = ({ k, children, right }: { k: SortKey; children: string; right?: boolean }) => (
    <th className={cn('py-2 pr-3 font-medium', right && 'text-right')}>
      <button type="button" data-cursor="hover" onClick={() => toggle(k)} className={cn('inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-text', sort.key === k && 'text-accent')}>
        {children}
        {sort.key === k && <Arrow className="h-3 w-3" />}
      </button>
    </th>
  )

  const exportCsv = () =>
    downloadCsv(
      `${kind === 'bank' ? 'bank' : 'card'}-transactions-${fileStamp()}`,
      kind === 'bank' ? ['Date', 'Merchant', 'Description', 'Category', 'Channel', 'Debit', 'Credit', 'Balance'] : ['Date', 'Card', 'Merchant', 'Description', 'Category', 'Type', 'Charge', 'Credit'],
      rows.map((t) => (kind === 'bank' ? [t.date, t.merchant, t.description, t.category, t.channel ?? '', t.debit, t.credit, t.balance ?? ''] : [t.date, cardLabels?.[t.accountKey] ?? '', t.merchant, t.description, t.category, t.type ?? '', t.debit, t.credit])),
    )

  const field = 'rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text outline-none focus:border-accent/50'
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search merchant, description or category…" aria-label="Search transactions" className={cn(field, 'w-full pl-9')} />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={field}>
          <option value="all" className="bg-card">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c} className="bg-card">{c}</option>
          ))}
        </select>
        <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} aria-label="Filter by direction" className={field}>
          <option value="all" className="bg-card">Money in & out</option>
          <option value="debit" className="bg-card">{kind === 'bank' ? 'Money out' : 'Charges'}</option>
          <option value="credit" className="bg-card">{kind === 'bank' ? 'Money in' : 'Payments & refunds'}</option>
        </select>
        <button type="button" data-cursor="hover" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text">
          <FileSpreadsheet className="h-3.5 w-3.5" /> CSV ({rows.length})
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-secondary">
              <Th k="date">Date</Th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wide">Merchant</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wide">Category</th>
              <th className="py-2 pr-3 font-medium uppercase tracking-wide">{kind === 'bank' ? 'Channel' : 'Card'}</th>
              <Th k="amount" right>Amount</Th>
              {kind === 'bank' && <th className="py-2 text-right font-medium uppercase tracking-wide">Balance</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((t, i) => (
              <motion.tr key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.012, 0.25) }} className="border-b border-border/60 transition-colors hover:bg-surface-3">
                <td className="whitespace-nowrap py-2.5 pr-3 text-text-secondary">{dayLabel(t.date)}</td>
                <td className="max-w-64 py-2.5 pr-3">
                  <p className="truncate font-medium text-text">{t.merchant}</p>
                  <p className="truncate text-[11px] text-text-secondary/80">{t.description}</p>
                </td>
                <td className="py-2.5 pr-3">
                  {onRecategorize ? (
                    <select
                      value={t.category}
                      aria-label={`Category for ${t.merchant}`}
                      onChange={(e) => onRecategorize(t.merchant, e.target.value)}
                      className="rounded-full border-none bg-surface-10 px-2 py-0.5 text-[10px] text-text-secondary outline-none focus:ring-1 focus:ring-accent/50"
                    >
                      {(kind === 'bank' ? BANK_CATEGORIES : CARD_CATEGORIES).map((c) => (
                        <option key={c} value={c} className="bg-card">{c}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-surface-10 px-2 py-0.5 text-[10px] text-text-secondary">{t.category}</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-3 text-text-secondary">{kind === 'bank' ? t.channel : (cardLabels?.[t.accountKey] ?? t.type)}</td>
                <td className={cn('whitespace-nowrap py-2.5 pr-3 text-right font-mono font-semibold', t.credit ? 'text-accent' : 'text-text')}>{t.credit ? `+${formatInr(t.credit, 2)}` : `-${formatInr(t.debit, 2)}`}</td>
                {kind === 'bank' && <td className="whitespace-nowrap py-2.5 text-right font-mono text-text-secondary">{typeof t.balance === 'number' ? formatInr(t.balance) : '—'}</td>}
              </motion.tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-10 text-center text-sm text-text-secondary">No transactions match these filters.</p>}
      </div>
      <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1) }} />
    </div>
  )
}
