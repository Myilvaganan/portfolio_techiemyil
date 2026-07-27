import type { ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  className?: string
}

export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <div className={`group/tooltip relative ${className ?? ''}`}>
      {children}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 translate-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-text-secondary opacity-0 shadow-lg transition-all duration-150 group-hover/tooltip:translate-y-0 group-hover/tooltip:opacity-100"
      >
        {content}
      </div>
    </div>
  )
}
