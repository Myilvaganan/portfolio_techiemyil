import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { motion } from 'framer-motion'
import { Loader2, Lock, ShieldCheck } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { loginAdmin } from '@/lib/adminVault'

interface LoginValues {
  username: string
  password: string
}

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [loginError, setLoginError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>()

  async function onSubmit(data: LoginValues) {
    setLoginError(null)
    try {
      await loginAdmin(data.username, data.password)
      onSuccess()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <ThemeToggle className="absolute right-6 top-6" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <GlassCard hover={false} className="p-8">
          <div className="mb-7 flex flex-col items-center gap-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-3 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-text">Document Vault</h1>
              <p className="mt-1 text-sm text-text-secondary">Sign in to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
                Username
              </label>
              <input
                id="admin-username"
                autoComplete="username"
                {...register('username', { required: 'Username is required' })}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
              />
              {errors.username && <p className="mt-1.5 text-xs text-error">{errors.username.message}</p>}
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-2 block text-xs font-medium uppercase tracking-wide text-text-secondary">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                {...register('password', { required: 'Password is required' })}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent/50"
              />
              {errors.password && <p className="mt-1.5 text-xs text-error">{errors.password.message}</p>}
            </div>

            {loginError && <p className="text-xs text-error">{loginError}</p>}

            <Button type="submit" disabled={isSubmitting} magnetic={false} className="w-full">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Sign In
            </Button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  )
}
