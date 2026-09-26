import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, HeartPulse, LayoutGrid, Loader2, NotebookPen, Search, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { listDocuments } from '@/lib/adminVault'
import { ALL_ACCOUNTS } from '@/lib/journal'
import { fetchJournal } from '@/lib/journalStore'
import { fetchReports } from '@/lib/healthApi'
import { searchAll, type HitKind, type SearchIndex } from '@/lib/search'

const ICON: Record<HitKind, typeof Search> = { page: LayoutGrid, document: FileText, trade: TrendingUp, note: NotebookPen, health: HeartPulse }
const KIND: Record<HitKind, string> = { page: 'Page', document: 'Document', trade: 'Trade', note: 'Note', health: 'Health' }

/** One box for pages, documents, trades, journal notes and health tests. The index loads the first time the box is focused. */
export function GlobalSearch({ pages }: { pages: SearchIndex['pages'] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function ensureIndex() {
    if (index || loading) return
    setLoading(true)
    const soft = <T,>(p: Promise<T>, empty: T) => p.catch(() => empty)
    const [documents, journal, reports] = await Promise.all([
      soft(listDocuments(), []),
      soft(fetchJournal(undefined, undefined, ALL_ACCOUNTS), null),
      soft(fetchReports(), []),
    ])
    setIndex({ pages, documents, trades: journal?.trades ?? [], notes: journal?.days ?? {}, reports })
    setLoading(false)
  }

  const hits = useMemo(() => searchAll(index ?? { pages, documents: [], trades: [], notes: {}, reports: [] }, query, 12), [index, pages, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  function go(to: string) {
    navigate(to)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hits[active]) go(hits[active].to)
      else if (query.trim()) go(`/admin/documents?q=${encodeURIComponent(query.trim())}`)
    }
  }

  const listId = 'global-search-results'
  return (
    <div ref={boxRef} className="relative hidden max-w-md flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open && query.trim() !== ''}
        aria-controls={listId}
        aria-label="Search everything"
        value={query}
        onFocus={() => {
          setOpen(true)
          void ensureIndex()
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder="Search trades, notes, documents…  ⌘K"
        className="w-full rounded-full border border-border bg-surface-2 py-2.5 pl-10 pr-4 text-sm text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/40"
      />
      {open && query.trim() !== '' && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-2xl">
          {hits.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-text-secondary">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading everything…
                </>
              ) : (
                'Nothing matches. Press Enter to search document names.'
              )}
            </li>
          ) : (
            hits.map((h, i) => {
              const Icon = ICON[h.kind]
              return (
                <li key={`${h.kind}-${h.to}-${h.title}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h.to)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === active ? 'bg-accent/10' : 'hover:bg-surface-3')}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text">{h.title}</span>
                      <span className="block truncate text-xs text-text-secondary">{h.detail}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-secondary/70">{KIND[h.kind]}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
