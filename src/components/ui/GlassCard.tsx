import { type HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative rounded-[24px] border border-border bg-card/70 backdrop-blur-sm',
          'shadow-[0_1px_0_0_var(--card-inset-highlight)_inset]',
          hover &&
            'transition-all duration-500 ease-out hover:-translate-y-1 hover:border-accent/30 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
GlassCard.displayName = 'GlassCard'
