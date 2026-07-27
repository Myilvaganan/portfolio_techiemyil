import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps {
  children: ReactNode
  className?: string
  as?: 'div' | 'section'
}

export function Container({ children, className, as = 'div' }: ContainerProps) {
  const Comp = as
  return <Comp className={cn('mx-auto w-full max-w-[1440px] px-6 md:px-10 lg:px-16', className)}>{children}</Comp>
}
