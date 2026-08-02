import type { LucideIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'

export function PlaceholderScreen({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      </div>

      <GlassCard hover={false} className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Icon className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium text-text">This section isn't built yet</p>
        <p className="max-w-sm text-sm text-text-secondary">
          {title} management is on the roadmap. Let me know if you'd like this wired up next.
        </p>
      </GlassCard>
    </div>
  )
}
