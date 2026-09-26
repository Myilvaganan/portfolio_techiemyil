import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { PageBadge } from '@/components/admin/AdminShell'
import QRCode from 'qrcode'
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { disableTwoFactor, enableTwoFactor, fetchSecurity, newRecoveryCodes, startTwoFactor, type SecurityStatus } from '@/lib/platformApi'

const input = 'w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text"
    >
      {done ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />} {done ? 'Copied' : label}
    </button>
  )
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Save these recovery codes somewhere safe, like a password manager. Each works <span className="text-text">once</span> if you lose your phone. They won&apos;t be shown again.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-2 p-4 font-mono text-sm text-text">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={codes.join('\n')} label="Copy all" />
        <Button size="sm" magnetic={false} onClick={onDone}>
          I&apos;ve saved them
        </Button>
      </div>
    </div>
  )
}

function CodeForm({ submitLabel, onSubmit, danger }: { submitLabel: string; onSubmit: (code: string) => Promise<void>; danger?: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit(code)
      setCode('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <label htmlFor="sec-code" className="block label-caps">
        Code from your authenticator app
      </label>
      <input id="sec-code" autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
      {error && (
        <p role="alert" className="text-xs text-error">
          {error}
        </p>
      )}
      <Button type="submit" size="sm" magnetic={false} disabled={busy || code.trim().length < 6} className={cn(danger && '!bg-error !text-white')}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
      </Button>
    </form>
  )
}

/** Two-step sign-in: set up an authenticator app, keep recovery codes, and turn it off again. */
export function Security() {
  const [status, setStatus] = useState<SecurityStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [mode, setMode] = useState<'idle' | 'disable' | 'recovery'>('idle')
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await fetchSecurity())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function begin() {
    setStarting(true)
    try {
      const s = await startTwoFactor()
      setSetup({ ...s, qr: await QRCode.toDataURL(s.uri, { margin: 1, width: 200 }) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-start gap-3.5">
        <PageBadge />
        <div className="min-w-0">
        <p className="page-eyebrow">Account</p>
        <h1 className="mt-1 page-title">Security</h1>
        <p className="page-lede">Add a second step to signing in, so a stolen password alone can&apos;t open your admin.</p>
        </div>
      </div>

      {error && (
        <GlassCard hover={false} className="p-4 text-sm text-error" role="alert">
          {error}
        </GlassCard>
      )}

      {!status ? (
        !error && (
          <GlassCard hover={false} className="flex items-center gap-2 p-6 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </GlassCard>
        )
      ) : (
        <GlassCard hover={false} className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', status.enabled ? 'bg-positive/15 text-positive' : 'bg-surface-3 text-text-secondary')}>
              {status.enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="card-title">Two-step verification is {status.enabled ? 'on' : 'off'}</h2>
              <p className="text-sm text-text-secondary">
                {status.enabled
                  ? `Signing in needs your password and a 6-digit code.${status.enabledAt ? ` Turned on ${new Date(status.enabledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.` : ''} ${status.recoveryLeft} recovery code${status.recoveryLeft === 1 ? '' : 's'} left.`
                  : `Signing in needs only your password. After ${status.maxFailures} wrong attempts a sender is locked out for ${status.lockMinutes} minutes either way.`}
              </p>
              {status.disabledByServer && <p className="mt-1 text-xs text-amber-500">The server has two-step verification switched off (ADMIN_2FA_DISABLED), so it is not being asked for at sign-in.</p>}
            </div>
          </div>

          {codes ? (
            <RecoveryCodes
              codes={codes}
              onDone={() => {
                setCodes(null)
                setMode('idle')
                void load()
              }}
            />
          ) : setup ? (
            <div className="space-y-4 border-t border-border pt-5">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
                <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
                <li>Scan this code, or enter the key by hand.</li>
                <li>Type the 6-digit code it shows below.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-5">
                <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-xl border border-border bg-white p-1" />
                <div className="min-w-0 space-y-2">
                  <p className="label-caps">Key for manual entry</p>
                  <p className="break-all font-mono text-sm text-text">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
                  <CopyButton text={setup.secret} label="Copy key" />
                </div>
              </div>
              <CodeForm
                submitLabel="Turn on"
                onSubmit={async (code) => {
                  const r = await enableTwoFactor(code)
                  setSetup(null)
                  setCodes(r.recoveryCodes)
                }}
              />
            </div>
          ) : status.enabled ? (
            <div className="space-y-4 border-t border-border pt-5">
              {mode === 'idle' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setMode('recovery')}>
                    <KeyRound className="h-4 w-4" /> New recovery codes
                  </Button>
                  <Button size="sm" variant="secondary" magnetic={false} onClick={() => setMode('disable')}>
                    <ShieldOff className="h-4 w-4" /> Turn off
                  </Button>
                </div>
              )}
              {mode === 'recovery' && (
                <CodeForm
                  submitLabel="Get new recovery codes"
                  onSubmit={async (code) => {
                    setCodes((await newRecoveryCodes(code)).recoveryCodes)
                  }}
                />
              )}
              {mode === 'disable' && (
                <CodeForm
                  danger
                  submitLabel="Turn off two-step verification"
                  onSubmit={async (code) => {
                    await disableTwoFactor(code)
                    setMode('idle')
                    await load()
                  }}
                />
              )}
              {mode !== 'idle' && (
                <button type="button" onClick={() => setMode('idle')} className="text-xs text-text-secondary hover:text-text">
                  Cancel
                </button>
              )}
            </div>
          ) : (
            <div className="border-t border-border pt-5">
              <Button size="sm" magnetic={false} onClick={() => void begin()} disabled={starting}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Set up two-step verification
              </Button>
            </div>
          )}
        </GlassCard>
      )}
    </div>
  )
}
