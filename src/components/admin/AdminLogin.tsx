import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Eye, EyeOff, FileText, HeartPulse, KeyRound, Loader2, Lock, MessagesSquare, ShieldCheck, Sparkles, TrendingUp, User } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { TwoFactorRequired, loginAdmin } from '@/lib/adminVault'

interface LoginValues {
  username: string
  password: string
  code: string
}

const field = 'w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/30'
const FEATURES = [
  { icon: FileText, text: 'Documents' },
  { icon: TrendingUp, text: 'Finance & investments' },
  { icon: HeartPulse, text: 'Health records' },
  { icon: MessagesSquare, text: 'Ask My Data' },
]
const label = 'mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginError, setLoginError] = useState<string | null>(null)
  const [needCode, setNeedCode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>()

  async function onSubmit(data: LoginValues) {
    setLoginError(null)
    try {
      await loginAdmin(data.username, data.password, needCode ? data.code : undefined)
      onSuccess()
    } catch (err) {
      if (err instanceof TwoFactorRequired) {
        // The first time this is the prompt for the code; after a wrong code it is the error, and the box is cleared.
        if (needCode) setLoginError(err.message)
        setNeedCode(true)
        setValue('code', '')
      } else {
        setLoginError(err instanceof Error ? err.message : 'Login failed. Please try again.')
        if (needCode) setNeedCode(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-10 overflow-y-auto overflow-x-hidden bg-bg">
      {/* Full-screen backdrop shared by the hero and the form: glow, dot pattern, rings, diamonds and a rising chart */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_10%,color-mix(in_srgb,var(--color-accent)_30%,transparent),transparent_55%),radial-gradient(ellipse_at_90%_85%,color-mix(in_srgb,var(--color-accent-hover)_22%,transparent),transparent_55%),radial-gradient(ellipse_at_80%_10%,color-mix(in_srgb,var(--color-accent)_12%,transparent),transparent_45%)]" />
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(var(--color-text-secondary)_1px,transparent_1.5px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_50%_45%,black,transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:repeating-linear-gradient(135deg,var(--color-accent)_0_1px,transparent_1px_22px)] [mask-image:radial-gradient(ellipse_at_10%_90%,black,transparent_55%)]" />
        <motion.div animate={{ y: [0, -18, 0] }} transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }} className="absolute left-[10%] top-[14%] hidden h-64 w-64 rounded-full bg-accent/20 blur-3xl sm:block" />
        <motion.div animate={{ y: [0, 22, 0] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} className="absolute bottom-[8%] right-[6%] hidden h-72 w-72 rounded-full bg-accent-hover/15 blur-3xl sm:block" />

        <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full text-accent">
          <g fill="none" stroke="currentColor" strokeOpacity="0.16">
            <circle cx="860" cy="170" r="90" />
            <circle cx="860" cy="170" r="160" strokeDasharray="3 9" />
            <circle cx="860" cy="170" r="240" strokeOpacity="0.09" />
            <circle cx="120" cy="820" r="70" />
            <circle cx="120" cy="820" r="140" strokeDasharray="3 9" />
          </g>
          <g fill="currentColor" fillOpacity="0.22">
            <rect x="470" y="130" width="14" height="14" transform="rotate(45 477 137)" />
            <rect x="640" y="330" width="10" height="10" transform="rotate(45 645 335)" />
            <rect x="330" y="520" width="12" height="12" transform="rotate(45 336 526)" />
            <rect x="760" y="620" width="16" height="16" transform="rotate(45 768 628)" />
            <rect x="560" y="760" width="10" height="10" transform="rotate(45 565 765)" />
          </g>
          <defs>
            <linearGradient id="vault-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 860 C120 840 200 880 320 820 S520 760 620 690 S800 560 900 470 S970 420 1000 400 V1000 H0Z" fill="url(#vault-area)" />
          <motion.path
            d="M0 860 C120 840 200 880 320 820 S520 760 620 690 S800 560 900 470 S970 420 1000 400"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2.4, ease: 'easeOut' }}
          />
        </svg>
      </div>
      <div className="relative flex min-h-full">
      <ThemeToggle className="absolute left-6 top-6 z-20" />

      {/* Hero side: layered glow, a rising line chart and feature chips (desktop only) */}
      <aside className="relative hidden min-w-0 flex-1 items-center overflow-hidden xl:flex" aria-hidden="true">

        <div className="relative z-10 max-w-2xl p-10 pb-32 2xl:p-14 2xl:pb-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-5 px-3 py-1 text-xs font-medium text-text-secondary backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-accent" /> Private workspace
          </span>
          <h2 className="mt-5 font-display text-4xl font-semibold leading-tight text-text 2xl:text-5xl">
            Your whole life,
            <br />
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">beautifully organised.</span>
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-text-secondary">Documents, money, investments and health records in one encrypted place, with an assistant that answers only from your own data.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <motion.span
                key={text}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-5 px-3.5 py-2 text-xs font-medium text-text backdrop-blur"
              >
                <Icon className="h-4 w-4 text-accent" /> {text}
              </motion.span>
            ))}
          </div>
        </div>
      </aside>

      {/* Form side */}
      <main className="relative flex w-full items-center justify-center px-6 py-12 xl:w-[560px] xl:shrink-0 2xl:w-[620px]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="relative w-full max-w-md">
          <GlassCard hover={false} className="p-8 sm:p-10">
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent shadow-[0_0_32px_-6px_var(--color-accent)]">
                {needCode ? <KeyRound className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
              </div>
              <div>
                <h1 className="font-display text-2xl font-semibold text-text">{needCode ? 'Two-step verification' : 'Welcome back'}</h1>
                <p className="mt-1 text-sm text-text-secondary">{needCode ? 'Enter the 6-digit code from your authenticator app, or a recovery code.' : 'Sign in to your private vault'}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className={needCode ? 'hidden' : ''}>
                <label htmlFor="admin-username" className={label}>
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input id="admin-username" autoComplete="username" {...register('username', { required: 'Username is required' })} className={`${field} pl-10`} />
                </div>
                {errors.username && <p className="mt-1.5 text-xs text-error">{errors.username.message}</p>}
              </div>

              <div className={needCode ? 'hidden' : ''}>
                <label htmlFor="admin-password" className={label}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
                  <input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" {...register('password', { required: 'Password is required' })} className={`${field} px-10`} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary transition-colors hover:text-text">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1.5 text-xs text-error">{errors.password.message}</p>}
              </div>

              {needCode && (
                <div>
                  <label htmlFor="admin-code" className={label}>
                    Code
                  </label>
                  <input
                    id="admin-code"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123 456"
                    {...register('code', { required: 'Enter your code' })}
                    className={`${field} text-center font-mono text-lg tracking-[0.3em]`}
                  />
                  {errors.code && <p className="mt-1.5 text-xs text-error">{errors.code.message}</p>}
                </div>
              )}

              {loginError && (
                <p role="alert" className="text-xs text-error">
                  {loginError}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting} magnetic={false} className="w-full">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {needCode ? 'Verify' : 'Sign In'}
              </Button>
              {needCode && (
                <button type="button" onClick={() => { setNeedCode(false); setLoginError(null) }} className="w-full text-center text-xs text-text-secondary hover:text-text">
                  Back to password
                </button>
              )}
            </form>
          </GlassCard>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-text-secondary">
            <Lock className="h-3 w-3" /> Encrypted &amp; private. Authorised access only.
          </p>
        </motion.div>
      </main>
    </div>
    </div>
  )
}
