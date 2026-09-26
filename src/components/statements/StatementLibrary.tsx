import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileText, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Pagination } from '@/components/viz/Pagination'
import { dayLabel, type Statement } from '@/lib/statements'

const BANK_NAME = { icici: 'ICICI', axis: 'Axis', other: 'Bank' } as const

export function StatementLibrary({ statements, onOpen, onDelete }: { statements: Statement[]; onOpen: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sorted = [...statements].sort((a, b) => (b.periodTo ?? b.uploadedAt).localeCompare(a.periodTo ?? a.uploadedAt))
  const size = 6
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const current = Math.min(page, pages)

  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <GlassCard hover={false} className="p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Your statements ({statements.length})</h2>
      {error && <p role="alert" className="mb-3 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
      {statements.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nothing uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {sorted.slice((current - 1) * size, current * size).map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-10 text-text-secondary"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">
                    {BANK_NAME[s.bank]} {s.kind === 'card' ? (s.cardName ? `· ${s.cardName}` : 'card') : 'account'} {(s.kind === 'card' ? s.cardLast4 : s.accountLast4) && <span className="font-mono text-text-secondary">••{s.kind === 'card' ? s.cardLast4 : s.accountLast4}</span>}
                  </p>
                  <p className="truncate text-text-secondary">
                    {s.periodFrom && s.periodTo ? `${dayLabel(s.periodFrom)} – ${dayLabel(s.periodTo)}` : 'Period not detected'} · {s.txnCount} transactions · {s.pages} page{s.pages === 1 ? '' : 's'}
                    {s.duplicatesSkipped ? ` · ${s.duplicatesSkipped} duplicates skipped` : ''}
                  </p>
                  <p className="truncate text-2xs text-text-secondary/70">{s.filename}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" data-cursor="hover" disabled={busy === s.id} onClick={() => void run(s.id, () => onOpen(s.id))} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-text-secondary transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" /> Unlocked copy
                </button>
                <button
                  type="button"
                  data-cursor="hover"
                  disabled={busy === s.id}
                  aria-label={`Delete ${s.filename}`}
                  onClick={() => window.confirm('Delete this statement and its transactions from your vault?') && void run(s.id, () => onDelete(s.id))}
                  className="inline-flex items-center rounded-full border border-border p-2 text-text-secondary transition-colors hover:border-error/40 hover:text-error disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      {statements.length > size && <Pagination page={current} pageSize={size} total={statements.length} onPage={setPage} />}
    </GlassCard>
  )
}
