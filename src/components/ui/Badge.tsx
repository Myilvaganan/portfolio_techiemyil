import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps {
  children: ReactNode
  className?: string
  dot?: boolean
}

export function Badge({ children, className, dot = true }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border bg-surface-3 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary',
        className,
      )}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      )}
      {children}
    </span>
  )
}
