import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Database, Loader2, Send, Sparkles, Trash2, User } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { HideNumbersButton } from '@/components/journal/chrome'
import { cn } from '@/lib/utils'
import { MASK, usePrivacy } from '@/lib/privacy'
import { askVault, fetchCoverage, type ChatMessage, type ChatReply, type Coverage } from '@/lib/chatApi'

interface Turn extends ChatMessage {
  reply?: ChatReply
  error?: boolean
}

const SUGGESTIONS = [
  'How much did I spend last month, and on what?',
  'What is my latest bank balance?',
  'How much do I spend on Zomato and Swiggy in a year?',
  'What do I still owe on my loans?',
  'Who owes me money right now?',
  'How did my trading do this month?',
  'What was my weight in the last InBody test?',
]

const STORE = 'vault_chat'
// In hidden mode every number in an answer is shown as stars, the same as the rest of the app.
const maskNumbers = (text: string) => text.replace(/₹?\s?\d[\d,]*(\.\d+)?/g, (m) => (m.trim().startsWith('₹') ? `₹${MASK}` : /\d{4}|\d{1,2}\s?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(m) ? m : MASK))

function readSaved(): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || '[]')
  } catch {
    return []
  }
}

/** Renders the reply's plain text: paragraphs, and lines starting with "-" as a list. */
function Answer({ text, hidden }: { text: string; hidden: boolean }) {
  const shown = hidden ? maskNumbers(text) : text
  const blocks = shown.split(/\n{2,}/)
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        return lines.every((l) => /^\s*[-•*]\s+/.test(l)) ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {lines.map((l, j) => (
              <li key={j}>{l.replace(/^\s*[-•*]\s+/, '')}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            {b}
          </p>
        )
      })}
    </div>
  )
}

/** Ask questions about everything in the vault. Answers come only from the stored data, never from general knowledge. */
export function Chat() {
  const { hidden } = usePrivacy()
  const [turns, setTurns] = useState<Turn[]>(readSaved)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [coverage, setCoverage] = useState<Coverage[] | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchCoverage().then(setCoverage).catch(() => setCoverage([]))
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-30)))
    } catch {
      // The conversation just won't survive a reload.
    }
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  const send = useCallback(
    async (text: string) => {
      const q = text.trim()
      if (!q || busy) return
      const next: Turn[] = [...turns.filter((t) => !t.error), { role: 'user', content: q }]
      setTurns(next)
      setInput('')
      setBusy(true)
      try {
        const reply = await askVault(next.map(({ role, content }) => ({ role, content })))
        setTurns([...next, { role: 'assistant', content: reply.answer, reply }])
      } catch (e) {
        setTurns([...next, { role: 'assistant', content: (e as Error).message, error: true }])
      } finally {
        setBusy(false)
        inputRef.current?.focus()
      }
    },
    [turns, busy],
  )

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  const empty = turns.length === 0

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 xl:col-span-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Ask your data</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text">Chat</h1>
            <p className="mt-1 text-sm text-text-secondary">Answers come only from what you have uploaded: statements, loans, trades, health, lending and more. New uploads are included automatically.</p>
          </div>
          <div className="flex items-center gap-2">
            {!empty && (
              <button type="button" onClick={() => setTurns([])} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs text-text-secondary hover:text-text">
                <Trash2 className="h-3.5 w-3.5" /> New chat
              </button>
            )}
            <HideNumbersButton />
          </div>
        </div>
      </div>

      <GlassCard hover={false} className="flex min-h-[28rem] min-w-0 flex-col p-0 xl:h-[calc(100vh-15rem)]">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold text-text">What would you like to know?</h2>
                <p className="mt-1 text-sm text-text-secondary">Try one of these, or ask your own.</p>
              </div>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:text-text">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-2.5', t.role === 'user' && 'justify-end')}>
                {t.role === 'assistant' && (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                )}
                <div className={cn('max-w-[85%] rounded-2xl px-4 py-3', t.role === 'user' ? 'rounded-br-md bg-accent/15 text-sm text-text' : t.error ? 'rounded-bl-md border border-error/40 bg-error/10' : 'rounded-bl-md border border-border bg-surface-2')}>
                  {t.role === 'user' ? (
                    <p className="whitespace-pre-wrap text-sm">{t.content}</p>
                  ) : t.error ? (
                    <p role="alert" className="text-sm text-error">
                      {t.content}
                    </p>
                  ) : (
                    <>
                      <Answer text={t.content} hidden={hidden} />
                      {t.reply && t.reply.sources.length > 0 && (
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-text-secondary">
                          <Database className="h-3 w-3" /> From
                          {t.reply.sources.map((s) => (
                            <span key={s} className="rounded-full border border-border px-2 py-0.5">
                              {s}
                            </span>
                          ))}
                        </p>
                      )}
                      {t.reply && t.reply.followUps.length > 0 && i === turns.length - 1 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.reply.followUps.map((f) => (
                            <button key={f} type="button" disabled={busy} onClick={() => void send(f)} className="rounded-full border border-accent/30 px-2.5 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-50">
                              {f}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {t.role === 'user' && (
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-text-secondary">
                    <User className="h-3.5 w-3.5" />
                  </span>
                )}
              </motion.div>
            ))
          )}
          {busy && (
            <div role="status" className="flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin text-accent" /> Looking through your records…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
          <textarea
            ref={inputRef}
            aria-label="Your question"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder="Ask about your spending, loans, trades, health…"
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30"
          />
          <button type="submit" aria-label="Send" disabled={busy || !input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-[#05130a] transition-opacity hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </GlassCard>

      <GlassCard hover={false} className="h-fit p-4">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          <Database className="h-3.5 w-3.5" /> What it can see
        </h2>
        {!coverage ? (
          <p className="flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
          </p>
        ) : coverage.length === 0 ? (
          <p className="text-xs text-text-secondary">Could not check your data right now.</p>
        ) : (
          <ul className="space-y-2.5 text-xs">
            {coverage.map((c) => (
              <li key={c.source}>
                <span className="block font-medium text-text">{c.source}</span>
                <span className="block text-text-secondary">{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-text-secondary">
          Questions and the relevant records are sent to OpenAI to write each answer. If something is missing from an answer, upload it and ask again.
        </p>
      </GlassCard>
    </div>
  )
}
