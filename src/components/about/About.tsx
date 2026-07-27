import { motion } from 'framer-motion'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { AboutHighlightCard } from './AboutHighlightCard'
import { aboutHighlights } from '@/data/about-highlights'
import { personal } from '@/data/personal'
import { education } from '@/data/education'
import { GraduationCap } from 'lucide-react'

export function About() {
  return (
    <section id="about" className="relative py-section">
      <Container className="grid gap-16 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHeading eyebrow="About Me" title="Engineering with intent, at scale" accentWord="intent," />
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 text-body-lg leading-relaxed text-text-secondary"
          >
            {personal.longSummary}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10 rounded-2xl border border-border bg-card/40 p-6"
          >
            <div className="flex items-center gap-3 text-text">
              <GraduationCap className="h-5 w-5 text-accent" />
              <h3 className="text-sm font-semibold">Education</h3>
            </div>
            <ul className="mt-4 space-y-4">
              {education.map((edu) => (
                <li key={edu.id} className="flex flex-col gap-0.5 border-l border-border pl-4">
                  <span className="text-sm font-medium text-text">{edu.degree}</span>
                  <span className="text-xs text-text-secondary">
                    {edu.institution} · {edu.duration} · {edu.detail}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <div className="flex flex-col gap-4">
          {aboutHighlights.map((highlight, i) => (
            <AboutHighlightCard key={highlight.id} highlight={highlight} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}
