import { GlassCard } from '@/components/ui/GlassCard'
import { services } from '@/data/services'

const featured = ['full-stack', 'cloud-architecture', 'ai-applications']
const highlights = featured.map((id) => services.find((s) => s.id === id)!).filter(Boolean)

export function ExpertisePanel() {
  return (
    <GlassCard hover={false} className="flex h-full flex-col p-5">
      <h2 className="font-display text-lg font-semibold text-text">Core Expertise</h2>
      <div className="mt-5 space-y-5">
        {highlights.map((service) => (
          <div key={service.id} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <service.icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">{service.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{service.description}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
