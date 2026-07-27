import { useRef } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'
import { experience } from '@/data/experience'
import { ExperienceCard } from './ExperienceCard'

export function ExperienceTimeline() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.6'],
  })
  const progressHeight = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })

  return (
    <div ref={ref} className="relative space-y-10">
      <div className="absolute left-[22px] top-2 bottom-2 w-px bg-surface-7 sm:left-7" />
      <motion.div
        style={{ scaleY: progressHeight }}
        className="absolute left-[22px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-accent to-accent-hover/40 sm:left-7"
      />
      {experience.map((entry, i) => (
        <ExperienceCard key={entry.id} entry={entry} index={i} />
      ))}
    </div>
  )
}
