import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookLock, KeyRound, Lock, NotebookPen, Plus, Search, ShieldCheck, Trash2, Grid3x3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Empty, Loading, Notice, PageHero, Panel, inputCls } from '@/components/growth/kit'
import { PatternPad } from '@/components/diary/PatternPad'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/native'
import { useGrowthDoc, type DiaryDoc } from '@/lib/growthApi'
import { CHECK_VALUE, deriveKey, newSalt, open, seal, verify } from '@/lib/diaryCrypto'
import { todayStr } from '@/lib/journal'

// Daily notes and a personal diary, end-to-end encrypted. The key lives only in memory while the page is open and
// unlocked; leaving the page, hiding the app or five idle minutes lock it again.

type Kind = 'note' | 'diary'
interface Entry {
  id: string
  date: string
  kind: Kind
  title: string
  body: string
  mood: string
  updatedAt: string
}

const MOODS = ['😄', '🙂', '😐', '😔', '😤', '🙏']
const IDLE_MS = 5 * 60_000
const newId = () => Math.random().toString(36).slice(2, 12)

function LockScreen({ doc, onUnlock }: { doc: DiaryDoc; onUnlock: (key: CryptoKey) => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)

  async function attempt(secret: string) {
    if (!doc.check) return
    setBusy(true)
    setWrong(false)
    const key = await deriveKey(secret, doc.salt)
    setBusy(false)
    if (await verify(key, doc.check)) {
      haptic(15)
      onUnlock(key)
    } else {
      haptic(40)
      setWrong(true)
      setPassword('')
    }
  }

  return (
    <Panel className="mx-auto max-w-md">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <motion.span initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Lock className="h-8 w-8" />
        </motion.span>
        <p className="font-display text-xl text-text">Your diary is locked</p>
        <p className="text-sm text-text-secondary">{doc.method === 'pattern' ? 'Draw your pattern to open it.' : 'Enter your password to open it.'}</p>
        {doc.method === 'pattern' ? (
          <PatternPad onDone={(p) => void attempt(p)} error={wrong} disabled={busy} />
        ) : (
          <form className="w-full space-y-3" onSubmit={(e) => { e.preventDefault(); void attempt(password) }}>
            <input type="password" autoFocus autoComplete="current-password" className={cn(inputCls, 'text-center text-lg', wrong && 'border-error')} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <Button type="submit" magnetic={false} disabled={!password || busy} className="w-full">
              <KeyRound className="h-4 w-4" /> Unlock
            </Button>
          </form>
        )}
        {busy && <p className="text-xs text-text-secondary">Checking…</p>}
        {wrong && <p className="text-sm text-error">That’s not it. Try again.</p>}
      </div>
    </Panel>
  )
}

function Setup({ onCreate }: { onCreate: (method: 'password' | 'pattern', secret: string) => Promise<void> }) {
  const [method, setMethod] = useState<'password' | 'pattern'>('pattern')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm(secret: string) {
    if (secret !== first) {
      setMismatch(true)
      setFirst('')
      return
    }
    setBusy(true)
    await onCreate(method, secret)
  }

  return (
    <Panel className="mx-auto max-w-md">
      <div className="space-y-4 py-2 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ShieldCheck className="h-8 w-8" />
        </span>
        <p className="font-display text-xl text-text">Lock your diary</p>
        <p className="text-sm text-text-secondary">Entries are encrypted on this device with your lock before they’re saved. Nobody can read them without it — <b className="text-text">if you forget it, they can’t be recovered</b>.</p>
        <div className="flex justify-center gap-2">
          {(['pattern', 'password'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMethod(m); setFirst(''); setSecond(''); setMismatch(false) }} className={cn('inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm', method === m ? 'border-accent bg-accent/15 text-accent' : 'border-border text-text-secondary')}>
              {m === 'pattern' ? <Grid3x3 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />} {m === 'pattern' ? 'Pattern' : 'Password'}
            </button>
          ))}
        </div>
        <p className="text-sm font-medium text-text">{!first ? (method === 'pattern' ? 'Draw a pattern (4+ dots)' : 'Choose a password (6+ characters)') : 'Once more to confirm'}</p>
        {mismatch && <p className="text-sm text-error">They didn’t match — start again.</p>}
        {method === 'pattern' ? (
          <PatternPad key={first ? 'confirm' : 'first'} disabled={busy} error={mismatch} onDone={(p) => { setMismatch(false); if (!first) setFirst(p); else void confirm(p) }} />
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!first) { if (second.length >= 6) { setFirst(second); setSecond(''); setMismatch(false) } } else void confirm(second) }}>
            <input type="password" autoComplete="new-password" className={cn(inputCls, 'text-center text-lg')} value={second} onChange={(e) => setSecond(e.target.value)} placeholder={first ? 'Confirm password' : 'New password'} />
            <Button type="submit" magnetic={false} disabled={second.length < 6 || busy} className="w-full">{first ? 'Lock diary' : 'Next'}</Button>
          </form>
        )}
      </div>
    </Panel>
  )
}

export function Diary() {
  const doc = useGrowthDoc('diary')
  const [key, setKey] = useState<CryptoKey | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Kind | 'all'>('all')
  const [draft, setDraft] = useState<Entry | null>(null)
  const idle = useRef<number | undefined>(undefined)

  const lock = useCallback(() => {
    setKey(null)
    setEntries([])
    setDraft(null)
    setSelected(null)
  }, [])

  // Lock when the app is hidden or after five idle minutes.
  useEffect(() => {
    if (!key) return
    const reset = () => {
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(lock, IDLE_MS)
    }
    const onHide = () => document.visibilityState === 'hidden' && lock()
    reset()
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearTimeout(idle.current)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [key, lock])

  // Decrypt everything once unlocked.
  useEffect(() => {
    if (!key) return
    let cancelled = false
    Promise.all(doc.value.entries.map(async (e) => ({ ...(await open<Omit<Entry, 'id' | 'date'>>(key, e.box)), id: e.id, date: e.date })))
      .then((list) => !cancelled && setEntries(list.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt))))
      .catch(() => !cancelled && setEntries([]))
    return () => {
      cancelled = true
    }
  }, [key, doc.value.entries])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => (filter === 'all' || e.kind === filter) && (!q || `${e.title} ${e.body}`.toLowerCase().includes(q)))
  }, [entries, query, filter])

  async function create(method: 'password' | 'pattern', secret: string) {
    const salt = newSalt()
    const k = await deriveKey(secret, salt)
    await doc.save({ method, salt, check: await seal(k, CHECK_VALUE), entries: [] })
    setKey(k)
  }

  async function persist(e: Entry) {
    if (!key) return
    const { id, date, ...secret } = e
    const box = await seal(key, { ...secret, updatedAt: new Date().toISOString() })
    const rest = doc.value.entries.filter((x) => x.id !== id)
    await doc.save({ ...doc.value, entries: [...rest, { id, date, box }] })
    haptic(10)
  }

  async function remove(id: string) {
    await doc.save({ ...doc.value, entries: doc.value.entries.filter((x) => x.id !== id) })
    setDraft(null)
    setSelected(null)
  }

  function startNew(kind: Kind) {
    const e: Entry = { id: newId(), date: todayStr(), kind, title: '', body: '', mood: '', updatedAt: '' }
    setDraft(e)
    setSelected(e.id)
  }

  if (doc.loading) return <Loading label="Opening your diary…" />

  return (
    <div className="w-full space-y-5">
      <PageHero
        eyebrow="Private"
        title="Diary"
        lede="Daily notes and a personal diary, encrypted on your device and opened only with your password or pattern."
        actions={key ? <Button size="sm" variant="ghost" magnetic={false} onClick={lock}><Lock className="h-4 w-4" /> Lock</Button> : undefined}
      />
      {doc.error && <Notice tone="bad">{doc.error}</Notice>}

      {!doc.value.check ? (
        <Setup onCreate={create} />
      ) : !key ? (
        <LockScreen doc={doc.value} onUnlock={setKey} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel>
            <div className="flex gap-2">
              <Button size="sm" magnetic={false} onClick={() => startNew('note')} className="flex-1"><NotebookPen className="h-4 w-4" /> Note</Button>
              <Button size="sm" magnetic={false} onClick={() => startNew('diary')} className="flex-1"><BookLock className="h-4 w-4" /> Diary</Button>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <input className={cn(inputCls, 'pl-9')} placeholder="Search your entries" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="mt-2 flex gap-1.5">
              {(['all', 'note', 'diary'] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} className={cn('rounded-full px-3 py-1 text-xs capitalize', filter === f ? 'bg-accent/15 text-accent' : 'text-text-secondary')}>{f === 'all' ? 'All' : f === 'note' ? 'Notes' : 'Diary'}</button>
              ))}
            </div>
            <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto">
              {shown.length === 0 && <Empty title="Nothing here yet." />}
              {shown.map((e) => (
                <motion.button key={e.id} layout type="button" onClick={() => { setSelected(e.id); setDraft(e) }} className={cn('flex w-full items-start gap-3 rounded-xl p-2.5 text-left', selected === e.id ? 'bg-accent/10' : 'hover:bg-surface-3')}>
                  <span className="w-10 shrink-0 text-center">
                    <span className="block font-mono text-lg font-semibold leading-none text-text">{Number(e.date.slice(8))}</span>
                    <span className="block text-2xs uppercase text-text-secondary">{new Date(`${e.date}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{e.mood} {e.title || (e.kind === 'note' ? 'Note' : 'Dear diary')}</span>
                    <span className="block truncate text-xs text-text-secondary">{e.body.slice(0, 80) || '—'}</span>
                  </span>
                  {e.kind === 'diary' ? <BookLock className="h-3.5 w-3.5 shrink-0 text-accent" /> : <NotebookPen className="h-3.5 w-3.5 shrink-0 text-text-secondary" />}
                </motion.button>
              ))}
            </div>
          </Panel>

          <AnimatePresence mode="wait">
            {draft ? (
              <motion.div key={draft.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Panel>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" className={cn(inputCls, 'w-auto')} value={draft.date} max={todayStr()} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                    <div className="flex gap-1">
                      {MOODS.map((m) => (
                        <button key={m} type="button" aria-pressed={draft.mood === m} onClick={() => setDraft({ ...draft, mood: draft.mood === m ? '' : m })} className={cn('rounded-full p-1.5 text-xl transition-transform', draft.mood === m ? 'scale-110 bg-accent/15' : 'opacity-60')}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <input className="mt-4 w-full bg-transparent font-display text-2xl text-text outline-none placeholder:text-text-secondary/50" placeholder={draft.kind === 'note' ? 'Title' : 'Dear diary…'} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                  <textarea className="mt-3 min-h-[45vh] w-full resize-y bg-transparent text-base leading-relaxed text-text outline-none placeholder:text-text-secondary/50" placeholder="Write freely — only you can read this." value={draft.body} maxLength={40000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                  <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
                    <Button size="sm" magnetic={false} disabled={doc.saving || (!draft.title.trim() && !draft.body.trim())} onClick={() => void persist(draft)}>
                      <Plus className="h-4 w-4" /> {doc.saving ? 'Saving…' : 'Save'}
                    </Button>
                    {entries.some((e) => e.id === draft.id) && (
                      <button type="button" onClick={() => void remove(draft.id)} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-error">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-xs text-text-secondary"><ShieldCheck className="h-3.5 w-3.5 text-positive" /> Encrypted</span>
                  </div>
                </Panel>
              </motion.div>
            ) : (
              <Panel>
                <Empty title="Pick an entry, or start a new note or diary page." />
              </Panel>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
