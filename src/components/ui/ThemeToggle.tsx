import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

const NEXT: Record<Theme, { next: Theme; label: string }> = {
  dark: { next: 'light', label: 'Switch to light theme' },
  light: { next: 'royal', label: 'Switch to royal theme' },
  royal: { next: 'dark', label: 'Switch to dark theme' },
}

// The icon shows the theme you will get by clicking.
const ICON = { dark: Sun, light: Crown, royal: Moon } as const

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, cycleTheme } = useTheme()
  const Icon = ICON[theme]

  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={cycleTheme}
      aria-label={NEXT[theme].label}
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border text-text-secondary transition-colors hover:border-accent/40 hover:text-text',
        theme === 'royal' && 'royal-shine',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="flex items-center justify-center"
        >
          <Icon className="h-4 w-4" />
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
