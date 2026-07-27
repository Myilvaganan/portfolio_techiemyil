import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, MapPin, Calendar, Building2 } from 'lucide-react'
import type { ExperienceEntry } from '@/types'
import { GlassCard } from '@/components/ui/GlassCard'
import { Chip } from '@/components/ui/Chip'

export function ExperienceCard({ entry, index }: { entry: ExperienceEntry; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const visibleAchievements = expanded ? entry.achievements : entry.achievements.slice(0, 2)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6 }}
      className="relative pl-14 sm:pl-20"
    >
      <div className="absolute left-0 top-1 flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-accent/25 bg-white p-2 sm:h-14 sm:w-14">
        {entry.logo ? (
          <img
            src={entry.logo}
            alt={`${entry.companyShort} logo`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="font-display text-sm font-bold text-accent">
            {entry.companyShort.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <GlassCard className="p-6 sm:p-7">
        {entry.current && (
          <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#05130a]">
            Current
          </span>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-card-title font-semibold text-text">{entry.role}</h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-accent">
              <Building2 className="h-3.5 w-3.5" />
              {entry.company}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {entry.duration}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {entry.location}
          </span>
          {entry.client && <Chip>Client: {entry.client}</Chip>}
        </div>

        <ul className="mt-5 space-y-3">
          {visibleAchievements.map((achievement, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-text-secondary">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
              {achievement}
            </li>
          ))}
        </ul>

        {entry.achievements.length > 2 && (
          <button
            onClick={() => setExpanded((prev) => !prev)}
            data-cursor="hover"
            className="mt-5 flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            {expanded ? 'Show less' : `Show ${entry.achievements.length - 2} more achievements`}
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        )}
      </GlassCard>
    </motion.div>
  )
}
