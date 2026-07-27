import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-surface-3 px-3 py-1 text-xs font-medium text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  )
}
