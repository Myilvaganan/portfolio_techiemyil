import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1])
  const list = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  list.forEach((p, i) => {
    if (i && p - list[i - 1] > 1) out.push('…')
    out.push(p)
  })
  return out
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  sizes = [10, 25, 50, 100],
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize?: (n: number) => void
  sizes?: number[]
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const btn = 'flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs transition-colors'
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary">
      <div className="flex items-center gap-3">
        <span>
          {from}–{to} of {total.toLocaleString('en-IN')}
        </span>
        {onPageSize && (
          <label className="flex items-center gap-1.5">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs text-text outline-none focus:border-accent/50"
            >
              {sizes.map((s) => (
                <option key={s} value={s} className="bg-card">
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button type="button" data-cursor="hover" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className={cn(btn, 'border-border disabled:opacity-40')}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              data-cursor="hover"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
              className={cn(btn, p === page ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border hover:border-accent/40 hover:text-text')}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" data-cursor="hover" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className={cn(btn, 'border-border disabled:opacity-40')}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  )
}
