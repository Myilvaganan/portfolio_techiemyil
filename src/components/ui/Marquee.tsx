import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MarqueeProps {
  children: ReactNode
  reverse?: boolean
  className?: string
  pauseOnHover?: boolean
}

export function Marquee({ children, reverse = false, className, pauseOnHover = true }: MarqueeProps) {
  return (
    <div className={cn('group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]', className)}>
      <div
        className={cn(
          'flex shrink-0 items-center gap-6',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          'flex shrink-0 items-center gap-6',
          reverse ? 'animate-marquee-reverse' : 'animate-marquee',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
      >
        {children}
      </div>
    </div>
  )
}
