import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react'
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
const label = 'mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary'

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginError, setLoginError] = useState<string | null>(null)
  const [needCode, setNeedCode] = useState(false)
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
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <ThemeToggle className="absolute right-6 top-6" />

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="w-full max-w-sm">
        <GlassCard hover={false} className="p-8">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-3 text-accent">
              {needCode ? <KeyRound className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-text">{needCode ? 'Two-step verification' : 'Document Vault'}</h1>
              <p className="mt-1 text-sm text-text-secondary">{needCode ? 'Enter the 6-digit code from your authenticator app, or a recovery code.' : 'Sign in to continue'}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className={needCode ? 'hidden' : ''}>
              <label htmlFor="admin-username" className={label}>
                Username
              </label>
              <input id="admin-username" autoComplete="username" {...register('username', { required: 'Username is required' })} className={field} />
              {errors.username && <p className="mt-1.5 text-xs text-error">{errors.username.message}</p>}
            </div>

            <div className={needCode ? 'hidden' : ''}>
              <label htmlFor="admin-password" className={label}>
                Password
              </label>
              <input id="admin-password" type="password" autoComplete="current-password" {...register('password', { required: 'Password is required' })} className={field} />
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
      </motion.div>
    </div>
  )
}
