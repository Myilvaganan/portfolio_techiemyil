import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { sendContact } from '@/lib/platformApi'

const field =
  'w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder:text-text-secondary/60 outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30'
const label = 'mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary'

/** Sends a message straight to my admin inbox, so visitors don't need an email client. */
export function MessageForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('sending')
    try {
      await sendContact(form)
      setStatus('sent')
    } catch (err) {
      setError((err as Error).message)
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-accent" />
        <div>
          <h3 className="font-display text-xl font-semibold text-text">Message sent!</h3>
          <p className="mt-2 max-w-xs text-sm text-text-secondary">Thanks, {form.name.split(' ')[0]}. I&apos;ll reply to {form.email} soon.</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="m-name" className={label}>
            Name
          </label>
          <input id="m-name" required autoComplete="name" value={form.name} onChange={set('name')} placeholder="Your name" className={field} />
        </div>
        <div>
          <label htmlFor="m-email" className={label}>
            Email
          </label>
          <input id="m-email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} placeholder="you@example.com" className={field} />
        </div>
      </div>
      {/* Hidden from people; bots that fill every field get silently ignored. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="m-website">Website</label>
        <input id="m-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
      </div>
      <div>
        <label htmlFor="m-message" className={label}>
          Message
        </label>
        <textarea id="m-message" required rows={5} value={form.message} onChange={set('message')} placeholder="Tell me about your project or question…" className={`${field} resize-none`} />
      </div>
      <div className="pt-1">
        <Button type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send message
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-error">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}
