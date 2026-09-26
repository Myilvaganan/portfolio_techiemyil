import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { IconBadge } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

/** A friendly "nothing here yet" block: coloured icon, a title, a hint and an optional action. */
export function EmptyState({ icon, title, hint, action, className }: { icon: LucideIcon; title: string; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <IconBadge icon={icon} seed={title} size="lg" className="rounded-3xl" />
      <p className="card-title">{title}</p>
      {hint && <p className="max-w-sm text-sm text-text-secondary">{hint}</p>}
      {action}
    </div>
  )
}
