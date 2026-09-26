import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { KeyRound, Loader2, Mail, Play, Trash2, X } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { addInboxPassword, fetchInbox, processInboxItem, removeInboxPassword, skipInboxItem, type InboxData, type InboxItem, type VaultKind } from '@/lib/statementsApi'

const AUTO_KEY = 'inbox_auto'
const when = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const KIND_LABEL: Record<VaultKind, string> = { bank: 'Bank', card: 'Card', loan: 'Loan' }

function readAuto() {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Statements that reached the vault by email, ready to read. Shows only what fits this page (`kind`), reads them with one
 * click (or automatically when the page opens, if switched on) and refreshes the page's numbers afterwards.
 */
export function EmailInbox({ kind, onProcessed }: { kind: VaultKind; onProcessed: () => void }) {
  const [data, setData] = useState<InboxData | null>(null)
  const [busyId, setBusyId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [auto, setAuto] = useState(readAuto)
  const [showPw, setShowPw] = useState(false)
  const attempted = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      setData(await fetchInbox())
    } catch {
      setData(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const mine = (data?.items ?? []).filter((i) => ['new', 'ready', 'failed'].includes(i.status) && (i.kind ?? i.guess) === kind)

  const run = useCallback(
    async (item: InboxItem) => {
      setBusyId(item.id)
      setError('')
      try {
        const r = await processInboxItem(item, () => {})
        setNote(`${item.filename}: ${r.label} added.`)
        onProcessed()
      } catch (e) {
        setError(`${item.filename}: ${(e as Error).message}`)
      } finally {
        setBusyId('')
        await load()
      }
    },
    [load, onProcessed],
  )

  // Automatic mode reads the waiting statements one after another when the page opens.
  useEffect(() => {
    if (!auto || !data) return
    const next = mine.find((i) => i.status === 'new' && !attempted.current.has(i.id))
    if (next && !busyId) {
      attempted.current.add(next.id)
      void run(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, data])

  function toggleAuto() {
    const next = !auto
    setAuto(next)
    try {
      localStorage.setItem(AUTO_KEY, next ? '1' : '0')
    } catch {
      // The choice just won't survive a reload.
    }
  }

  if (!data?.configured && !(data?.items.length ?? 0)) return null
  if (!mine.length && !note && !showPw) {
    return (
      <button type="button" onClick={() => setShowPw(true)} className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text">
        <Mail className="h-3.5 w-3.5" /> Statement emails: nothing waiting · manage PDF passwords
      </button>
    )
  }

  return (
    <GlassCard hover={false} className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Mail className="h-4 w-4 text-accent" /> {mine.length ? `${mine.length} ${KIND_LABEL[kind].toLowerCase()} statement${mine.length === 1 ? '' : 's'} arrived by email` : 'Statement emails'}
        </h2>
        <span className="flex items-center gap-3 text-xs text-text-secondary">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={auto} onChange={toggleAuto} className="accent-[var(--color-accent)]" /> Read automatically when I open this page
          </label>
          <button type="button" onClick={() => setShowPw((v) => !v)} className="inline-flex items-center gap-1 hover:text-text">
            <KeyRound className="h-3.5 w-3.5" /> PDF passwords ({data?.passwords.length ?? 0})
          </button>
        </span>
      </div>

      {mine.length > 0 && (
        <ul className="divide-y divide-border/60">
          {mine.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="min-w-0">
                <span className="block truncate text-sm text-text">{i.subject || i.filename}</span>
                <span className={cn('block truncate', i.status === 'failed' ? 'text-error' : 'text-text-secondary')}>
                  {when(i.receivedAt)} · {i.filename}
                  {i.status === 'failed' && i.error ? ` · ${i.error}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Button size="sm" magnetic={false} disabled={Boolean(busyId)} onClick={() => void run(i)} className="!h-8 !px-3 !text-xs">
                  {busyId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {i.status === 'failed' ? 'Try again' : 'Read it'}
                </Button>
                <button type="button" aria-label={`Dismiss ${i.filename}`} onClick={() => void skipInboxItem(i.id).then(load)} className="rounded-full border border-border p-1.5 text-text-secondary hover:text-text">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && <p role="status" className="text-xs text-positive">{note}</p>}
      {error && <p role="alert" className="text-xs text-error">{error}</p>}

      {showPw && <PasswordManager passwords={data?.passwords ?? []} onChange={load} />}
    </GlassCard>
  )
}

function PasswordManager({ passwords, onChange }: { passwords: { id: string; label: string }[]; onChange: () => Promise<void> }) {
  const [label, setLabel] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')

  async function add(e: FormEvent) {
    e.preventDefault()
    setErr('')
    try {
      await addInboxPassword(label, password)
      setLabel('')
      setPassword('')
      await onChange()
    } catch (x) {
      setErr((x as Error).message)
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs text-text-secondary">Saved passwords are stored encrypted and are only used to open PDFs that arrive by email. Each one is tried in turn.</p>
      {passwords.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {passwords.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text">
              <KeyRound className="h-3 w-3 text-accent" /> {p.label}
              <button type="button" aria-label={`Remove ${p.label}`} onClick={() => void removeInboxPassword(p.id).then(onChange)} className="text-text-secondary hover:text-error">
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-center gap-2">
        <input aria-label="Password label" placeholder="Label, e.g. ICICI" value={label} onChange={(e) => setLabel(e.target.value)} className="w-36 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50" />
        <input aria-label="PDF password" type="password" autoComplete="off" placeholder="PDF password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-44 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-text outline-none focus:border-accent/50" />
        <Button type="submit" size="sm" variant="secondary" magnetic={false} disabled={!label.trim() || !password} className="!h-8 !px-3 !text-xs">
          Save
        </Button>
        {err && <span role="alert" className="text-xs text-error">{err}</span>}
      </form>
    </div>
  )
}
