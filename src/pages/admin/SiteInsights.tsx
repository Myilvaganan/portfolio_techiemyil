import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Mail, MailOpen, RefreshCw, Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/statements/parts'
import { cn } from '@/lib/utils'
import { monthLabel, monthOf, shiftMonth, todayStr } from '@/lib/journal'
import { deleteMessage, fetchAnalytics, fetchMessages, markMessage, type ContactMessage, type SiteAnalytics } from '@/lib/platformApi'

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function Bars({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.views))
  return (
    <div className="flex h-36 items-end gap-1" role="img" aria-label="Page views per day">
      {data.map((d) => (
        <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
          <div className="rounded-t bg-accent/70 transition-colors group-hover:bg-accent" style={{ height: `${Math.max(2, (d.views / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-card px-1.5 py-0.5 text-[10px] text-text shadow group-hover:block">
            {d.date.slice(8)}: {d.views}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The public website from the inside: messages sent through the contact form and cookieless page-view counts. */
export function SiteInsights() {
  const [month, setMonth] = useState(monthOf(todayStr()))
  const [stats, setStats] = useState<SiteAnalytics | null>(null)
  const [messages, setMessages] = useState<ContactMessage[] | null>(null)
  const [openId, setOpenId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    setError(null)
    setLoading(true)
    setStats(null)
    const [a, m] = await Promise.allSettled([fetchAnalytics(month), fetchMessages()])
    if (id !== request.current) return
    if (a.status === 'fulfilled') setStats(a.value)
    if (m.status === 'fulfilled') setMessages(m.value)
    const errors = [a, m].flatMap((r) => r.status === 'rejected' ? [r.reason instanceof Error ? r.reason.message : 'Could not load website data.'] : [])
    setError(errors.join(' · ') || null)
    setLoading(false)
  }, [month])

  useEffect(() => {
    const counter = request
    void load()
    return () => { counter.current++ }
  }, [load])

  async function toggleRead(m: ContactMessage, read = !m.read) {
    setMessages((list) => list?.map((x) => (x.id === m.id ? { ...x, read } : x)) ?? null)
    await markMessage(m.id, read).catch(() => void load())
  }

  async function remove(m: ContactMessage) {
    if (!window.confirm(`Delete the message from ${m.name}?`)) return
    setMessages((list) => list?.filter((x) => x.id !== m.id) ?? null)
    await deleteMessage(m.id).catch(() => void load())
  }

  const unread = messages?.filter((m) => !m.read).length ?? 0

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">techiemyil.com</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-text">Website</h1>
          <p className="mt-1 text-sm text-text-secondary">Messages from the contact form and how many people read each page. Page-view analytics collect no cookies or IPs. Contact messages contain the details the sender provides.</p>
        </div>
        <Button size="sm" variant="secondary" magnetic={false} onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <GlassCard hover={false} className="p-4 text-sm text-error" role="alert">
          {error}
        </GlassCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card
          title={`Visitors · ${monthLabel(month)}`}
          aside={
            <span className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-full border border-border p-1 text-text-secondary hover:text-text">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-full border border-border p-1 text-text-secondary hover:text-text">
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          }
        >
          {!stats && !loading ? <p className="text-sm text-error">Visitor data could not be loaded. Use Refresh to retry.</p> : !stats ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : stats.total === 0 ? (
            <p className="text-sm text-text-secondary">No visits recorded this month yet. Counting starts once the updated site is live.</p>
          ) : (
            <div className="space-y-5">
              <p className="font-mono text-3xl font-semibold text-text">
                {stats.total.toLocaleString('en-IN')} <span className="text-sm font-normal text-text-secondary">page views</span>
              </p>
              <Bars data={stats.byDay} />
              <div className="grid gap-5 sm:grid-cols-2">
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Top pages</h3>
                  <ul className="space-y-1 text-sm">
                    {stats.pages.slice(0, 8).map((p) => (
                      <li key={p.path} className="flex justify-between gap-3 border-b border-border/60 py-1">
                        <span className="truncate font-mono text-text">{p.path}</span>
                        <span className="font-mono text-text-secondary">{p.views}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Where visitors came from</h3>
                  {stats.referrers.length === 0 ? (
                    <p className="text-sm text-text-secondary">Direct visits only.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {stats.referrers.slice(0, 8).map((r) => (
                        <li key={r.host} className="flex justify-between gap-3 border-b border-border/60 py-1">
                          <span className="truncate text-text">{r.host}</span>
                          <span className="font-mono text-text-secondary">{r.views}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          )}
        </Card>

        <Card title={`Messages${unread ? ` · ${unread} new` : ''}`}>
          {!messages && !loading ? <p className="text-sm text-error">Messages could not be loaded. Use Refresh to retry.</p> : !messages ? (
            <p className="flex items-center gap-2 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-text-secondary">No messages yet. Anything sent through the contact form on your website lands here.</p>
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {messages.map((m) => {
                const open = openId === m.id
                return (
                  <li key={m.id} className={cn('rounded-xl border px-3 py-2', m.read ? 'border-border bg-surface-2' : 'border-accent/40 bg-accent/[0.06]')}>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => {
                          setOpenId(open ? '' : m.id)
                          if (!m.read) void toggleRead(m, true)
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className={cn('block truncate text-sm', m.read ? 'text-text' : 'font-semibold text-text')}>{m.name}</span>
                        <span className="block truncate text-xs text-text-secondary">
                          {when(m.createdAt)} · {open ? m.email : m.message}
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        <button type="button" aria-label={m.read ? 'Mark as unread' : 'Mark as read'} onClick={() => void toggleRead(m)} className="rounded-md p-1 text-text-secondary hover:text-text">
                          {m.read ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                        </button>
                        <button type="button" aria-label={`Delete message from ${m.name}`} onClick={() => void remove(m)} className="rounded-md p-1 text-text-secondary hover:text-error">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                    {open && (
                      <div className="mt-2 space-y-2 border-t border-border pt-2">
                        <p className="whitespace-pre-wrap text-sm text-text">{m.message}</p>
                        <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message on techiemyil.com')}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                          <Mail className="h-3.5 w-3.5" /> Reply by email
                        </a>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
