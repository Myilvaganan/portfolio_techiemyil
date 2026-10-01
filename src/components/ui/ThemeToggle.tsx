import { AnimatePresence, motion } from 'framer-motion'
import { Crown, Gem, Moon, Sun } from 'lucide-react'
import { isRoyal, useTheme, type Theme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

const NEXT: Record<Theme, { next: Theme; label: string }> = {
  dark: { next: 'light', label: 'Switch to light theme' },
  light: { next: 'royal-light', label: 'Switch to royal light theme' },
  'royal-light': { next: 'royal', label: 'Switch to royal dark theme' },
  royal: { next: 'dark', label: 'Switch to dark theme' },
}

// The icon shows the theme you will get by clicking.
const ICON = { dark: Sun, light: Gem, 'royal-light': Crown, royal: Moon } as const

/** `simple` flips only between light and dark (the admin's Noir look has no royal variants). */
export function ThemeToggle({ className, simple = false }: { className?: string; simple?: boolean }) {
  const { theme, cycleTheme, toggleTheme } = useTheme()
  const Icon = simple ? (theme === 'light' ? Moon : Sun) : ICON[theme]
  const label = simple ? (theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme') : NEXT[theme].label

  return (
    <button
      type="button"
      data-cursor="hover"
      onClick={simple ? toggleTheme : cycleTheme}
      aria-label={label}
      className={cn(
        'btn-3d glitter relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-3 text-text-secondary transition-colors hover:border-accent/40 hover:text-text',
        isRoyal(theme) && 'royal-shine',
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
