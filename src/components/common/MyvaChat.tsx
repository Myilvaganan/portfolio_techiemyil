import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Send, Sparkles, X } from 'lucide-react'
import { askMyva, type MyvaMessage } from '@/lib/myva'
import { personal } from '@/data/personal'

const MAX_HISTORY = 8

function createGreeting(): MyvaMessage {
  return {
    role: 'assistant',
    content: `Hi, I'm MYVA — ${personal.firstName}'s AI assistant. Ask me about his experience, skills, or projects.`,
  }
}

export function MyvaChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<MyvaMessage[]>(() => [createGreeting()])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const nextMessages: MyvaMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setLoading(true)

    try {
      const history = nextMessages.slice(-(MAX_HISTORY + 1), -1)
      const reply = await askMyva(text, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-24 right-6 z-50 h-14 w-14 md:right-10">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-accent/60 blur-xl"
          animate={
            open
              ? { opacity: 0.35, scale: 1 }
              : { opacity: [0.3, 0.6, 0.3], scale: [1, 1.18, 1] }
          }
          transition={{ duration: 2.8, repeat: open ? 0 : Infinity, ease: 'easeInOut' }}
        />
        {!open && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-accent/60"
            animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        <motion.button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label={open ? 'Close MYVA chat' : 'Chat with MYVA'}
          aria-expanded={open}
          data-cursor="hover"
          whileTap={{ scale: 0.92 }}
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-[#05130a] shadow-[0_8px_28px_-6px_rgba(34,197,94,0.55)] transition-shadow hover:shadow-[0_10px_36px_-4px_rgba(34,197,94,0.7)]"
        >
          <motion.span
            animate={open ? { rotate: 90, scale: 1 } : { rotate: 0, scale: [1, 1.08, 1] }}
            transition={
              open
                ? { duration: 0.25 }
                : { scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }
            }
            className="flex items-center justify-center"
          >
            {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          </motion.span>
        </motion.button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-label="Chat with MYVA"
            className="fixed bottom-[168px] right-6 z-50 flex h-[480px] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-border bg-card/95 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-md md:right-10"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-[#05130a]">
                <motion.span
                  animate={{ rotate: [0, 15, 0, -10, 0] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center justify-center"
                >
                  <Sparkles className="h-4 w-4" />
                </motion.span>
              </span>
              <div>
                <p className="text-sm font-semibold text-text">MYVA</p>
                <p className="text-xs text-text-secondary">{personal.firstName}'s AI assistant</p>
              </div>
            </div>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'ml-auto bg-accent text-[#05130a]' : 'bg-surface-3 text-text'
                  }`}
                >
                  {m.content}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> MYVA is thinking…
                </div>
              )}
              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border p-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask about ${personal.firstName}'s work…`}
                maxLength={500}
                aria-label="Message MYVA"
                className="h-10 flex-1 rounded-full border border-border bg-surface-3 px-4 text-sm text-text outline-none focus:border-accent/50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[#05130a] disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
