import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/Button'
import { experience } from '@/data/experience'

export function ExperiencePanel() {
  return (
    <GlassCard hover={false} className="flex h-full flex-col p-5">
      <h2 className="font-display text-lg font-semibold text-text">Professional Experience</h2>
      <div className="mt-4 flex-1 space-y-4">
        {experience.map((entry) => (
          <div key={entry.id} className="flex gap-3">
            {entry.logo && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-accent/25 bg-white p-1.5">
                <img src={entry.logo} alt={`${entry.companyShort} logo`} className="h-full w-full object-contain" />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-sm font-semibold text-text">{entry.companyShort}</p>
                {entry.current && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    Current
                  </span>
                )}
              </div>
              <p className="text-xs text-accent">{entry.role}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-text-secondary">
                <span>{entry.duration}</span>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {entry.location}
                </span>
                {entry.client && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Client: {entry.client}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Link to="/#experience" className="mt-5">
        <Button size="sm" variant="secondary" className="w-full">
          View Full Experience
        </Button>
      </Link>
    </GlassCard>
  )
}
